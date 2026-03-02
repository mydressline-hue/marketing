import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { createElement, type ReactNode } from 'react';

vi.mock('../../src/hooks/useApi', () => ({
  useApiQuery: vi.fn(),
  useApiMutation: vi.fn(() => ({ mutate: vi.fn(), loading: false, error: null, data: null, reset: vi.fn() })),
}));
vi.mock('../../src/hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({ connected: true, subscribe: vi.fn(() => vi.fn()), lastMessage: null, send: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), unsubscribe: vi.fn() })),
}));
vi.mock('../../src/context/AppContext', () => ({
  useApp: vi.fn(() => ({
    sidebarOpen: true, darkMode: false, toggleSidebar: vi.fn(), toggleDarkMode: vi.fn(),
    autonomyMode: 'semi' as const, setAutonomyMode: vi.fn(),
    alerts: [], killSwitch: { global: false, campaigns: false, automation: false, apiKeys: false, countrySpecific: {} },
    setKillSwitch: vi.fn(), addAlert: vi.fn(), dismissAlert: vi.fn(),
    selectedCountry: null, setSelectedCountry: vi.fn(),
  })),
}));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  AreaChart: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  BarChart: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  LineChart: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  PieChart: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  RadarChart: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  ComposedChart: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  Area: () => null, Bar: () => null, Line: () => null, Pie: () => null, Radar: () => null,
  XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null,
  Legend: () => null, Cell: () => null, PolarGrid: () => null, PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null, ScatterChart: () => null, Scatter: () => null, ZAxis: () => null,
  Funnel: () => null, FunnelChart: () => null,
}));

import { useApiQuery } from '../../src/hooks/useApi';
import FraudDetection from '../../src/pages/FraudDetection';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockAlertsData = {
  alerts: [
    { id: 'FA-001', type: 'click_fraud' as const, severity: 'critical' as const, campaign: 'DE Summer Campaign', description: 'Abnormal click pattern detected from IP range 192.168.x.x', timestamp: '2024-01-15T14:30:00Z', status: 'active' as const },
    { id: 'FA-002', type: 'bot_traffic' as const, severity: 'high' as const, campaign: 'US Brand Awareness', description: 'Bot traffic spike detected from data center IPs', timestamp: '2024-01-15T13:00:00Z', status: 'active' as const },
    { id: 'FA-003', type: 'conversion_anomaly' as const, severity: 'medium' as const, campaign: 'JP Product Launch', description: 'Conversion rate anomaly detected - 300% spike', timestamp: '2024-01-15T12:00:00Z', status: 'resolved' as const },
  ],
  blockedClicksData: [
    { day: 'Jan 1', blocked: 120, legitimate: 3400 },
    { day: 'Jan 2', blocked: 95, legitimate: 3200 },
    { day: 'Jan 3', blocked: 180, legitimate: 3600 },
  ],
  botTrafficByCountry: [
    { country: 'United States', botPct: 8.5, volume: 45000 },
    { country: 'Germany', botPct: 5.2, volume: 28000 },
    { country: 'India', botPct: 15.3, volume: 12000 },
  ],
  anomalyMonitor: [
    { id: 'am-1', label: 'Click Rate Monitor', detail: 'Within normal range', status: 'normal' as const },
    { id: 'am-2', label: 'Conversion Spike Detector', detail: 'Elevated activity detected', status: 'warning' as const },
    { id: 'am-3', label: 'IP Reputation Check', detail: 'Suspicious IPs blocked', status: 'alert' as const },
  ],
  resolutionLog: [
    { id: 'rl-1', alertId: 'FA-003', type: 'conversion_anomaly', resolution: 'False positive - seasonal sale spike', resolvedBy: 'Fraud Agent', resolvedAt: '2024-01-15T12:30:00Z', savingsRecovered: '$0' },
    { id: 'rl-2', alertId: 'FA-004', type: 'click_fraud', resolution: 'Blocked 500 fraudulent IPs', resolvedBy: 'Fraud Agent', resolvedAt: '2024-01-14T18:00:00Z', savingsRecovered: '$8,400' },
  ],
  kpis: {
    fraudBlocked: '24.5K',
    fraudBlockedChange: 12,
    botTrafficDetected: '6.8',
    botTrafficChange: -2.1,
    anomalyAlerts: 7,
    anomalyAlertsChange: 3,
    protectionScore: '94',
    protectionScoreChange: 1.5,
  },
};

const mockRulesData = {
  rules: [
    { id: 'pr-1', name: 'Auto-block suspicious IPs', description: 'Automatically block IPs with > 100 clicks/hour', enabled: true },
    { id: 'pr-2', name: 'Bot traffic filter', description: 'Filter traffic from known bot networks', enabled: true },
    { id: 'pr-3', name: 'Conversion velocity guard', description: 'Alert on unusual conversion rate spikes', enabled: false },
    { id: 'pr-4', name: 'Budget drain protection', description: 'Pause campaigns if spend exceeds 2x daily target', enabled: true },
  ],
};

// Helper - FraudDetection uses 2 useApiQuery calls: alerts, rules
function setupMocks(overrides: {
  alerts?: { data: unknown; loading: boolean; error: Error | null };
  rules?: { data: unknown; loading: boolean; error: Error | null };
} = {}) {
  const defaultReturn = { data: null, loading: false, error: null, refetch: vi.fn() };
  (useApiQuery as ReturnType<typeof vi.fn>)
    .mockReturnValueOnce({ ...defaultReturn, ...overrides.alerts })
    .mockReturnValueOnce({ ...defaultReturn, ...overrides.rules });
}

const renderPage = () =>
  render(createElement(BrowserRouter, null, createElement(FraudDetection)));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FraudDetection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Loading states ----

  it('shows skeletons when alerts data is loading', () => {
    setupMocks({
      alerts: { data: null, loading: true, error: null },
      rules: { data: null, loading: true, error: null },
    });
    const { container } = renderPage();
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders page header with title', () => {
    setupMocks({
      alerts: { data: null, loading: true, error: null },
      rules: { data: null, loading: true, error: null },
    });
    renderPage();
    expect(screen.getByText('Fraud & Anomaly Detection')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    setupMocks({
      alerts: { data: null, loading: true, error: null },
      rules: { data: null, loading: true, error: null },
    });
    renderPage();
    expect(screen.getByText('Click Fraud, Bot Detection & Conversion Anomaly Alerts')).toBeInTheDocument();
  });

  // ---- Error states ----

  it('shows error display when alerts data fails', () => {
    setupMocks({
      alerts: { data: null, loading: false, error: new Error('Alerts failed') },
      rules: { data: mockRulesData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getAllByText(/retry/i).length).toBeGreaterThan(0);
  });

  // ---- Data loaded states ----

  it('renders KPI cards when data is loaded', () => {
    setupMocks({
      alerts: { data: mockAlertsData, loading: false, error: null },
      rules: { data: mockRulesData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Fraud Blocked')).toBeInTheDocument();
    expect(screen.getByText('Bot Traffic Detected')).toBeInTheDocument();
    expect(screen.getByText('Anomaly Alerts')).toBeInTheDocument();
    expect(screen.getByText('Protection Score')).toBeInTheDocument();
  });

  it('renders active alerts table with alert IDs', () => {
    setupMocks({
      alerts: { data: mockAlertsData, loading: false, error: null },
      rules: { data: mockRulesData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Active Alerts')).toBeInTheDocument();
    expect(screen.getByText('FA-001')).toBeInTheDocument();
    expect(screen.getByText('FA-002')).toBeInTheDocument();
    expect(screen.getAllByText('FA-003').length).toBeGreaterThan(0);
  });

  it('renders fraud type labels in alert rows', () => {
    setupMocks({
      alerts: { data: mockAlertsData, loading: false, error: null },
      rules: { data: mockRulesData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Click Fraud')).toBeInTheDocument();
    expect(screen.getByText('Bot Traffic')).toBeInTheDocument();
    expect(screen.getByText('Conversion Anomaly')).toBeInTheDocument();
  });

  it('renders fraud detection overview chart card', () => {
    setupMocks({
      alerts: { data: mockAlertsData, loading: false, error: null },
      rules: { data: mockRulesData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Fraud Detection Overview')).toBeInTheDocument();
  });

  it('renders bot traffic distribution chart', () => {
    setupMocks({
      alerts: { data: mockAlertsData, loading: false, error: null },
      rules: { data: mockRulesData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Bot Traffic Distribution')).toBeInTheDocument();
  });

  it('renders real-time anomaly monitor with statuses', () => {
    setupMocks({
      alerts: { data: mockAlertsData, loading: false, error: null },
      rules: { data: mockRulesData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Real-time Anomaly Monitor')).toBeInTheDocument();
    expect(screen.getByText('Click Rate Monitor')).toBeInTheDocument();
    expect(screen.getByText('Conversion Spike Detector')).toBeInTheDocument();
    expect(screen.getByText('IP Reputation Check')).toBeInTheDocument();
  });

  it('renders protection rules with toggle states', () => {
    setupMocks({
      alerts: { data: mockAlertsData, loading: false, error: null },
      rules: { data: mockRulesData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Protection Rules')).toBeInTheDocument();
    expect(screen.getByText('Auto-block suspicious IPs')).toBeInTheDocument();
    expect(screen.getByText('Bot traffic filter')).toBeInTheDocument();
    expect(screen.getByText('Conversion velocity guard')).toBeInTheDocument();
    expect(screen.getByText('Budget drain protection')).toBeInTheDocument();
  });

  it('renders resolution log with entries', () => {
    setupMocks({
      alerts: { data: mockAlertsData, loading: false, error: null },
      rules: { data: mockRulesData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Resolution Log')).toBeInTheDocument();
    expect(screen.getAllByText('FA-003').length).toBeGreaterThan(0);
    expect(screen.getByText('FA-004')).toBeInTheDocument();
    expect(screen.getByText(/\$8,400/)).toBeInTheDocument();
  });

  // ---- Empty states ----

  it('renders empty state when no alerts exist', () => {
    setupMocks({
      alerts: { data: { ...mockAlertsData, alerts: [], blockedClicksData: [], botTrafficByCountry: [], anomalyMonitor: [], resolutionLog: [] }, loading: false, error: null },
      rules: { data: { rules: [] }, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('No fraud alerts')).toBeInTheDocument();
  });

  it('shows Protection Active badge and Run Agent button', () => {
    setupMocks({
      alerts: { data: mockAlertsData, loading: false, error: null },
      rules: { data: mockRulesData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Protection Active')).toBeInTheDocument();
    expect(screen.getByText('Run Agent')).toBeInTheDocument();
  });
});
