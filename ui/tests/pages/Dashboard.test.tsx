import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { createElement } from 'react';

// Mock hooks before importing the page component
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
  ResponsiveContainer: ({ children }: any) => createElement('div', { 'data-testid': 'responsive-container' }, children),
  AreaChart: ({ children }: any) => createElement('div', { 'data-testid': 'area-chart' }, children),
  BarChart: ({ children }: any) => createElement('div', { 'data-testid': 'bar-chart' }, children),
  LineChart: ({ children }: any) => createElement('div', { 'data-testid': 'line-chart' }, children),
  PieChart: ({ children }: any) => createElement('div', { 'data-testid': 'pie-chart' }, children),
  RadarChart: ({ children }: any) => createElement('div', { 'data-testid': 'radar-chart' }, children),
  ComposedChart: ({ children }: any) => createElement('div', null, children),
  Area: () => null, Bar: () => null, Line: () => null, Pie: () => null, Radar: () => null,
  XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null,
  Legend: () => null, Cell: () => null, PolarGrid: () => null, PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null, Funnel: () => null, FunnelChart: () => null,
  ScatterChart: () => null, Scatter: () => null, ZAxis: () => null,
}));

import { useApiQuery } from '../../src/hooks/useApi';
import { useWebSocket } from '../../src/hooks/useWebSocket';
import Dashboard from '../../src/pages/Dashboard';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockOverview = {
  kpis: {
    totalRevenue: { value: '2.4M', change: 12.5, trend: 'up' as const, prefix: '$' },
    activeCampaigns: { value: 48, change: 8, trend: 'up' as const },
    globalROAS: { value: '4.2x', change: 5.3, trend: 'up' as const },
    activeCountries: { value: 12, change: 2, trend: 'up' as const, suffix: ' markets' },
  },
  revenueChart: [
    { month: 'Jan', revenue: 1200000, spend: 300000 },
    { month: 'Feb', revenue: 1500000, spend: 350000 },
  ],
  topCountries: [
    { country: 'United States', flag: '\uD83C\uDDFA\uD83C\uDDF8', revenue: 800000, pct: 80 },
    { country: 'Germany', flag: '\uD83C\uDDE9\uD83C\uDDEA', revenue: 400000, pct: 40 },
  ],
  systemConfidence: [
    { label: 'Market Intelligence', score: 92 },
    { label: 'Creative Engine', score: 88 },
  ],
  overallConfidence: 90,
};

const mockSpendSummary = {
  channels: [
    { channel: 'Google', spend: 150000, revenue: 600000 },
    { channel: 'Meta', spend: 100000, revenue: 450000 },
  ],
};

const mockAgents = [
  { name: 'Market Intelligence Agent', status: 'active' as const },
  { name: 'Paid Ads Agent', status: 'active' as const },
  { name: 'Social Agent', status: 'idle' as const },
  { name: 'Content Agent', status: 'error' as const },
];

const mockAlerts = [
  { id: 1, severity: 'critical' as const, message: 'Budget exceeded in DE campaign', time: '5 min ago' },
  { id: 2, severity: 'warning' as const, message: 'CTR dropping in Meta France', time: '15 min ago' },
  { id: 3, severity: 'info' as const, message: 'New market opportunity detected', time: '1 hr ago' },
];

// Helper to configure mocks per call order
function setupMocks(overrides: {
  overview?: { data: any; loading: boolean; error: any };
  spend?: { data: any; loading: boolean; error: any };
  agents?: { data: any; loading: boolean; error: any };
  alerts?: { data: any; loading: boolean; error: any };
} = {}) {
  const defaultReturn = { data: null, loading: false, error: null, refetch: vi.fn() };

  const overviewReturn = { ...defaultReturn, ...overrides.overview };
  const spendReturn = { ...defaultReturn, ...overrides.spend };
  const agentsReturn = { ...defaultReturn, ...overrides.agents };
  const alertsReturn = { ...defaultReturn, ...overrides.alerts };

  (useApiQuery as any)
    .mockReturnValueOnce(overviewReturn)   // /v1/dashboard/overview
    .mockReturnValueOnce(spendReturn)      // /v1/campaigns/spend/summary
    .mockReturnValueOnce(agentsReturn)     // /v1/agents
    .mockReturnValueOnce(alertsReturn);    // /v1/alerts?limit=5
}

const renderDashboard = () =>
  render(createElement(BrowserRouter, null, createElement(Dashboard)));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Loading states ----

  it('shows KPI skeletons when overview is loading', () => {
    setupMocks({ overview: { data: null, loading: true, error: null } });
    const { container } = renderDashboard();
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows chart skeleton when overview is loading', () => {
    setupMocks({ overview: { data: null, loading: true, error: null } });
    const { container } = renderDashboard();
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows agent card skeleton when agents are loading', () => {
    setupMocks({ agents: { data: null, loading: true, error: null } });
    const { container } = renderDashboard();
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows alerts skeleton when alerts are loading', () => {
    setupMocks({ alerts: { data: null, loading: true, error: null } });
    const { container } = renderDashboard();
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows spend chart skeleton when spend is loading', () => {
    setupMocks({
      overview: { data: mockOverview, loading: false, error: null },
      spend: { data: null, loading: true, error: null },
    });
    const { container } = renderDashboard();
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  // ---- Data loaded states ----

  it('renders KPI cards when overview data is loaded', () => {
    setupMocks({
      overview: { data: mockOverview, loading: false, error: null },
      spend: { data: mockSpendSummary, loading: false, error: null },
      agents: { data: mockAgents, loading: false, error: null },
      alerts: { data: mockAlerts, loading: false, error: null },
    });
    renderDashboard();
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getByText('Active Campaigns')).toBeInTheDocument();
    expect(screen.getByText('Global ROAS')).toBeInTheDocument();
    expect(screen.getByText('Active Countries')).toBeInTheDocument();
  });

  it('renders revenue chart area when data is loaded', () => {
    setupMocks({
      overview: { data: mockOverview, loading: false, error: null },
      spend: { data: mockSpendSummary, loading: false, error: null },
      agents: { data: mockAgents, loading: false, error: null },
      alerts: { data: mockAlerts, loading: false, error: null },
    });
    renderDashboard();
    expect(screen.getByText('Revenue Trends')).toBeInTheDocument();
    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
  });

  it('renders channel performance bar chart when spend data is loaded', () => {
    setupMocks({
      overview: { data: mockOverview, loading: false, error: null },
      spend: { data: mockSpendSummary, loading: false, error: null },
      agents: { data: mockAgents, loading: false, error: null },
      alerts: { data: mockAlerts, loading: false, error: null },
    });
    renderDashboard();
    expect(screen.getByText('Channel Performance')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('renders agent status grid with agent names', () => {
    setupMocks({
      overview: { data: mockOverview, loading: false, error: null },
      spend: { data: mockSpendSummary, loading: false, error: null },
      agents: { data: mockAgents, loading: false, error: null },
      alerts: { data: mockAlerts, loading: false, error: null },
    });
    renderDashboard();
    expect(screen.getByText('Market Intelligence Agent')).toBeInTheDocument();
    expect(screen.getByText('Paid Ads Agent')).toBeInTheDocument();
    expect(screen.getByText('Social Agent')).toBeInTheDocument();
    expect(screen.getByText('Content Agent')).toBeInTheDocument();
  });

  it('renders agent count subtitle', () => {
    setupMocks({
      overview: { data: mockOverview, loading: false, error: null },
      spend: { data: mockSpendSummary, loading: false, error: null },
      agents: { data: mockAgents, loading: false, error: null },
      alerts: { data: mockAlerts, loading: false, error: null },
    });
    renderDashboard();
    expect(screen.getByText('4 AI agents')).toBeInTheDocument();
  });

  it('renders alert messages', () => {
    setupMocks({
      overview: { data: mockOverview, loading: false, error: null },
      spend: { data: mockSpendSummary, loading: false, error: null },
      agents: { data: mockAgents, loading: false, error: null },
      alerts: { data: mockAlerts, loading: false, error: null },
    });
    renderDashboard();
    expect(screen.getByText('Budget exceeded in DE campaign')).toBeInTheDocument();
    expect(screen.getByText('CTR dropping in Meta France')).toBeInTheDocument();
    expect(screen.getByText('New market opportunity detected')).toBeInTheDocument();
  });

  it('renders critical alert count badge', () => {
    setupMocks({
      overview: { data: mockOverview, loading: false, error: null },
      spend: { data: mockSpendSummary, loading: false, error: null },
      agents: { data: mockAgents, loading: false, error: null },
      alerts: { data: mockAlerts, loading: false, error: null },
    });
    renderDashboard();
    expect(screen.getByText('1 critical')).toBeInTheDocument();
  });

  it('renders top countries by revenue', () => {
    setupMocks({
      overview: { data: mockOverview, loading: false, error: null },
      spend: { data: mockSpendSummary, loading: false, error: null },
      agents: { data: mockAgents, loading: false, error: null },
      alerts: { data: mockAlerts, loading: false, error: null },
    });
    renderDashboard();
    expect(screen.getByText('Top Countries by Revenue')).toBeInTheDocument();
    expect(screen.getByText(/United States/)).toBeInTheDocument();
    expect(screen.getByText(/Germany/)).toBeInTheDocument();
  });

  it('renders system confidence metrics', () => {
    setupMocks({
      overview: { data: mockOverview, loading: false, error: null },
      spend: { data: mockSpendSummary, loading: false, error: null },
      agents: { data: mockAgents, loading: false, error: null },
      alerts: { data: mockAlerts, loading: false, error: null },
    });
    renderDashboard();
    expect(screen.getByText('System Confidence')).toBeInTheDocument();
    expect(screen.getByText('Market Intelligence')).toBeInTheDocument();
    expect(screen.getByText('Creative Engine')).toBeInTheDocument();
    expect(screen.getByText('Overall Confidence')).toBeInTheDocument();
  });

  // ---- Error states ----

  it('shows error display when overview has error', () => {
    setupMocks({
      overview: { data: null, loading: false, error: new Error('Overview failed') },
      spend: { data: mockSpendSummary, loading: false, error: null },
      agents: { data: mockAgents, loading: false, error: null },
      alerts: { data: mockAlerts, loading: false, error: null },
    });
    renderDashboard();
    expect(screen.getAllByText(/retry/i).length).toBeGreaterThan(0);
  });

  it('shows error display when spend summary has error', () => {
    setupMocks({
      overview: { data: mockOverview, loading: false, error: null },
      spend: { data: null, loading: false, error: new Error('Spend failed') },
      agents: { data: mockAgents, loading: false, error: null },
      alerts: { data: mockAlerts, loading: false, error: null },
    });
    renderDashboard();
    expect(screen.getAllByText(/retry/i).length).toBeGreaterThan(0);
  });

  it('shows error display when agents data has error', () => {
    setupMocks({
      overview: { data: mockOverview, loading: false, error: null },
      spend: { data: mockSpendSummary, loading: false, error: null },
      agents: { data: null, loading: false, error: new Error('Agents failed') },
      alerts: { data: mockAlerts, loading: false, error: null },
    });
    renderDashboard();
    expect(screen.getAllByText(/retry/i).length).toBeGreaterThan(0);
  });

  it('shows error display when alerts data has error', () => {
    setupMocks({
      overview: { data: mockOverview, loading: false, error: null },
      spend: { data: mockSpendSummary, loading: false, error: null },
      agents: { data: mockAgents, loading: false, error: null },
      alerts: { data: null, loading: false, error: new Error('Alerts failed') },
    });
    renderDashboard();
    expect(screen.getAllByText(/retry/i).length).toBeGreaterThan(0);
  });

  // ---- WebSocket & connection ----

  it('sets up WebSocket subscriptions for agent_status and alerts', () => {
    const mockSubscribe = vi.fn(() => vi.fn());
    (useWebSocket as any).mockReturnValue({
      connected: true,
      subscribe: mockSubscribe,
      lastMessage: null,
      send: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      unsubscribe: vi.fn(),
    });
    setupMocks({
      overview: { data: mockOverview, loading: false, error: null },
      spend: { data: mockSpendSummary, loading: false, error: null },
      agents: { data: mockAgents, loading: false, error: null },
      alerts: { data: mockAlerts, loading: false, error: null },
    });
    renderDashboard();
    expect(mockSubscribe).toHaveBeenCalledWith('agent_status', expect.any(Function));
    expect(mockSubscribe).toHaveBeenCalledWith('alert', expect.any(Function));
  });

  it('displays "All systems operational" when WebSocket is connected', () => {
    (useWebSocket as any).mockReturnValue({
      connected: true,
      subscribe: vi.fn(() => vi.fn()),
      lastMessage: null,
      send: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      unsubscribe: vi.fn(),
    });
    setupMocks({
      overview: { data: mockOverview, loading: false, error: null },
      spend: { data: mockSpendSummary, loading: false, error: null },
      agents: { data: mockAgents, loading: false, error: null },
      alerts: { data: mockAlerts, loading: false, error: null },
    });
    renderDashboard();
    expect(screen.getByText('All systems operational')).toBeInTheDocument();
  });

  it('displays "Connecting..." when WebSocket is disconnected', () => {
    (useWebSocket as any).mockReturnValue({
      connected: false,
      subscribe: vi.fn(() => vi.fn()),
      lastMessage: null,
      send: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      unsubscribe: vi.fn(),
    });
    setupMocks({
      overview: { data: mockOverview, loading: false, error: null },
      spend: { data: mockSpendSummary, loading: false, error: null },
      agents: { data: mockAgents, loading: false, error: null },
      alerts: { data: mockAlerts, loading: false, error: null },
    });
    renderDashboard();
    expect(screen.getByText('Connecting...')).toBeInTheDocument();
  });

  // ---- Page header ----

  it('renders the page header with Command Center title', () => {
    setupMocks({
      overview: { data: mockOverview, loading: false, error: null },
      spend: { data: mockSpendSummary, loading: false, error: null },
      agents: { data: mockAgents, loading: false, error: null },
      alerts: { data: mockAlerts, loading: false, error: null },
    });
    renderDashboard();
    expect(screen.getByText('Command Center')).toBeInTheDocument();
  });

  it('renders the subtitle text', () => {
    setupMocks({
      overview: { data: mockOverview, loading: false, error: null },
      spend: { data: mockSpendSummary, loading: false, error: null },
      agents: { data: mockAgents, loading: false, error: null },
      alerts: { data: mockAlerts, loading: false, error: null },
    });
    renderDashboard();
    expect(screen.getByText('AI International Growth Engine - Real-time Overview')).toBeInTheDocument();
  });
});
