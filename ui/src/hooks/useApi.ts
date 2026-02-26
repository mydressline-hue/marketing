import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import { useQueryCache } from '../providers/QueryProvider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for the `useApiQuery` hook. */
export interface UseApiQueryOptions {
  /** If `false`, skip the initial fetch. Defaults to `true`. */
  enabled?: boolean;
  /** Time (ms) before a cached response is considered stale. Defaults to 5 min. */
  staleTime?: number;
  /** Polling interval (ms). Set to `0` or omit to disable. */
  refetchInterval?: number;
  /**
   * Optional query-string parameters that will be serialised and appended to
   * the endpoint. Changing these will trigger a refetch.
   */
  params?: Record<string, string | number | boolean | undefined | null>;
  /** When true, don't use cache at all (always fetch fresh). */
  skipCache?: boolean;
}

/** Return value of `useApiQuery`. */
export interface UseApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  /** Manually re-fetch, bypassing the cache. */
  refetch: () => Promise<void>;
}

/** HTTP methods supported by `useApiMutation`. */
export type MutationMethod = 'POST' | 'PUT' | 'DELETE';

/** Options for the `useApiMutation` hook. */
export interface UseApiMutationOptions {
  method?: MutationMethod;
  /** Cache keys/prefixes to invalidate after a successful mutation. */
  invalidates?: string[];
  /** Callback fired after a successful mutation. */
  onSuccess?: (data: unknown) => void;
  /** Callback fired after a failed mutation. */
  onError?: (error: Error) => void;
}

/** Return value of `useApiMutation`. */
export interface UseApiMutationResult<TResponse, TPayload = unknown> {
  data: TResponse | null;
  loading: boolean;
  error: Error | null;
  /** Execute the mutation. */
  mutate: (payload?: TPayload) => Promise<TResponse | null>;
  /** Reset data/error state back to idle. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a full endpoint with query-string parameters. */
function buildEndpoint(
  base: string,
  params?: Record<string, string | number | boolean | undefined | null>,
): string {
  if (!params) return base;
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null,
  );
  if (entries.length === 0) return base;
  const qs = entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${base}${base.includes('?') ? '&' : '?'}${qs}`;
}

/** Stable serialisation of params for use as a cache / dependency key. */
function paramsKey(
  params?: Record<string, string | number | boolean | undefined | null>,
): string {
  if (!params) return '';
  const sorted = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(sorted);
}

// ---------------------------------------------------------------------------
// useApiQuery
// ---------------------------------------------------------------------------

/**
 * Declarative data-fetching hook that wraps `api.get()` with automatic
 * caching, polling, loading/error state, and request deduplication (via
 * `QueryProvider`).
 *
 * ```ts
 * const { data, loading, error, refetch } = useApiQuery<Campaign[]>('/campaigns', {
 *   refetchInterval: 30_000,
 *   params: { country: selectedCountry },
 * });
 * ```
 */
export function useApiQuery<T = unknown>(
  endpoint: string,
  options: UseApiQueryOptions = {},
): UseApiQueryResult<T> {
  const {
    enabled = true,
    staleTime = 5 * 60 * 1000,
    refetchInterval = 0,
    params,
    skipCache = false,
  } = options;

  const cache = useQueryCache();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Build a cache key that includes the endpoint + serialised params.
  const cacheKey = `query:${endpoint}:${paramsKey(params)}`;
  const fullEndpoint = buildEndpoint(endpoint, params);

  const fetchData = useCallback(
    async (bypassCache = false) => {
      // Check cache first (unless explicitly skipped).
      if (!bypassCache && !skipCache) {
        const cached = cache.get<T>(cacheKey);
        if (cached !== undefined) {
          setData(cached);
          setError(null);
          return;
        }
      }

      setLoading(true);
      try {
        const result = await cache.dedup<T>(cacheKey, () =>
          api.get<T>(fullEndpoint),
        );
        if (!mountedRef.current) return;
        cache.set(cacheKey, result, staleTime);
        setData(result);
        setError(null);
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cacheKey, fullEndpoint, skipCache, staleTime],
  );

  const refetch = useCallback(async () => {
    cache.invalidate(cacheKey);
    await fetchData(true);
  }, [cache, cacheKey, fetchData]);

  // Initial fetch & refetch when deps change.
  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      fetchData();
    }
    return () => {
      mountedRef.current = false;
    };
  }, [enabled, fetchData]);

  // Polling.
  useEffect(() => {
    if (refetchInterval > 0 && enabled) {
      intervalRef.current = setInterval(() => {
        fetchData(true);
      }, refetchInterval);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [refetchInterval, enabled, fetchData]);

  return { data, loading, error, refetch };
}

// ---------------------------------------------------------------------------
// useApiMutation
// ---------------------------------------------------------------------------

/**
 * Imperative mutation hook for POST / PUT / DELETE operations.
 *
 * ```ts
 * const { mutate, loading } = useApiMutation<Campaign>('/campaigns', {
 *   method: 'POST',
 *   invalidates: ['/campaigns'],
 *   onSuccess: () => toast('Saved!'),
 * });
 *
 * await mutate({ name: 'Summer Sale' });
 * ```
 */
export function useApiMutation<TResponse = unknown, TPayload = unknown>(
  endpoint: string,
  options: UseApiMutationOptions = {},
): UseApiMutationResult<TResponse, TPayload> {
  const { method = 'POST', invalidates = [], onSuccess, onError } = options;

  const cache = useQueryCache();
  const [data, setData] = useState<TResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const mutate = useCallback(
    async (payload?: TPayload): Promise<TResponse | null> => {
      setLoading(true);
      setError(null);
      try {
        let result: TResponse;
        switch (method) {
          case 'POST':
            result = await api.post<TResponse>(endpoint, payload);
            break;
          case 'PUT':
            result = await api.put<TResponse>(endpoint, payload);
            break;
          case 'DELETE':
            result = await api.delete<TResponse>(endpoint);
            break;
        }
        if (!mountedRef.current) return null;
        setData(result);

        // Invalidate related cache entries.
        for (const key of invalidates) {
          cache.invalidatePrefix(`query:${key}`);
        }

        onSuccess?.(result);
        return result;
      } catch (err) {
        const wrapped = err instanceof Error ? err : new Error(String(err));
        if (!mountedRef.current) return null;
        setError(wrapped);
        onError?.(wrapped);
        return null;
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [endpoint, method, JSON.stringify(invalidates)],
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, loading, error, mutate, reset };
}
