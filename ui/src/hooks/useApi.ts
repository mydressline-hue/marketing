import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

// ---------------------------------------------------------------------------
// useApiQuery – fetch data on mount (GET by default)
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
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<T>(endpoint);
      if (mountedRef.current) {
        setData(result);
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err?.message ?? 'An unexpected error occurred');
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
// useApiMutation – trigger requests imperatively (POST / PUT / DELETE)
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
        setData(result);
        return result;
      } catch (err: any) {
        setError(err?.message ?? 'An unexpected error occurred');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [endpoint, method],
  );

  return { mutate, data, loading, error };
}
