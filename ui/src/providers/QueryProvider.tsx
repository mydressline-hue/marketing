import { createContext, useContext, useRef, useCallback, type ReactNode } from 'react';

interface QueryCacheEntry {
  data: unknown;
  timestamp: number;
  staleTime: number;
}

interface QueryClient {
  cache: Map<string, QueryCacheEntry>;
  get: (key: string) => QueryCacheEntry | undefined;
  set: (key: string, data: unknown, staleTime?: number) => void;
  invalidate: (key: string) => void;
  invalidateAll: () => void;
}

const QueryClientContext = createContext<QueryClient | null>(null);

const DEFAULT_STALE_TIME = 5 * 60 * 1000; // 5 minutes

export function QueryProvider({ children }: { children: ReactNode }) {
  const cacheRef = useRef<Map<string, QueryCacheEntry>>(new Map());

  const get = useCallback((key: string): QueryCacheEntry | undefined => {
    const entry = cacheRef.current.get(key);
    if (!entry) return undefined;
    const isStale = Date.now() - entry.timestamp > entry.staleTime;
    if (isStale) {
      cacheRef.current.delete(key);
      return undefined;
    }
    return entry;
  }, []);

  const set = useCallback((key: string, data: unknown, staleTime = DEFAULT_STALE_TIME) => {
    cacheRef.current.set(key, {
      data,
      timestamp: Date.now(),
      staleTime,
    });
  }, []);

  const invalidate = useCallback((key: string) => {
    cacheRef.current.delete(key);
  }, []);

  const invalidateAll = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  const client: QueryClient = {
    cache: cacheRef.current,
    get,
    set,
    invalidate,
    invalidateAll,
  };

  return (
    <QueryClientContext.Provider value={client}>
      {children}
    </QueryClientContext.Provider>
  );
}

export function useQueryClient(): QueryClient {
  const client = useContext(QueryClientContext);
  if (!client) {
    throw new Error('useQueryClient must be used within a QueryProvider');
  }
  return client;
}
