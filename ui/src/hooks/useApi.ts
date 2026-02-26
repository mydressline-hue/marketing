import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

interface UseApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

interface UseApiMutationResult<T> {
  mutate: (data?: unknown) => Promise<T>;
  loading: boolean;
  error: Error | null;
}

export function useApiQuery<T>(endpoint: string | null): UseApiQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const endpointRef = useRef(endpoint);

  const fetchData = useCallback(async () => {
    if (!endpoint) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<T>(endpoint);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    endpointRef.current = endpoint;
    fetchData();
  }, [fetchData]);

  const refetch = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch };
}

export function useApiMutation<T>(
  endpoint: string,
  method: 'POST' | 'PUT' | 'DELETE' = 'POST'
): UseApiMutationResult<T> {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (data?: unknown): Promise<T> => {
      setLoading(true);
      setError(null);
      try {
        let result: T;
        switch (method) {
          case 'PUT':
            result = await api.put<T>(endpoint, data);
            break;
          case 'DELETE':
            result = await api.delete<T>(endpoint);
            break;
          default:
            result = await api.post<T>(endpoint, data);
            break;
        }
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [endpoint, method]
  );

  return { mutate, loading, error };
}
