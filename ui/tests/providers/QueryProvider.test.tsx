import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryProvider, useQueryCache } from '../../src/providers/QueryProvider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryProvider, null, children);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QueryProvider', () => {
  describe('cache set / get', () => {
    it('should store and retrieve a value', () => {
      const { result } = renderHook(() => useQueryCache(), { wrapper });

      act(() => {
        result.current.set('key1', { name: 'test' }, 60_000);
      });

      expect(result.current.get('key1')).toEqual({ name: 'test' });
    });

    it('should return undefined for a key that was never set', () => {
      const { result } = renderHook(() => useQueryCache(), { wrapper });

      expect(result.current.get('nonexistent')).toBeUndefined();
    });

    it('should overwrite an existing key on re-set', () => {
      const { result } = renderHook(() => useQueryCache(), { wrapper });

      act(() => {
        result.current.set('key1', 'first', 60_000);
      });

      act(() => {
        result.current.set('key1', 'second', 60_000);
      });

      expect(result.current.get('key1')).toBe('second');
    });
  });

  describe('stale entries', () => {
    it('should return undefined for entries that have exceeded their staleTime', () => {
      const { result } = renderHook(() => useQueryCache(), { wrapper });

      // Use a very short staleTime.
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      act(() => {
        result.current.set('stale-key', { data: 'old' }, 100);
      });

      // Advance time past the staleTime.
      vi.spyOn(Date, 'now').mockReturnValue(now + 200);

      expect(result.current.get('stale-key')).toBeUndefined();

      vi.restoreAllMocks();
    });

    it('should return the value when within staleTime', () => {
      const { result } = renderHook(() => useQueryCache(), { wrapper });

      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      act(() => {
        result.current.set('fresh-key', { data: 'new' }, 10_000);
      });

      // Within staleTime
      vi.spyOn(Date, 'now').mockReturnValue(now + 5_000);

      expect(result.current.get('fresh-key')).toEqual({ data: 'new' });

      vi.restoreAllMocks();
    });
  });

  describe('invalidate', () => {
    it('should remove a specific key from the cache', () => {
      const { result } = renderHook(() => useQueryCache(), { wrapper });

      act(() => {
        result.current.set('a', 1, 60_000);
        result.current.set('b', 2, 60_000);
      });

      act(() => {
        result.current.invalidate('a');
      });

      expect(result.current.get('a')).toBeUndefined();
      expect(result.current.get('b')).toBe(2);
    });
  });

  describe('invalidatePrefix', () => {
    it('should remove all keys matching the given prefix', () => {
      const { result } = renderHook(() => useQueryCache(), { wrapper });

      act(() => {
        result.current.set('query:/campaigns:1', 'c1', 60_000);
        result.current.set('query:/campaigns:2', 'c2', 60_000);
        result.current.set('query:/users:1', 'u1', 60_000);
      });

      act(() => {
        result.current.invalidatePrefix('query:/campaigns');
      });

      expect(result.current.get('query:/campaigns:1')).toBeUndefined();
      expect(result.current.get('query:/campaigns:2')).toBeUndefined();
      expect(result.current.get('query:/users:1')).toBe('u1');
    });

    it('should not remove keys that do not match the prefix', () => {
      const { result } = renderHook(() => useQueryCache(), { wrapper });

      act(() => {
        result.current.set('foo', 'bar', 60_000);
        result.current.set('baz', 'qux', 60_000);
      });

      act(() => {
        result.current.invalidatePrefix('foo');
      });

      expect(result.current.get('baz')).toBe('qux');
    });
  });

  describe('clear', () => {
    it('should remove all entries from the cache', () => {
      const { result } = renderHook(() => useQueryCache(), { wrapper });

      act(() => {
        result.current.set('x', 1, 60_000);
        result.current.set('y', 2, 60_000);
        result.current.set('z', 3, 60_000);
      });

      act(() => {
        result.current.clear();
      });

      expect(result.current.get('x')).toBeUndefined();
      expect(result.current.get('y')).toBeUndefined();
      expect(result.current.get('z')).toBeUndefined();
    });
  });

  describe('dedup', () => {
    it('should return the same promise for concurrent calls with the same key', async () => {
      const { result } = renderHook(() => useQueryCache(), { wrapper });

      let resolvePromise: (v: string) => void;
      const fetcher = vi.fn(
        () =>
          new Promise<string>((resolve) => {
            resolvePromise = resolve;
          }),
      );

      let promise1: Promise<string>;
      let promise2: Promise<string>;

      act(() => {
        promise1 = result.current.dedup('dedup-key', fetcher);
        promise2 = result.current.dedup('dedup-key', fetcher);
      });

      // The fetcher should only be called once because the second call is deduped.
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(promise1!).toBe(promise2!);

      // Resolve and verify both promises yield the same result.
      await act(async () => {
        resolvePromise!('result');
        const [r1, r2] = await Promise.all([promise1!, promise2!]);
        expect(r1).toBe('result');
        expect(r2).toBe('result');
      });
    });

    it('should allow a new request after the previous one settles', async () => {
      const { result } = renderHook(() => useQueryCache(), { wrapper });

      const fetcher1 = vi.fn().mockResolvedValue('first');
      const fetcher2 = vi.fn().mockResolvedValue('second');

      await act(async () => {
        const r1 = await result.current.dedup('key', fetcher1);
        expect(r1).toBe('first');
      });

      // After the first request settled, a new dedup call should invoke the new fetcher.
      await act(async () => {
        const r2 = await result.current.dedup('key', fetcher2);
        expect(r2).toBe('second');
      });

      expect(fetcher1).toHaveBeenCalledTimes(1);
      expect(fetcher2).toHaveBeenCalledTimes(1);
    });

    it('should clean up inflight entry even when the fetcher rejects', async () => {
      const { result } = renderHook(() => useQueryCache(), { wrapper });

      const failingFetcher = vi.fn().mockRejectedValue(new Error('fail'));
      const successFetcher = vi.fn().mockResolvedValue('ok');

      await act(async () => {
        try {
          await result.current.dedup('err-key', failingFetcher);
        } catch {
          // expected
        }
      });

      // After the rejected promise, a new call should work.
      await act(async () => {
        const r = await result.current.dedup('err-key', successFetcher);
        expect(r).toBe('ok');
      });

      expect(successFetcher).toHaveBeenCalledTimes(1);
    });
  });

  describe('useQueryCache outside provider', () => {
    it('should throw when used outside QueryProvider', () => {
      // Suppress React error boundary console output.
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useQueryCache());
      }).toThrow('useQueryCache must be used within a <QueryProvider>');

      spy.mockRestore();
    });
  });
});
