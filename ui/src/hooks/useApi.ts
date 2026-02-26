import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '../providers/QueryProvider';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

interface UseApiQueryOptions<T> {
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

interface UseApiQueryResult<T> {
  data: T | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

interface UseApiMutationOptions<TData, TVariables> {
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
  invalidateKeys?: string[];
}

interface UseApiMutationResult<TData, TVariables> {
  mutate: (variables: TVariables) => Promise<TData | undefined>;
  data: TData | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  reset: () => void;
}

async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `API Error ${response.status}: ${errorBody || response.statusText}`
    );
  }

  return response.json() as Promise<T>;
}

export function useApiQuery<T>(
  key: string,
  endpoint: string,
  options: UseApiQueryOptions<T> = {}
): UseApiQueryResult<T> {
  const { enabled = true, staleTime, refetchInterval, onSuccess, onError } = options;
  const queryClient = useQueryClient();
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    if (!mountedRef.current) return;

    // Check cache first
    const cached = queryClient.get(key);
    if (cached) {
      setData(cached.data as T);
      setIsLoading(false);
      setIsError(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setIsError(false);
    setError(null);

    try {
      const result = await apiFetch<T>(endpoint);
      if (!mountedRef.current) return;

      queryClient.set(key, result, staleTime);
      setData(result);
      setIsLoading(false);
      onSuccess?.(result);
    } catch (err) {
      if (!mountedRef.current) return;
      const apiError = err instanceof Error ? err : new Error(String(err));
      setError(apiError);
      setIsError(true);
      setIsLoading(false);
      onError?.(apiError);
    }
  }, [key, endpoint, queryClient, staleTime, onSuccess, onError]);

  const refetch = useCallback(async () => {
    queryClient.invalidate(key);
    await fetchData();
  }, [key, queryClient, fetchData]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      fetchData();
    }
    return () => {
      mountedRef.current = false;
    };
  }, [enabled, fetchData]);

  useEffect(() => {
    if (refetchInterval && enabled) {
      intervalRef.current = setInterval(() => {
        queryClient.invalidate(key);
        fetchData();
      }, refetchInterval);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [refetchInterval, enabled, key, queryClient, fetchData]);

  return { data, isLoading, isError, error, refetch };
}

export function useApiMutation<TData = unknown, TVariables = unknown>(
  endpoint: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
  options: UseApiMutationOptions<TData, TVariables> = {}
): UseApiMutationResult<TData, TVariables> {
  const { onSuccess, onError, invalidateKeys } = options;
  const queryClient = useQueryClient();
  const [data, setData] = useState<TData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const mutate = useCallback(
    async (variables: TVariables): Promise<TData | undefined> => {
      setIsLoading(true);
      setIsError(false);
      setError(null);

      try {
        const result = await apiFetch<TData>(endpoint, {
          method,
          body: JSON.stringify(variables),
        });

        if (!mountedRef.current) return undefined;

        setData(result);
        setIsLoading(false);

        // Invalidate related queries
        if (invalidateKeys) {
          invalidateKeys.forEach((k) => queryClient.invalidate(k));
        }

        onSuccess?.(result, variables);
        return result;
      } catch (err) {
        if (!mountedRef.current) return undefined;
        const apiError = err instanceof Error ? err : new Error(String(err));
        setError(apiError);
        setIsError(true);
        setIsLoading(false);
        onError?.(apiError, variables);
        return undefined;
      }
    },
    [endpoint, method, queryClient, invalidateKeys, onSuccess, onError]
  );

  const reset = useCallback(() => {
    setData(null);
    setIsLoading(false);
    setIsError(false);
    setError(null);
  }, []);

  return { mutate, data, isLoading, isError, error, reset };
}
