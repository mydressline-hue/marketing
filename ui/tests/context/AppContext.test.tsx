import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { AppProvider } from '../../src/context/AppContext';
import { useApp } from '../../src/context/useApp';
import { QueryProvider } from '../../src/providers/QueryProvider';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock useApiQuery so AppProvider doesn't make real network calls.
vi.mock('../../src/hooks/useApi', () => ({
  useApiQuery: vi.fn().mockReturnValue({
    data: null,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// Mock useWebSocket so AppProvider doesn't open real WebSocket connections.
vi.mock('../../src/hooks/useWebSocket', () => ({
  useWebSocket: vi.fn().mockReturnValue({
    connected: false,
    lastMessage: null,
    subscribe: vi.fn().mockReturnValue(() => {}),
    unsubscribe: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
  }),
}));

// Mock the api service (used directly in setKillSwitch, addAlert, dismissAlert).
vi.mock('../../src/services/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
  api: {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryProvider, null, createElement(AppProvider, null, children));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppContext', () => {
  // --- Initial state ---

  it('should have sidebarOpen true by default', () => {
    const { result } = renderHook(() => useApp(), { wrapper });
    expect(result.current.sidebarOpen).toBe(true);
  });

  it('should have darkMode false by default when localStorage is empty', () => {
    const { result } = renderHook(() => useApp(), { wrapper });
    expect(result.current.darkMode).toBe(false);
  });

  it('should initialise darkMode from localStorage', () => {
    localStorage.setItem('darkMode', 'true');
    const { result } = renderHook(() => useApp(), { wrapper });
    expect(result.current.darkMode).toBe(true);
  });

  it('should have default killSwitch state with all switches off', () => {
    const { result } = renderHook(() => useApp(), { wrapper });
    expect(result.current.killSwitch).toEqual({
      global: false,
      campaigns: false,
      automation: false,
      apiKeys: false,
      countrySpecific: {},
    });
  });

  it('should have empty alerts array by default', () => {
    const { result } = renderHook(() => useApp(), { wrapper });
    expect(result.current.alerts).toEqual([]);
  });

  it('should have selectedCountry null by default', () => {
    const { result } = renderHook(() => useApp(), { wrapper });
    expect(result.current.selectedCountry).toBeNull();
  });

  it('should have autonomyMode "semi" by default', () => {
    const { result } = renderHook(() => useApp(), { wrapper });
    expect(result.current.autonomyMode).toBe('semi');
  });

  // --- Actions ---

  it('should toggle sidebar state', () => {
    const { result } = renderHook(() => useApp(), { wrapper });

    expect(result.current.sidebarOpen).toBe(true);

    act(() => result.current.toggleSidebar());
    expect(result.current.sidebarOpen).toBe(false);

    act(() => result.current.toggleSidebar());
    expect(result.current.sidebarOpen).toBe(true);
  });

  it('should toggle darkMode and persist to localStorage', () => {
    const { result } = renderHook(() => useApp(), { wrapper });

    expect(result.current.darkMode).toBe(false);

    act(() => result.current.toggleDarkMode());
    expect(result.current.darkMode).toBe(true);
    expect(localStorage.getItem('darkMode')).toBe('true');

    act(() => result.current.toggleDarkMode());
    expect(result.current.darkMode).toBe(false);
    expect(localStorage.getItem('darkMode')).toBe('false');
  });

  it('should update killSwitch state with partial update', () => {
    const { result } = renderHook(() => useApp(), { wrapper });

    act(() => result.current.setKillSwitch({ global: true }));
    expect(result.current.killSwitch.global).toBe(true);
    expect(result.current.killSwitch.campaigns).toBe(false); // unchanged
  });

  it('should add an alert to the beginning of the alerts array', () => {
    const { result } = renderHook(() => useApp(), { wrapper });

    const alert = {
      id: 'alert-1',
      type: 'critical' as const,
      source: 'test',
      message: 'Test alert',
      timestamp: '2026-01-01T00:00:00Z',
      acknowledged: false,
    };

    act(() => result.current.addAlert(alert));

    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0]).toEqual(alert);
  });

  it('should dismiss an alert by marking it as acknowledged', () => {
    const { result } = renderHook(() => useApp(), { wrapper });

    const alert = {
      id: 'alert-dismiss-test',
      type: 'warning' as const,
      source: 'test',
      message: 'To be dismissed',
      timestamp: '2026-01-01T00:00:00Z',
      acknowledged: false,
    };

    act(() => result.current.addAlert(alert));
    expect(result.current.alerts[0].acknowledged).toBe(false);

    act(() => result.current.dismissAlert('alert-dismiss-test'));
    expect(result.current.alerts[0].acknowledged).toBe(true);
  });

  it('should set autonomyMode', () => {
    const { result } = renderHook(() => useApp(), { wrapper });

    act(() => result.current.setAutonomyMode('full'));
    expect(result.current.autonomyMode).toBe('full');

    act(() => result.current.setAutonomyMode('manual'));
    expect(result.current.autonomyMode).toBe('manual');
  });

  it('should set selectedCountry', () => {
    const { result } = renderHook(() => useApp(), { wrapper });

    act(() => result.current.setSelectedCountry('US'));
    expect(result.current.selectedCountry).toBe('US');

    act(() => result.current.setSelectedCountry(null));
    expect(result.current.selectedCountry).toBeNull();
  });

  // --- Error when used outside provider ---

  it('should throw an error when useApp is called outside AppProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useApp());
    }).toThrow('useApp must be used within AppProvider');

    spy.mockRestore();
  });
});
