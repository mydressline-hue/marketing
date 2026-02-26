import { useState, useEffect, useCallback, useRef } from 'react';

interface WebSocketMessage {
  type: string;
  payload: unknown;
  timestamp: string;
}

interface UseWebSocketResult {
  connected: boolean;
  lastMessage: WebSocketMessage | null;
  subscribe: (type: string, callback: (payload: unknown) => void) => () => void;
}

export function useWebSocket(): UseWebSocketResult {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const subscribersRef = useRef<Map<string, Set<(payload: unknown) => void>>>(new Map());

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    function connect() {
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => setConnected(true);

        ws.onclose = () => {
          setConnected(false);
          // Reconnect after 3 seconds
          setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          setConnected(false);
        };

        ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            setLastMessage(message);

            // Notify subscribers for this message type
            const callbacks = subscribersRef.current.get(message.type);
            if (callbacks) {
              callbacks.forEach((cb) => cb(message.payload));
            }

            // Notify wildcard subscribers
            const wildcardCallbacks = subscribersRef.current.get('*');
            if (wildcardCallbacks) {
              wildcardCallbacks.forEach((cb) => cb(message));
            }
          } catch {
            // Ignore malformed messages
          }
        };
      } catch {
        setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const subscribe = useCallback(
    (type: string, callback: (payload: unknown) => void): (() => void) => {
      if (!subscribersRef.current.has(type)) {
        subscribersRef.current.set(type, new Set());
      }
      subscribersRef.current.get(type)!.add(callback);

      return () => {
        const callbacks = subscribersRef.current.get(type);
        if (callbacks) {
          callbacks.delete(callback);
          if (callbacks.size === 0) {
            subscribersRef.current.delete(type);
          }
        }
      };
    },
    []
  );

  return { connected, lastMessage, subscribe };
}
