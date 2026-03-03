import { useState, useRef, useCallback, useMemo, useEffect } from 'react';

export interface VirtualItem {
  index: number;
  offsetTop: number;
}

export interface UseVirtualListOptions {
  /** Height of each item in pixels */
  itemHeight: number;
  /** Height of the scrollable container in pixels */
  containerHeight: number;
  /** Number of extra items to render above and below the visible window (default: 3) */
  overscan?: number;
}

export interface UseVirtualListResult<T> {
  /** The subset of items currently visible (plus overscan), with their index and offset */
  virtualItems: (VirtualItem & { item: T })[];
  /** Total height of all items, used to size the inner scroll container */
  totalHeight: number;
  /** Ref to attach to the scrollable container element */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Current scroll offset (useful for debugging / external logic) */
  scrollOffset: number;
  /** Programmatically scroll to a specific item index */
  scrollToIndex: (index: number) => void;
}

/**
 * A lightweight virtual list hook that only renders items within the visible
 * viewport (plus an overscan buffer). This avoids rendering hundreds or
 * thousands of DOM nodes for large data sets.
 *
 * Usage:
 *   const { virtualItems, totalHeight, containerRef } = useVirtualList(items, {
 *     itemHeight: 48,
 *     containerHeight: 400,
 *     overscan: 5,
 *   });
 */
export function useVirtualList<T>(
  items: T[],
  options: UseVirtualListOptions,
): UseVirtualListResult<T> {
  const { itemHeight, containerHeight, overscan = 3 } = options;
  const [scrollOffset, setScrollOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Handle scroll events
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (el) {
      setScrollOffset(el.scrollTop);
    }
  }, []);

  // Attach / detach scroll listener
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  // Total height of the entire list
  const totalHeight = items.length * itemHeight;

  // Calculate visible range with overscan
  const virtualItems = useMemo(() => {
    const count = items.length;
    if (count === 0 || containerHeight <= 0 || itemHeight <= 0) {
      return [];
    }

    const startIndex = Math.floor(scrollOffset / itemHeight);
    const visibleCount = Math.ceil(containerHeight / itemHeight);

    // Clamp to valid range with overscan
    const overscanStart = Math.max(0, startIndex - overscan);
    const overscanEnd = Math.min(count - 1, startIndex + visibleCount + overscan);

    const result: (VirtualItem & { item: T })[] = [];
    for (let i = overscanStart; i <= overscanEnd; i++) {
      result.push({
        index: i,
        offsetTop: i * itemHeight,
        item: items[i],
      });
    }
    return result;
  }, [items, scrollOffset, itemHeight, containerHeight, overscan]);

  // Programmatic scroll to a specific index
  const scrollToIndex = useCallback(
    (index: number) => {
      const el = containerRef.current;
      if (!el) return;
      const clampedIndex = Math.max(0, Math.min(index, items.length - 1));
      el.scrollTop = clampedIndex * itemHeight;
    },
    [items.length, itemHeight],
  );

  return {
    virtualItems,
    totalHeight,
    containerRef,
    scrollOffset,
    scrollToIndex,
  };
}
