import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

// ---------------------------------------------------------------------------
// useApiQuery - fetches data from an API endpoint with polling support
// ---------------------------------------------------------------------------

interface UseApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApiQuery<T>(
  endpoint: string,
  options?: { pollInterval?: number },
): UseApiQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const endpointRef = useRef(endpoint);
  endpointRef.current = endpoint;

  const fetchData = useCallback(async () => {
    try {
      setLoading((prev) => (data === null ? true : prev));
      const result = await api.get<T>(endpointRef.current);
      if (mountedRef.current) {
        setData(result);
        setError(null);
        setLoading(false);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        setLoading(false);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    fetchData();

    let intervalId: ReturnType<typeof setInterval> | undefined;
    if (options?.pollInterval) {
      intervalId = setInterval(fetchData, options.pollInterval);
    }

    return () => {
      mountedRef.current = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [endpoint, options?.pollInterval, fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// ---------------------------------------------------------------------------
// useWebSocket - connects to a WebSocket for real-time updates
// ---------------------------------------------------------------------------

interface WebSocketMessage {
  type: string;
  payload: unknown;
}

interface UseWebSocketResult {
  connected: boolean;
  lastMessage: WebSocketMessage | null;
  subscribe: (type: string, callback: (payload: unknown) => void) => () => void;
}

export function useWebSocket(): UseWebSocketResult {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const subscribersRef = useRef<Map<string, Set<(payload: unknown) => void>>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsBase = import.meta.env.VITE_WS_BASE || `${wsProtocol}//${window.location.host}`;
    const wsUrl = `${wsBase}/ws`;

    function connect() {
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => setConnected(true);

        ws.onclose = () => {
          setConnected(false);
          // Attempt reconnect after 5 seconds
          reconnectTimeoutRef.current = setTimeout(connect, 5000);
        };

        ws.onerror = () => {
          // The onclose handler will fire after onerror, triggering reconnect
          setConnected(false);
        };

        ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            setLastMessage(message);

            const handlers = subscribersRef.current.get(message.type);
            if (handlers) {
              handlers.forEach((cb) => cb(message.payload));
            }
          } catch {
            // Ignore malformed messages
          }
        };
      } catch {
        // Connection failed, retry after delay
        reconnectTimeoutRef.current = setTimeout(connect, 5000);
      }
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect on intentional close
        wsRef.current.close();
      }
    };
  }, []);

  const subscribe = useCallback(
    (type: string, callback: (payload: unknown) => void) => {
      if (!subscribersRef.current.has(type)) {
        subscribersRef.current.set(type, new Set());
      }
      subscribersRef.current.get(type)!.add(callback);

      // Return unsubscribe function
      return () => {
        const handlers = subscribersRef.current.get(type);
        if (handlers) {
          handlers.delete(callback);
          if (handlers.size === 0) {
            subscribersRef.current.delete(type);
          }
        }
      };
    },
    [],
  );

  return { connected, lastMessage, subscribe };
}
