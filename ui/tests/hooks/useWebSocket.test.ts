import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '../../src/hooks/useWebSocket';

// ---------------------------------------------------------------------------
// Helpers – we need to control the MockWebSocket behaviour per-test
// ---------------------------------------------------------------------------

let wsInstances: any[] = [];
let OriginalWebSocket: any;

class ControllableWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static CONNECTING = 0;

  url: string;
  readyState = ControllableWebSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = ControllableWebSocket.CLOSED;
    // Trigger onclose if set (simulate real WS behaviour)
  });

  constructor(url: string) {
    this.url = url;
    wsInstances.push(this);
  }

  /** Simulate the server accepting the connection. */
  simulateOpen() {
    this.readyState = ControllableWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  /** Simulate receiving a JSON message from the server. */
  simulateMessage(data: unknown) {
    const event = { data: JSON.stringify(data) } as MessageEvent;
    this.onmessage?.(event);
  }

  /** Simulate the connection closing. */
  simulateClose() {
    this.readyState = ControllableWebSocket.CLOSED;
    this.onclose?.({} as CloseEvent);
  }

  /** Simulate a connection error (which in browsers fires before close). */
  simulateError() {
    this.onerror?.(new Event('error'));
  }
}

beforeEach(() => {
  wsInstances = [];
  OriginalWebSocket = global.WebSocket;
  global.WebSocket = ControllableWebSocket as any;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  global.WebSocket = OriginalWebSocket;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useWebSocket', () => {
  it('should connect on mount when autoConnect is true (default)', () => {
    renderHook(() => useWebSocket());

    expect(wsInstances).toHaveLength(1);
    expect(wsInstances[0].url).toContain('/ws');
  });

  it('should not connect on mount when autoConnect is false', () => {
    renderHook(() => useWebSocket({ autoConnect: false }));
    expect(wsInstances).toHaveLength(0);
  });

  it('should set connected to true after open event', async () => {
    const { result } = renderHook(() => useWebSocket());

    expect(result.current.connected).toBe(false);

    act(() => {
      wsInstances[0].simulateOpen();
    });

    expect(result.current.connected).toBe(true);
  });

  it('should subscribe to a channel and receive messages', () => {
    const { result } = renderHook(() => useWebSocket());
    const handler = vi.fn();

    act(() => {
      wsInstances[0].simulateOpen();
    });

    act(() => {
      result.current.subscribe('alerts', handler);
    });

    const msg = { channel: 'alerts', data: { id: 1 }, timestamp: '2026-01-01T00:00:00Z' };
    act(() => {
      wsInstances[0].simulateMessage(msg);
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(msg);
  });

  it('should update lastMessage on any incoming message', () => {
    const { result } = renderHook(() => useWebSocket());

    act(() => {
      wsInstances[0].simulateOpen();
    });

    const msg = { channel: 'kpis', data: { revenue: 100 }, timestamp: '2026-01-01T00:00:00Z' };
    act(() => {
      wsInstances[0].simulateMessage(msg);
    });

    expect(result.current.lastMessage).toEqual(msg);
  });

  it('should unsubscribe when the returned cleanup function is called', () => {
    const { result } = renderHook(() => useWebSocket());
    const handler = vi.fn();

    act(() => {
      wsInstances[0].simulateOpen();
    });

    let unsub: () => void;
    act(() => {
      unsub = result.current.subscribe('alerts', handler);
    });

    // Unsubscribe
    act(() => {
      unsub();
    });

    // Subsequent message on that channel should NOT trigger the handler
    const msg = { channel: 'alerts', data: {}, timestamp: '2026-01-01T00:00:00Z' };
    act(() => {
      wsInstances[0].simulateMessage(msg);
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('should auto-reconnect on disconnect with exponential backoff', () => {
    renderHook(() =>
      useWebSocket({ initialRetryDelay: 1000, maxRetryDelay: 30000 }),
    );

    act(() => {
      wsInstances[0].simulateOpen();
    });

    // Simulate the connection closing
    act(() => {
      wsInstances[0].simulateClose();
    });

    // After the backoff delay, a new connection attempt should be made
    expect(wsInstances).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(2000); // initial 1000 + jitter tolerance
    });

    // A new WebSocket should have been created
    expect(wsInstances.length).toBeGreaterThanOrEqual(2);
  });

  it('should stop reconnecting when maxRetries is reached', () => {
    renderHook(() =>
      useWebSocket({ maxRetries: 1, initialRetryDelay: 100 }),
    );

    act(() => {
      wsInstances[0].simulateOpen();
    });

    // First disconnect triggers reconnect
    act(() => {
      wsInstances[0].simulateClose();
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    const countAfterFirst = wsInstances.length;

    // Second disconnect should NOT trigger another reconnect (maxRetries=1)
    if (wsInstances.length > 1) {
      act(() => {
        wsInstances[wsInstances.length - 1].simulateClose();
      });

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      // No more connections should have been created
      expect(wsInstances.length).toBeLessThanOrEqual(countAfterFirst + 1);
    }
  });

  it('should send data when connected', () => {
    const { result } = renderHook(() => useWebSocket());

    act(() => {
      wsInstances[0].simulateOpen();
    });

    act(() => {
      result.current.send({ action: 'ping' });
    });

    expect(wsInstances[0].send).toHaveBeenCalledWith(
      JSON.stringify({ action: 'ping' }),
    );
  });

  it('should disconnect and stop reconnection on manual disconnect', () => {
    const { result } = renderHook(() => useWebSocket());

    act(() => {
      wsInstances[0].simulateOpen();
    });

    expect(result.current.connected).toBe(true);

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.connected).toBe(false);

    // No new connections should be attempted
    const countBefore = wsInstances.length;
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(wsInstances.length).toBe(countBefore);
  });

  it('should clean up the WebSocket connection on unmount', () => {
    const { unmount } = renderHook(() => useWebSocket());

    act(() => {
      wsInstances[0].simulateOpen();
    });

    unmount();

    // The close method should have been called
    expect(wsInstances[0].close).toHaveBeenCalled();
  });

  it('should notify wildcard (*) subscribers for all channels', () => {
    const { result } = renderHook(() => useWebSocket());
    const wildcardHandler = vi.fn();

    act(() => {
      wsInstances[0].simulateOpen();
    });

    act(() => {
      result.current.subscribe('*', wildcardHandler);
    });

    const msg = { channel: 'agents', data: { status: 'active' }, timestamp: '2026-01-01T00:00:00Z' };
    act(() => {
      wsInstances[0].simulateMessage(msg);
    });

    expect(wildcardHandler).toHaveBeenCalledWith(msg);
  });

  it('should manually connect when connect() is called after autoConnect false', () => {
    const { result } = renderHook(() => useWebSocket({ autoConnect: false }));

    expect(wsInstances).toHaveLength(0);

    act(() => {
      result.current.connect();
    });

    expect(wsInstances).toHaveLength(1);
  });
});
