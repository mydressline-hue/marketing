import {
  createContext,
  useContext,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';

/** Shape of a single cache entry stored in the provider. */
interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  staleTime: number;
}

/** Publicly-exposed methods of the query cache. */
interface QueryCacheContextType {
  /** Retrieve a value from the cache. Returns `undefined` when missing or stale. */
  get: <T>(key: string) => T | undefined;
  /** Write a value into the cache with the given stale time (ms). */
  set: <T>(key: string, data: T, staleTime: number) => void;
  /** Remove a single key from the cache. */
  invalidate: (key: string) => void;
  /** Remove every key that starts with the given prefix. */
  invalidatePrefix: (prefix: string) => void;
  /** Completely empty the cache. */
  clear: () => void;
  /**
   * Deduplicate an in-flight request. If a request with the same key is
   * already in progress the existing promise is returned. Otherwise the
   * provided `fetcher` is called and tracked until it settles.
   */
  dedup: <T>(key: string, fetcher: () => Promise<T>) => Promise<T>;
}

const QueryCacheContext = createContext<QueryCacheContextType | null>(null);

/** Default stale time when none is specified (5 minutes). */
const DEFAULT_STALE_TIME = 5 * 60 * 1000;

/**
 * Light data-fetching cache provider.
 *
 * Wrap your component tree (typically at the app root) with `<QueryProvider>`
 * to enable response caching and in-flight request deduplication for every
 * hook that calls `useQueryCache()`.
 *
 * - Pure React – no external dependencies.
 * - Configurable per-key stale time.
 * - In-flight deduplication prevents the same endpoint from being fetched
 *   multiple times concurrently.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  // Both maps are stored in refs so writes never cause re-renders of the
  // entire tree. Individual consumers manage their own state.
  const cache = useRef<Map<string, CacheEntry>>(new Map());
  const inflight = useRef<Map<string, Promise<unknown>>>(new Map());

  const get = useCallback(<T,>(key: string): T | undefined => {
    const entry = cache.current.get(key);
    if (!entry) return undefined;
    const age = Date.now() - entry.timestamp;
    if (age > entry.staleTime) {
      cache.current.delete(key);
      return undefined;
    }
    return entry.data as T;
  }, []);

  const set = useCallback(
    <T,>(key: string, data: T, staleTime: number = DEFAULT_STALE_TIME) => {
      cache.current.set(key, { data, timestamp: Date.now(), staleTime });
    },
    [],
  );

  const invalidate = useCallback((key: string) => {
    cache.current.delete(key);
  }, []);

  const invalidatePrefix = useCallback((prefix: string) => {
    for (const key of cache.current.keys()) {
      if (key.startsWith(prefix)) {
        cache.current.delete(key);
      }
    }
  }, []);

  const clear = useCallback(() => {
    cache.current.clear();
  }, []);

  const dedup = useCallback(
    <T,>(key: string, fetcher: () => Promise<T>): Promise<T> => {
      const existing = inflight.current.get(key);
      if (existing) return existing as Promise<T>;

      const promise = fetcher().finally(() => {
        inflight.current.delete(key);
      });

      inflight.current.set(key, promise);
      return promise;
    },
    [],
  );

  return (
    <QueryCacheContext.Provider
      value={{ get, set, invalidate, invalidatePrefix, clear, dedup }}
    >
      {children}
    </QueryCacheContext.Provider>
  );
}

/**
 * Access the query cache from any descendant of `<QueryProvider>`.
 *
 * Throws if called outside the provider tree.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useQueryCache(): QueryCacheContextType {
  const ctx = useContext(QueryCacheContext);
  if (!ctx) {
    throw new Error('useQueryCache must be used within a <QueryProvider>');
  }
  return ctx;
}
