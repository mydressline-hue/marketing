import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

// ---------------------------------------------------------------------------
// useApiQuery – GET data from an endpoint with loading / error / refetch
// ---------------------------------------------------------------------------

interface UseApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApiQuery<T>(endpoint: string | null): UseApiQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!!endpoint);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (!endpoint) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<T>(endpoint);
      if (mountedRef.current) {
        setData(result);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [endpoint]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// ---------------------------------------------------------------------------
// useApiMutation – POST / PUT / DELETE with loading / error
// ---------------------------------------------------------------------------

type HttpMethod = 'POST' | 'PUT' | 'DELETE';

interface UseApiMutationResult<T> {
  mutate: (body?: unknown) => Promise<T | null>;
  loading: boolean;
  error: string | null;
}

export function useApiMutation<T>(
  endpoint: string,
  method: HttpMethod = 'POST',
): UseApiMutationResult<T> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (body?: unknown): Promise<T | null> => {
      setLoading(true);
      setError(null);
      try {
        let result: T;
        switch (method) {
          case 'PUT':
            result = await api.put<T>(endpoint, body);
            break;
          case 'DELETE':
            result = await api.delete<T>(endpoint);
            break;
          default:
            result = await api.post<T>(endpoint, body);
        }
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred';
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [endpoint, method],
  );

  return { mutate, loading, error };
}
