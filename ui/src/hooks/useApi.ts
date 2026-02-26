import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

// ---------------------------------------------------------------------------
// useApiQuery - fetch data from a GET endpoint
// ---------------------------------------------------------------------------

interface UseApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useApiQuery<T>(endpoint: string | null): UseApiQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!!endpoint);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (!endpoint) {
      setData(null);
      setLoading(false);
      return;
    }

    // Cancel any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const result = await api.get<T>(endpoint);
      setData(result);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    fetchData();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// ---------------------------------------------------------------------------
// useApiMutation - POST / PUT / PATCH / DELETE
// ---------------------------------------------------------------------------

interface UseApiMutationResult<T> {
  mutate: (data?: unknown) => Promise<T | null>;
  loading: boolean;
  error: Error | null;
}

export function useApiMutation<T>(
  endpoint: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
): UseApiMutationResult<T> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (body?: unknown): Promise<T | null> => {
      setLoading(true);
      setError(null);
      try {
        let result: T;
        switch (method) {
          case 'POST':
            result = await api.post<T>(endpoint, body);
            break;
          case 'PUT':
            result = await api.put<T>(endpoint, body);
            break;
          case 'PATCH':
            result = await api.patch<T>(endpoint, body);
            break;
          case 'DELETE':
            result = await api.delete<T>(endpoint);
            break;
        }
        return result;
      } catch (err) {
        const wrapped = err instanceof Error ? err : new Error(String(err));
        setError(wrapped);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [endpoint, method],
  );

  return { mutate, loading, error };
}
