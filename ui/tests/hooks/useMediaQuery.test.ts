import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useMediaQuery,
  useIsMobile,
  useIsTablet,
  useIsDesktop,
} from '../../src/hooks/useMediaQuery';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ChangeHandler = (e: MediaQueryListEvent) => void;

/**
 * Create a controllable matchMedia mock.  The mock stores registered listeners
 * so we can simulate media-query changes in tests.
 */
function createMatchMediaMock(defaultMatches: boolean) {
  const listeners: Map<string, Set<ChangeHandler>> = new Map();

  const matchMedia = vi.fn().mockImplementation((query: string) => {
    if (!listeners.has(query)) {
      listeners.set(query, new Set());
    }

    return {
      matches: defaultMatches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_event: string, handler: ChangeHandler) => {
        listeners.get(query)!.add(handler);
      }),
      removeEventListener: vi.fn((_event: string, handler: ChangeHandler) => {
        listeners.get(query)!.delete(handler);
      }),
      dispatchEvent: vi.fn(),
    };
  });

  /** Fire a change event for all listeners of a specific query. */
  const fireChange = (query: string, matches: boolean) => {
    const set = listeners.get(query);
    if (set) {
      for (const handler of set) {
        handler({ matches, media: query } as MediaQueryListEvent);
      }
    }
  };

  return { matchMedia, fireChange };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useMediaQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return the initial match state', () => {
    const { matchMedia } = createMatchMediaMock(true);
    Object.defineProperty(window, 'matchMedia', { writable: true, value: matchMedia });

    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));

    expect(result.current).toBe(true);
  });

  it('should return false when query does not match', () => {
    const { matchMedia } = createMatchMediaMock(false);
    Object.defineProperty(window, 'matchMedia', { writable: true, value: matchMedia });

    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'));

    expect(result.current).toBe(false);
  });

  it('should update when the media query match state changes', () => {
    const { matchMedia, fireChange } = createMatchMediaMock(false);
    Object.defineProperty(window, 'matchMedia', { writable: true, value: matchMedia });

    const query = '(min-width: 1024px)';
    const { result } = renderHook(() => useMediaQuery(query));

    expect(result.current).toBe(false);

    act(() => {
      fireChange(query, true);
    });

    expect(result.current).toBe(true);
  });

  it('should clean up the event listener on unmount', () => {
    const { matchMedia } = createMatchMediaMock(false);
    Object.defineProperty(window, 'matchMedia', { writable: true, value: matchMedia });

    const { unmount } = renderHook(() => useMediaQuery('(min-width: 1024px)'));

    unmount();

    // The hook calls matchMedia twice: once in useState initializer and once in
    // useEffect. The addEventListener/removeEventListener happen on the useEffect's
    // MQL object, which is the second call result.
    const mql = matchMedia.mock.results[1]?.value ?? matchMedia.mock.results[0].value;
    expect(mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});

describe('useIsMobile', () => {
  it('should call matchMedia with max-width: 767px', () => {
    const { matchMedia } = createMatchMediaMock(true);
    Object.defineProperty(window, 'matchMedia', { writable: true, value: matchMedia });

    const { result } = renderHook(() => useIsMobile());

    expect(matchMedia).toHaveBeenCalledWith('(max-width: 767px)');
    expect(result.current).toBe(true);
  });
});

describe('useIsTablet', () => {
  it('should call matchMedia with min-width: 768px and max-width: 1023px', () => {
    const { matchMedia } = createMatchMediaMock(true);
    Object.defineProperty(window, 'matchMedia', { writable: true, value: matchMedia });

    const { result } = renderHook(() => useIsTablet());

    expect(matchMedia).toHaveBeenCalledWith(
      '(min-width: 768px) and (max-width: 1023px)',
    );
    expect(result.current).toBe(true);
  });
});

describe('useIsDesktop', () => {
  it('should call matchMedia with min-width: 1024px', () => {
    const { matchMedia } = createMatchMediaMock(false);
    Object.defineProperty(window, 'matchMedia', { writable: true, value: matchMedia });

    const { result } = renderHook(() => useIsDesktop());

    expect(matchMedia).toHaveBeenCalledWith('(min-width: 1024px)');
    expect(result.current).toBe(false);
  });
});
