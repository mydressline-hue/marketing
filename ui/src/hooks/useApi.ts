/**
 * Custom React hooks for API data fetching and mutations.
 *
 * - useApiQuery<T>(endpoint) -- fetch data on mount, return { data, loading, error, refetch }
 * - useApiMutation<T>(endpoint, method?) -- return { mutate, loading, error }
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';

// ---------------------------------------------------------------------------
// useApiQuery
// ---------------------------------------------------------------------------

export interface UseApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetches data from `endpoint` on mount and whenever `endpoint` changes.
 * Returns reactive loading / error / data state plus a manual `refetch`.
 */
export function useApiQuery<T>(endpoint: string): UseApiQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Keep a ref to the latest endpoint so we can ignore stale responses.
  const endpointRef = useRef(endpoint);
  endpointRef.current = endpoint;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ success: boolean; data: T; meta?: unknown }>(endpoint);
      // Only update state if the endpoint hasn't changed during the fetch.
      if (endpointRef.current === endpoint) {
        // The backend wraps payloads in { success, data, meta }.
        // If the response has a `data` key we unwrap; otherwise treat the
        // whole response as the value (defensive).
        const payload = (response as Record<string, unknown>).data !== undefined
          ? (response as Record<string, unknown>).data as T
          : response as unknown as T;
        setData(payload);
      }
    } catch (err) {
      if (endpointRef.current === endpoint) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (endpointRef.current === endpoint) {
        setLoading(false);
      }
    }
  }, [endpoint]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// ---------------------------------------------------------------------------
// useApiMutation
// ---------------------------------------------------------------------------

export interface UseApiMutationResult<T> {
  mutate: (body?: unknown) => Promise<T | null>;
  loading: boolean;
  error: string | null;
}

/**
 * Returns a `mutate` function that sends a request to `endpoint` using
 * the given HTTP method (default POST). Tracks loading and error state.
 */
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
        let response: unknown;
        switch (method) {
          case 'POST':
            response = await api.post<{ success: boolean; data: T }>(endpoint, body);
            break;
          case 'PUT':
            response = await api.put<{ success: boolean; data: T }>(endpoint, body);
            break;
          case 'DELETE':
            response = await api.delete<{ success: boolean; data: T }>(endpoint);
            break;
        }

        const payload = (response as Record<string, unknown>).data !== undefined
          ? (response as Record<string, unknown>).data as T
          : response as unknown as T;
        return payload;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
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
