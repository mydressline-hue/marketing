import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryProvider } from '../../src/providers/QueryProvider';
import { useApiQuery } from '../../src/hooks/useApi';
import { useWebSocket } from '../../src/hooks/useWebSocket';

// --- Test setup ---

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryProvider, null, children);

const mockFetch = vi.fn();

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState = 0; // CONNECTING
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = 3; // CLOSED
  }

  // Test helpers
  simulateOpen() {
    this.readyState = 1; // OPEN
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
  }

  simulateClose(code = 1000, reason = '') {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close', { code, reason }));
  }

  simulateError() {
    this.onerror?.(new Event('error'));
  }
}

function createFetchResponse<T>(data: T, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'Internal Server Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  vi.stubGlobal('WebSocket', MockWebSocket);
  mockFetch.mockReset();
  MockWebSocket.instances = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Integration: Dashboard renders with API data ---

describe('Page-API Integration', () => {
  it('Dashboard renders with API data after successful fetch', async () => {
    const dashboardData = {
      kpis: {
        totalRevenue: '$1.2M',
        activeCountries: 12,
        activeCampaigns: 45,
        overallROAS: 3.8,
      },
      recentAlerts: [
        { id: 'a1', type: 'warning', source: 'fraud-detection', message: 'Unusual click pattern', timestamp: '2026-02-26T10:00:00Z', acknowledged: false },
      ],
    };

    mockFetch.mockReturnValueOnce(createFetchResponse(dashboardData));

    const { result } = renderHook(
      () => useApiQuery('dashboard', '/dashboard'),
      { wrapper }
    );

    // Initially loading
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();

    // Wait for data to arrive
    await waitFor(() => {
      expect(result.current.data).toEqual(dashboardData);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);

    // Verify the data structure is as expected for rendering
    const data = result.current.data as typeof dashboardData;
    expect(data.kpis.totalRevenue).toBe('$1.2M');
    expect(data.kpis.activeCountries).toBe(12);
    expect(data.recentAlerts).toHaveLength(1);
    expect(data.recentAlerts[0].type).toBe('warning');
  });

  it('loading states show skeleton pattern during fetch', async () => {
    let resolvePromise: (value: unknown) => void;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    mockFetch.mockReturnValueOnce(pendingPromise);

    const { result } = renderHook(
      () => useApiQuery('loading-skeleton-test', '/dashboard'),
      { wrapper }
    );

    // During loading, components should render skeleton states
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();

    // Resolve the fetch
    resolvePromise!({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ loaded: true }),
      text: () => Promise.resolve('{"loaded":true}'),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual({ loaded: true });
  });

  it('error states show error displays when API fails', async () => {
    mockFetch.mockReturnValueOnce(
      createFetchResponse({ error: 'Service unavailable' }, false, 503)
    );

    const { result } = renderHook(
      () => useApiQuery('error-display-test', '/dashboard'),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // Components should use these states to show error UI
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toContain('API Error 503');
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('error states handle complete network failure', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const { result } = renderHook(
      () => useApiQuery('network-fail-test', '/dashboard'),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Failed to fetch');
  });
});

// --- Integration: WebSocket connection ---

describe('WebSocket Integration', () => {
  it('establishes WebSocket connection', async () => {
    const { result } = renderHook(
      () => useWebSocket({ url: 'ws://localhost:8080/ws', enabled: true }),
    );

    // Should be in connecting state initially
    expect(result.current.status).toBe('connecting');

    // Simulate server accepting connection
    await act(async () => {
      const ws = MockWebSocket.instances[0];
      expect(ws).toBeDefined();
      expect(ws.url).toBe('ws://localhost:8080/ws');
      ws.simulateOpen();
    });

    expect(result.current.status).toBe('connected');
  });

  it('receives and dispatches WebSocket messages', async () => {
    const handler = vi.fn();

    const { result } = renderHook(
      () => useWebSocket({ url: 'ws://localhost:8080/ws', enabled: true }),
    );

    // Connect
    await act(async () => {
      MockWebSocket.instances[0].simulateOpen();
    });

    // Subscribe to a specific message type
    act(() => {
      result.current.subscribe('killswitch:update', handler);
    });

    // Simulate receiving a message
    await act(async () => {
      MockWebSocket.instances[0].simulateMessage({
        type: 'killswitch:update',
        payload: { global: true },
        timestamp: '2026-02-26T10:00:00Z',
      });
    });

    expect(handler).toHaveBeenCalledWith({ global: true });
    expect(result.current.lastMessage).toEqual({
      type: 'killswitch:update',
      payload: { global: true },
      timestamp: '2026-02-26T10:00:00Z',
    });
  });

  it('handles WebSocket disconnection and reconnection', async () => {
    const { result } = renderHook(
      () =>
        useWebSocket({
          url: 'ws://localhost:8080/ws',
          enabled: true,
          reconnect: true,
          reconnectInterval: 100,
        }),
    );

    // Connect
    await act(async () => {
      MockWebSocket.instances[0].simulateOpen();
    });

    expect(result.current.status).toBe('connected');

    // Simulate disconnection
    await act(async () => {
      MockWebSocket.instances[0].simulateClose(1006, 'Connection lost');
    });

    expect(result.current.status).toBe('disconnected');

    // Wait for reconnection attempt
    await waitFor(
      () => {
        expect(MockWebSocket.instances.length).toBeGreaterThan(1);
      },
      { timeout: 1000 }
    );

    // Simulate new connection succeeding
    await act(async () => {
      const latestWs = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      latestWs.simulateOpen();
    });

    expect(result.current.status).toBe('connected');
  });

  it('sends messages through WebSocket', async () => {
    const { result } = renderHook(
      () => useWebSocket({ url: 'ws://localhost:8080/ws', enabled: true }),
    );

    // Connect
    await act(async () => {
      MockWebSocket.instances[0].simulateOpen();
    });

    // Send a message
    act(() => {
      result.current.send({
        type: 'killswitch:toggle',
        payload: { global: false },
      });
    });

    const ws = MockWebSocket.instances[0];
    expect(ws.sentMessages).toHaveLength(1);
    expect(JSON.parse(ws.sentMessages[0])).toEqual({
      type: 'killswitch:toggle',
      payload: { global: false },
    });
  });

  it('unsubscribe removes handler from message dispatch', async () => {
    const handler = vi.fn();

    const { result } = renderHook(
      () => useWebSocket({ url: 'ws://localhost:8080/ws', enabled: true }),
    );

    await act(async () => {
      MockWebSocket.instances[0].simulateOpen();
    });

    // Subscribe and then unsubscribe
    let unsubscribe: () => void;
    act(() => {
      unsubscribe = result.current.subscribe('alert:new', handler);
    });

    act(() => {
      unsubscribe();
    });

    // Send a message after unsubscribing
    await act(async () => {
      MockWebSocket.instances[0].simulateMessage({
        type: 'alert:new',
        payload: { id: 'a1', message: 'Test' },
      });
    });

    // Handler should NOT have been called
    expect(handler).not.toHaveBeenCalled();
  });
});

// --- Integration: Combined API + WebSocket pattern ---

describe('Combined API and WebSocket Pattern', () => {
  it('initial data loads via API then updates via WebSocket', async () => {
    const initialData = {
      global: false,
      campaigns: false,
      automation: false,
      apiKeys: false,
      countrySpecific: {},
    };

    mockFetch.mockReturnValueOnce(createFetchResponse(initialData));

    const { result: apiResult } = renderHook(
      () => useApiQuery('killswitch-combined', '/killswitch/status'),
      { wrapper }
    );

    const { result: wsResult } = renderHook(
      () => useWebSocket({ url: 'ws://localhost:8080/ws', enabled: true }),
    );

    // Wait for API data
    await waitFor(() => {
      expect(apiResult.current.data).toEqual(initialData);
    });

    // Connect WebSocket
    await act(async () => {
      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
    });

    expect(wsResult.current.status).toBe('connected');

    // Receive real-time update via WebSocket
    const wsHandler = vi.fn();
    act(() => {
      wsResult.current.subscribe('killswitch:update', wsHandler);
    });

    await act(async () => {
      MockWebSocket.instances[0].simulateMessage({
        type: 'killswitch:update',
        payload: { global: true },
      });
    });

    expect(wsHandler).toHaveBeenCalledWith({ global: true });

    // API data remains the initial fetch (unchanged until refetch)
    expect(apiResult.current.data).toEqual(initialData);
  });
});
