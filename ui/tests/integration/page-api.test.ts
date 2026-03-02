import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryProvider } from '../../src/providers/QueryProvider';

// ---------------------------------------------------------------------------
// Mock the api service so useApiQuery's internal api.get() is intercepted
// ---------------------------------------------------------------------------
const mockGet = vi.fn();
vi.mock('../../src/services/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    setApiKey: vi.fn(),
  },
}));

import { useApiQuery } from '../../src/hooks/useApi';
import { useWebSocket } from '../../src/hooks/useWebSocket';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryProvider, null, children);

// Mock WebSocket class
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState = 0; // CONNECTING
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  sentMessages: string[] = [];

  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = 3;
  }

  simulateOpen() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
  }

  simulateClose(code = 1000, reason = '') {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close', { code, reason }));
  }
}

beforeEach(() => {
  vi.stubGlobal('WebSocket', MockWebSocket);
  mockGet.mockReset();
  MockWebSocket.instances = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Integration: useApiQuery with QueryProvider
// ---------------------------------------------------------------------------

describe('Page-API Integration', () => {
  it('loads data successfully via useApiQuery', async () => {
    const dashboardData = {
      kpis: { totalRevenue: '$1.2M', activeCountries: 12 },
      recentAlerts: [{ id: 'a1', type: 'warning', message: 'Unusual click pattern' }],
    };

    mockGet.mockResolvedValueOnce(dashboardData);

    const { result } = renderHook(
      () => useApiQuery('/v1/dashboard/overview'),
      { wrapper },
    );

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    // Wait for data
    await waitFor(() => {
      expect(result.current.data).toEqual(dashboardData);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('loading states return correct shape during fetch', async () => {
    let resolvePromise!: (value: unknown) => void;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    mockGet.mockReturnValueOnce(pendingPromise);

    const { result } = renderHook(
      () => useApiQuery('/v1/dashboard/overview', { skipCache: true }),
      { wrapper },
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();

    resolvePromise({ loaded: true });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual({ loaded: true });
  });

  it('error states surface when API fails', async () => {
    mockGet.mockRejectedValueOnce(new Error('API Error: 503 Service Unavailable'));

    const { result } = renderHook(
      () => useApiQuery('/v1/dashboard/overview', { skipCache: true }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toContain('503');
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('handles network failure errors', async () => {
    mockGet.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const { result } = renderHook(
      () => useApiQuery('/v1/dashboard/overview', { skipCache: true }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    expect(result.current.error?.message).toBe('Failed to fetch');
  });
});

// ---------------------------------------------------------------------------
// Integration: useWebSocket
// ---------------------------------------------------------------------------

describe('WebSocket Integration', () => {
  it('establishes WebSocket connection on mount', async () => {
    const { result } = renderHook(
      () => useWebSocket({ autoConnect: true }),
    );

    // Wait for the WebSocket to be created
    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    });

    // Simulate server accepting connection
    await act(async () => {
      MockWebSocket.instances[0].simulateOpen();
    });

    expect(result.current.connected).toBe(true);
  });

  it('receives and dispatches WebSocket messages', async () => {
    const handler = vi.fn();

    const { result } = renderHook(
      () => useWebSocket({ autoConnect: true }),
    );

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    });

    await act(async () => {
      MockWebSocket.instances[0].simulateOpen();
    });

    // Subscribe
    act(() => {
      result.current.subscribe('killswitch', handler);
    });

    // Simulate receiving a message
    await act(async () => {
      MockWebSocket.instances[0].simulateMessage({
        channel: 'killswitch',
        data: { global: true },
        timestamp: '2026-02-26T10:00:00Z',
      });
    });

    expect(handler).toHaveBeenCalled();
  });

  it('handles WebSocket disconnection', async () => {
    const { result } = renderHook(
      () => useWebSocket({ autoConnect: true, maxRetries: 1 }),
    );

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    });

    await act(async () => {
      MockWebSocket.instances[0].simulateOpen();
    });

    expect(result.current.connected).toBe(true);

    // Simulate disconnection
    await act(async () => {
      MockWebSocket.instances[0].simulateClose(1006, 'Connection lost');
    });

    expect(result.current.connected).toBe(false);
  });

  it('sends messages through WebSocket', async () => {
    const { result } = renderHook(
      () => useWebSocket({ autoConnect: true }),
    );

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    });

    await act(async () => {
      MockWebSocket.instances[0].simulateOpen();
    });

    act(() => {
      result.current.send({ action: 'ping' });
    });

    const ws = MockWebSocket.instances[0];
    expect(ws.sentMessages).toHaveLength(1);
    expect(JSON.parse(ws.sentMessages[0])).toEqual({ action: 'ping' });
  });

  it('unsubscribe removes handler from message dispatch', async () => {
    const handler = vi.fn();

    const { result } = renderHook(
      () => useWebSocket({ autoConnect: true }),
    );

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    });

    await act(async () => {
      MockWebSocket.instances[0].simulateOpen();
    });

    // Subscribe then unsubscribe
    let unsub: () => void;
    act(() => {
      unsub = result.current.subscribe('alert', handler);
    });

    act(() => {
      unsub();
    });

    // Message after unsubscribe should not trigger handler
    await act(async () => {
      MockWebSocket.instances[0].simulateMessage({
        channel: 'alert',
        data: { id: 'a1' },
        timestamp: '2026-02-26T10:00:00Z',
      });
    });

    expect(handler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Integration: Combined API + WebSocket pattern
// ---------------------------------------------------------------------------

describe('Combined API and WebSocket Pattern', () => {
  it('initial data loads via API then updates arrive via WebSocket', async () => {
    const initialData = {
      global: false,
      campaigns: false,
      automation: false,
      apiKeys: false,
      countrySpecific: {},
    };

    mockGet.mockResolvedValueOnce(initialData);

    const { result: apiResult } = renderHook(
      () => useApiQuery('/v1/killswitch/status'),
      { wrapper },
    );

    const { result: wsResult } = renderHook(
      () => useWebSocket({ autoConnect: true }),
    );

    // Wait for API data
    await waitFor(() => {
      expect(apiResult.current.data).toEqual(initialData);
    });

    // Connect WebSocket
    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    });

    await act(async () => {
      MockWebSocket.instances[0].simulateOpen();
    });

    expect(wsResult.current.connected).toBe(true);

    // Subscribe and receive real-time update
    const wsHandler = vi.fn();
    act(() => {
      wsResult.current.subscribe('killswitch', wsHandler);
    });

    await act(async () => {
      MockWebSocket.instances[0].simulateMessage({
        channel: 'killswitch',
        data: { global: true },
        timestamp: '2026-02-26T10:00:00Z',
      });
    });

    expect(wsHandler).toHaveBeenCalled();

    // API data remains unchanged until explicit refetch
    expect(apiResult.current.data).toEqual(initialData);
  });
});
