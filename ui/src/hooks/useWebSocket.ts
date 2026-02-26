import { useEffect, useRef, useCallback, useState } from 'react';

/** Channels that the server supports for real-time updates. */
export type WebSocketChannel = 'agents' | 'alerts' | 'kpis' | 'killswitch' | string;

/** A parsed message received over the WebSocket connection. */
export interface WebSocketMessage<T = unknown> {
  channel: string;
  data: T;
  timestamp: string;
}

/** Configuration options for the useWebSocket hook. */
interface UseWebSocketOptions {
  /** Whether to connect automatically on mount. Defaults to `true`. */
  autoConnect?: boolean;
  /** Initial backoff delay (ms) for reconnection. Defaults to `1000`. */
  initialRetryDelay?: number;
  /** Maximum backoff delay (ms). Defaults to `30000`. */
  maxRetryDelay?: number;
  /** Maximum number of reconnection attempts. `0` = unlimited. Defaults to `0`. */
  maxRetries?: number;
}

type MessageHandler<T = unknown> = (message: WebSocketMessage<T>) => void;

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

/** Derive a WebSocket URL from the REST base URL. */
function buildWsUrl(): string {
  const loc = window.location;
  // If the API base is a full URL, convert its protocol.
  if (API_BASE.startsWith('http')) {
    return API_BASE.replace(/^http/, 'ws') + '/ws';
  }
  // Relative path – build from the current page origin.
  const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${loc.host}${API_BASE}/ws`;
}

/**
 * React hook for real-time WebSocket communication.
 *
 * Provides:
 * - Automatic connection on mount (configurable).
 * - Per-channel pub/sub via `subscribe` / `unsubscribe`.
 * - Exponential-backoff reconnection with jitter.
 * - Connection state tracking.
 *
 * ```tsx
 * const { connected, subscribe, lastMessage } = useWebSocket();
 *
 * useEffect(() => {
 *   const unsub = subscribe('alerts', (msg) => {
 *     console.log('New alert', msg.data);
 *   });
 *   return unsub;
 * }, [subscribe]);
 * ```
 */
export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    autoConnect = true,
    initialRetryDelay = 1000,
    maxRetryDelay = 30_000,
    maxRetries = 0,
  } = options;

  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const subscribedChannelsRef = useRef<Set<string>>(new Set());

  /** Send a JSON-encoded message to the server (if connected). */
  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  /** Tell the server we want messages for `channel`. */
  const sendSubscribe = useCallback(
    (channel: string) => {
      send({ action: 'subscribe', channel });
    },
    [send],
  );

  /** Tell the server we no longer want messages for `channel`. */
  const sendUnsubscribe = useCallback(
    (channel: string) => {
      send({ action: 'unsubscribe', channel });
    },
    [send],
  );

  // ---- connection logic ----

  const connect = useCallback(() => {
    // Avoid opening duplicate connections.
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    const url = buildWsUrl();
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
      retryCountRef.current = 0;

      // Re-subscribe to any channels that were active before reconnect.
      for (const ch of subscribedChannelsRef.current) {
        sendSubscribe(ch);
      }
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const msg: WebSocketMessage = JSON.parse(event.data);
        setLastMessage(msg);

        const channelHandlers = handlersRef.current.get(msg.channel);
        if (channelHandlers) {
          for (const handler of channelHandlers) {
            try {
              handler(msg);
            } catch {
              // Swallow handler errors so one bad listener can't crash others.
            }
          }
        }

        // Also notify wildcard subscribers.
        const wildcardHandlers = handlersRef.current.get('*');
        if (wildcardHandlers) {
          for (const handler of wildcardHandlers) {
            try {
              handler(msg);
            } catch {
              // Swallow.
            }
          }
        }
      } catch {
        // Non-JSON messages are silently ignored.
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      scheduleReconnect();
    };

    ws.onerror = () => {
      // The browser fires `onerror` right before `onclose`, so the actual
      // reconnection is handled in `onclose`. We just ensure the socket is
      // torn down cleanly.
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendSubscribe]);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    if (maxRetries > 0 && retryCountRef.current >= maxRetries) return;

    // Exponential backoff with jitter.
    const delay = Math.min(
      initialRetryDelay * Math.pow(2, retryCountRef.current),
      maxRetryDelay,
    );
    const jitter = delay * 0.3 * Math.random();

    retryTimerRef.current = setTimeout(() => {
      retryCountRef.current += 1;
      connect();
    }, delay + jitter);
  }, [connect, initialRetryDelay, maxRetryDelay, maxRetries]);

  const disconnect = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent reconnect loop
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, []);

  // ---- pub/sub ----

  /**
   * Subscribe to a channel. Returns an unsubscribe function suitable for use
   * as a React `useEffect` cleanup.
   */
  const subscribe = useCallback(
    <T = unknown>(channel: WebSocketChannel, handler: MessageHandler<T>): (() => void) => {
      if (!handlersRef.current.has(channel)) {
        handlersRef.current.set(channel, new Set());
      }
      handlersRef.current.get(channel)!.add(handler as MessageHandler);
      subscribedChannelsRef.current.add(channel);

      // Tell the server (if connected).
      sendSubscribe(channel);

      return () => {
        const set = handlersRef.current.get(channel);
        if (set) {
          set.delete(handler as MessageHandler);
          if (set.size === 0) {
            handlersRef.current.delete(channel);
            subscribedChannelsRef.current.delete(channel);
            sendUnsubscribe(channel);
          }
        }
      };
    },
    [sendSubscribe, sendUnsubscribe],
  );

  const unsubscribe = useCallback(
    (channel: WebSocketChannel) => {
      handlersRef.current.delete(channel);
      subscribedChannelsRef.current.delete(channel);
      sendUnsubscribe(channel);
    },
    [sendUnsubscribe],
  );

  // ---- lifecycle ----

  useEffect(() => {
    mountedRef.current = true;
    if (autoConnect) {
      connect();
    }
    return () => {
      mountedRef.current = false;
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    /** Whether the WebSocket connection is currently open. */
    connected,
    /** The most recent parsed message from any channel. */
    lastMessage,
    /** Subscribe to a channel; returns an unsubscribe function. */
    subscribe,
    /** Unsubscribe from a channel by name. */
    unsubscribe,
    /** Manually open the connection (usually not needed with `autoConnect`). */
    connect,
    /** Manually close the connection and stop reconnection attempts. */
    disconnect,
    /** Send a raw JSON-serialisable payload to the server. */
    send,
  };
}
