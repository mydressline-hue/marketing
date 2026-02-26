import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

// ---------------------------------------------------------------------------
// useApiQuery – GET requests with auto-fetch, caching & refetch
// ---------------------------------------------------------------------------

interface UseApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApiQuery<T>(endpoint: string): UseApiQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const endpointRef = useRef(endpoint);
  endpointRef.current = endpoint;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<T>(endpointRef.current);
      setData(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, endpoint]);

  return { data, loading, error, refetch: fetchData };
}

// ---------------------------------------------------------------------------
// useApiMutation – POST / PUT / DELETE with manual trigger
// ---------------------------------------------------------------------------

interface UseApiMutationResult<T> {
  mutate: (body?: unknown) => Promise<T | null>;
  loading: boolean;
  error: string | null;
}

export function useApiMutation<T>(
  endpoint: string,
  method: 'POST' | 'PUT' | 'DELETE' = 'POST',
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
      } catch (err: unknown) {
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
