import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    total: number;
    page: number;
    totalPages: number;
  };
}

interface UseApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

interface UseApiMutationResult<T> {
  mutate: (body?: unknown) => Promise<T | null>;
  loading: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// useApiQuery – fetch data on mount and expose refetch
// ---------------------------------------------------------------------------

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
      const response = await api.get<ApiResponse<T>>(endpointRef.current);
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
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
// useApiMutation – fire on demand (POST / PUT / DELETE)
// ---------------------------------------------------------------------------

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
        let response: ApiResponse<T>;
        switch (method) {
          case 'PUT':
            response = await api.put<ApiResponse<T>>(endpoint, body);
            break;
          case 'DELETE':
            response = await api.delete<ApiResponse<T>>(endpoint);
            break;
          default:
            response = await api.post<ApiResponse<T>>(endpoint, body);
        }
        return response.data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Mutation failed';
        setError(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [endpoint, method],
  );

  return { mutate, loading, error };
}
