import { useState, useEffect, useRef, useCallback } from 'react';

type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface WebSocketMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp?: string;
}

interface UseWebSocketOptions {
  url?: string;
  enabled?: boolean;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onOpen?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
}

interface UseWebSocketResult<T = unknown> {
  status: WebSocketStatus;
  lastMessage: WebSocketMessage<T> | null;
  send: (data: WebSocketMessage) => void;
  subscribe: (type: string, handler: (payload: unknown) => void) => () => void;
}

const DEFAULT_WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.host}/ws`;

export function useWebSocket<T = unknown>(
  options: UseWebSocketOptions = {}
): UseWebSocketResult<T> {
  const {
    url = DEFAULT_WS_URL,
    enabled = true,
    reconnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
    onOpen,
    onClose,
    onError,
  } = options;

  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<WebSocketMessage<T> | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlersRef = useRef<Map<string, Set<(payload: unknown) => void>>>(new Map());
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled || !mountedRef.current) return;

    cleanup();
    setStatus('connecting');

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = (event: Event) => {
        if (!mountedRef.current) return;
        setStatus('connected');
        reconnectAttemptsRef.current = 0;
        onOpen?.(event);
      };

      ws.onmessage = (event: MessageEvent) => {
        if (!mountedRef.current) return;
        try {
          const message = JSON.parse(event.data) as WebSocketMessage<T>;
          setLastMessage(message);

          // Dispatch to type-specific handlers
          const typeHandlers = handlersRef.current.get(message.type);
          if (typeHandlers) {
            typeHandlers.forEach((handler) => handler(message.payload));
          }

          // Also dispatch to wildcard handlers
          const wildcardHandlers = handlersRef.current.get('*');
          if (wildcardHandlers) {
            wildcardHandlers.forEach((handler) => handler(message));
          }
        } catch {
          console.warn('[WebSocket] Failed to parse message:', event.data);
        }
      };

      ws.onclose = (event: CloseEvent) => {
        if (!mountedRef.current) return;
        setStatus('disconnected');
        onClose?.(event);

        if (reconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connect();
            }
          }, reconnectInterval);
        }
      };

      ws.onerror = (event: Event) => {
        if (!mountedRef.current) return;
        setStatus('error');
        onError?.(event);
      };
    } catch {
      if (mountedRef.current) {
        setStatus('error');
      }
    }
  }, [url, enabled, reconnect, reconnectInterval, maxReconnectAttempts, onOpen, onClose, onError, cleanup]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      connect();
    }
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [enabled, connect, cleanup]);

  const send = useCallback((data: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.warn('[WebSocket] Cannot send message, connection not open');
    }
  }, []);

  const subscribe = useCallback(
    (type: string, handler: (payload: unknown) => void): (() => void) => {
      if (!handlersRef.current.has(type)) {
        handlersRef.current.set(type, new Set());
      }
      handlersRef.current.get(type)!.add(handler);

      return () => {
        const handlers = handlersRef.current.get(type);
        if (handlers) {
          handlers.delete(handler);
          if (handlers.size === 0) {
            handlersRef.current.delete(type);
          }
        }
      };
    },
    []
  );

  return { status, lastMessage, send, subscribe };
}
