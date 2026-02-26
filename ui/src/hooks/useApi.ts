import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

// ---------------------------------------------------------------------------
// useApiQuery – GET data with optional auto-refresh
// ---------------------------------------------------------------------------

interface UseApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApiQuery<T>(
  endpoint: string,
  options?: { refreshInterval?: number },
): UseApiQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading((prev) => (data === null ? true : prev)); // only full-loading on first fetch
      const result = await api.get<T>(endpoint);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, [endpoint]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData();

    if (options?.refreshInterval) {
      intervalRef.current = setInterval(fetchData, options.refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchData, options?.refreshInterval]);

  return { data, loading, error, refetch: fetchData };
}

// ---------------------------------------------------------------------------
// useApiMutation – POST / PUT / DELETE
// ---------------------------------------------------------------------------

interface UseApiMutationResult<T> {
  mutate: (body?: unknown) => Promise<T | null>;
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useApiMutation<T>(
  endpoint: string,
  method: 'POST' | 'PUT' | 'DELETE' = 'POST',
): UseApiMutationResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (body?: unknown) => {
      try {
        setLoading(true);
        setError(null);
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
        setData(result);
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

  return { mutate, data, loading, error };
}
