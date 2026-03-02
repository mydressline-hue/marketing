import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { createElement } from 'react';

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

vi.mock('../../src/services/api', () => ({
  default: {
    put: vi.fn().mockResolvedValue({ data: {} }),
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => createElement('div', { 'data-testid': 'responsive-container' }, children),
  AreaChart: ({ children }: any) => createElement('div', null, children),
  BarChart: ({ children }: any) => createElement('div', null, children),
  LineChart: ({ children }: any) => createElement('div', null, children),
  PieChart: ({ children }: any) => createElement('div', null, children),
  RadarChart: ({ children }: any) => createElement('div', null, children),
  ComposedChart: ({ children }: any) => createElement('div', null, children),
  Area: () => null, Bar: () => null, Line: () => null, Pie: () => null, Radar: () => null,
  XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null,
  Legend: () => null, Cell: () => null, PolarGrid: () => null, PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null, Funnel: () => null, FunnelChart: () => null,
  ScatterChart: () => null, Scatter: () => null, ZAxis: () => null,
}));

import { useApiQuery } from '../../src/hooks/useApi';
import KillSwitch from '../../src/pages/KillSwitch';

const mockUseApiQuery = useApiQuery as ReturnType<typeof vi.fn>;

const mockKillSwitchStatus = {
  global: false,
  campaigns: false,
  automation: false,
  apiKeys: false,
  newCampaigns: false,
  scaling: false,
  countries: [
    { code: 'US', name: 'United States', flag: '🇺🇸', active: true },
    { code: 'UK', name: 'United Kingdom', flag: '🇬🇧', active: true },
    { code: 'DE', name: 'Germany', flag: '🇩🇪', active: false },
    { code: 'JP', name: 'Japan', flag: '🇯🇵', active: true },
  ],
};

const mockTriggers = [
  { id: 't1', name: 'ROAS Below Threshold', description: 'Auto-pause when ROAS drops below 1.5x', enabled: true, lastTriggered: '3 days ago', severity: 'critical' },
  { id: 't2', name: 'Spend Anomaly', description: 'Alert when daily spend exceeds 200% of average', enabled: true, lastTriggered: '1 week ago', severity: 'warning' },
  { id: 't3', name: 'Fraud Score Alert', description: 'Pause campaigns with fraud score above 85', enabled: false, lastTriggered: 'Never', severity: 'critical' },
];

const mockHistory = [
  { time: '2 hours ago', action: 'Campaign Paused - Germany', detail: 'ROAS dropped below 1.5x threshold', type: 'auto', status: 'resolved' },
  { time: '5 hours ago', action: 'API Key Locked', detail: 'Unusual API access pattern detected', type: 'auto', status: 'warning' },
  { time: '1 day ago', action: 'Manual Pause - JP Campaigns', detail: 'Paused by admin for budget review', type: 'manual', status: 'resolved' },
];

function renderComponent() {
  return render(
    <BrowserRouter>
      <KillSwitch />
    </BrowserRouter>
  );
}

describe('KillSwitch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page header with title and subtitle', () => {
    mockUseApiQuery.mockReturnValue({ data: null, loading: true, error: null, refetch: vi.fn() });
    renderComponent();
    expect(screen.getByText('Kill Switch Architecture')).toBeInTheDocument();
    expect(screen.getByText('Multi-Level Emergency Controls & Automated Triggers')).toBeInTheDocument();
  });

  it('renders System Active status when global kill switch is off', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('status')) return { data: mockKillSwitchStatus, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('triggers')) return { data: mockTriggers, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('history')) return { data: mockHistory, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('System Active')).toBeInTheDocument();
  });

  it('renders SYSTEM HALTED when global kill switch is on', () => {
    const haltedStatus = { ...mockKillSwitchStatus, global: true };
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('status')) return { data: haltedStatus, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('triggers')) return { data: mockTriggers, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('history')) return { data: mockHistory, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('SYSTEM HALTED')).toBeInTheDocument();
  });

  it('renders all manual kill switch controls', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('status')) return { data: mockKillSwitchStatus, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('triggers')) return { data: mockTriggers, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('history')) return { data: mockHistory, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Global Kill Switch')).toBeInTheDocument();
    expect(screen.getByText('Pause All Campaigns')).toBeInTheDocument();
    expect(screen.getByText('Pause Automation')).toBeInTheDocument();
    expect(screen.getByText('Lock API Keys')).toBeInTheDocument();
    expect(screen.getByText('Block New Campaigns')).toBeInTheDocument();
    expect(screen.getAllByText('Pause Scaling').length).toBeGreaterThan(0);
  });

  it('renders country-specific controls', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('status')) return { data: mockKillSwitchStatus, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('triggers')) return { data: mockTriggers, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('history')) return { data: mockHistory, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Country-Specific Controls')).toBeInTheDocument();
    expect(screen.getByText('US')).toBeInTheDocument();
    expect(screen.getByText('UK')).toBeInTheDocument();
    expect(screen.getByText('DE')).toBeInTheDocument();
    expect(screen.getByText('JP')).toBeInTheDocument();
    expect(screen.getByText('United States')).toBeInTheDocument();
  });

  it('renders automated triggers with their details', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('status')) return { data: mockKillSwitchStatus, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('triggers')) return { data: mockTriggers, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('history')) return { data: mockHistory, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Automated Triggers')).toBeInTheDocument();
    expect(screen.getByText('ROAS Below Threshold')).toBeInTheDocument();
    expect(screen.getByText('Spend Anomaly')).toBeInTheDocument();
    expect(screen.getByText('Fraud Score Alert')).toBeInTheDocument();
    expect(screen.getByText('Auto-pause when ROAS drops below 1.5x')).toBeInTheDocument();
  });

  it('renders kill switch activity log', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('status')) return { data: mockKillSwitchStatus, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('triggers')) return { data: mockTriggers, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('history')) return { data: mockHistory, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Kill Switch Activity Log')).toBeInTheDocument();
    expect(screen.getByText('Campaign Paused - Germany')).toBeInTheDocument();
    expect(screen.getByText('API Key Locked')).toBeInTheDocument();
    expect(screen.getByText('Manual Pause - JP Campaigns')).toBeInTheDocument();
  });

  it('shows activity type badges (Automated / Manual)', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('status')) return { data: mockKillSwitchStatus, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('triggers')) return { data: mockTriggers, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('history')) return { data: mockHistory, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getAllByText('Automated').length).toBe(2);
    expect(screen.getByText('Manual')).toBeInTheDocument();
  });

  it('renders multi-layer halt levels reference', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('status')) return { data: mockKillSwitchStatus, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('triggers')) return { data: mockTriggers, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('history')) return { data: mockHistory, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Multi-Layer Halt Levels')).toBeInTheDocument();
    expect(screen.getByText('Level 1')).toBeInTheDocument();
    expect(screen.getByText('Level 2')).toBeInTheDocument();
    expect(screen.getByText('Level 3')).toBeInTheDocument();
    expect(screen.getByText('Level 4')).toBeInTheDocument();
    expect(screen.getByText('Full Shutdown')).toBeInTheDocument();
  });

  it('renders error state when status API fails', () => {
    const error = new Error('Kill switch status unavailable');
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('status')) return { data: null, loading: false, error, refetch: vi.fn() };
      if (url.includes('triggers')) return { data: mockTriggers, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('history')) return { data: mockHistory, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getAllByText(/Kill switch status unavailable/i).length).toBeGreaterThan(0);
  });

  it('renders WebSocket connection status as Live', () => {
    mockUseApiQuery.mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });
    renderComponent();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders CRITICAL badges on critical switches', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('status')) return { data: mockKillSwitchStatus, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('triggers')) return { data: mockTriggers, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('history')) return { data: mockHistory, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    const criticalBadges = screen.getAllByText('CRITICAL');
    expect(criticalBadges.length).toBe(3);
  });
});
