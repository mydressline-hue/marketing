import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { createElement, type ReactNode } from 'react';

vi.mock('../../src/hooks/useApi', () => ({
  useApiQuery: vi.fn(),
  useApiMutation: vi.fn(() => ({ mutate: vi.fn().mockResolvedValue({}), loading: false, error: null, data: null, reset: vi.fn() })),
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
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => createElement('div', { 'data-testid': 'responsive-container' }, children),
  AreaChart: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  BarChart: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  LineChart: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  PieChart: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  RadarChart: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  ComposedChart: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  Area: () => null, Bar: () => null, Line: () => null, Pie: () => null, Radar: () => null,
  XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null,
  Legend: () => null, Cell: () => null, PolarGrid: () => null, PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null, Funnel: () => null, FunnelChart: () => null,
  ScatterChart: () => null, Scatter: () => null, ZAxis: () => null,
}));

import { useApiQuery } from '../../src/hooks/useApi';
import SettingsPage from '../../src/pages/Settings';

const mockUseApiQuery = useApiQuery as ReturnType<typeof vi.fn>;

const mockSettings = {
  general: {
    companyName: 'GrowthX Inc.',
    timezone: 'UTC',
    currency: 'USD',
    language: 'en',
    autonomyMode: 'semi' as const,
    notificationEmail: 'admin@growthx.com',
  },
  notifications: {
    channels: [
      { channel: 'Email', desc: 'Get alerts via email', enabled: true },
      { channel: 'Slack', desc: 'Post alerts to Slack channel', enabled: true },
      { channel: 'SMS', desc: 'Receive critical alerts via SMS', enabled: false },
    ],
    thresholds: {
      roasAlert: 1.5,
      spendAnomaly: 200,
      cpcSpike: 50,
      fraudScore: 85,
    },
  },
  security: [
    { label: 'Data Encryption', desc: 'AES-256 at rest, TLS 1.3 in transit', status: 'Active', ok: true },
    { label: 'MFA Enforcement', desc: 'All users require multi-factor auth', status: 'Enabled', ok: true },
    { label: 'Audit Logging', desc: 'Full audit trail for all actions', status: 'Active', ok: true },
  ],
  appearance: {
    theme: 'light' as const,
    accentColor: '#3b82f6',
    sidebarPosition: 'left' as const,
    density: 'comfortable' as const,
  },
  aiAgents: {
    opus: {
      maxTokens: 4096,
      temperature: 0.7,
      confidenceThreshold: 80,
      rateLimit: 60,
    },
    sonnet: {
      maxTokens: 2048,
      temperature: 0.5,
      confidenceThreshold: 70,
      rateLimit: 120,
    },
    crossChallenge: {
      minChallengesPerAgent: 3,
      challengeFrequency: 'Every cycle',
      contradictionResolution: 'Auto (highest confidence)',
    },
  },
};

const mockApiKeysData = {
  keys: [
    { name: 'Google Ads API', service: 'Google Ads', key: 'sk-****-****-gads', status: 'active' as const, lastRotated: '5 days ago' },
    { name: 'Meta Marketing API', service: 'Meta Business', key: 'EAA****...', status: 'warning' as const, lastRotated: '35 days ago' },
    { name: 'OpenAI API', service: 'OpenAI', key: 'sk-****-****-oai', status: 'active' as const, lastRotated: '2 days ago' },
  ],
};

function renderComponent() {
  return render(
    <BrowserRouter>
      <SettingsPage />
    </BrowserRouter>
  );
}

describe('Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page header with title and subtitle', () => {
    mockUseApiQuery.mockReturnValue({ data: null, loading: true, error: null, refetch: vi.fn() });
    renderComponent();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('System Configuration & API Management')).toBeInTheDocument();
  });

  it('renders all 6 tab navigation buttons', () => {
    mockUseApiQuery.mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });
    renderComponent();
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('API Keys')).toBeInTheDocument();
    expect(screen.getByText('AI Agents')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText('Appearance')).toBeInTheDocument();
  });

  it('renders general tab with company settings when loaded', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url === '/v1/settings') return { data: mockSettings, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('General Settings')).toBeInTheDocument();
    expect(screen.getByDisplayValue('GrowthX Inc.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('admin@growthx.com')).toBeInTheDocument();
  });

  it('renders autonomy mode buttons in general tab', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url === '/v1/settings') return { data: mockSettings, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Manual')).toBeInTheDocument();
    expect(screen.getByText('Semi-Autonomous')).toBeInTheDocument();
    expect(screen.getByText('Full Autonomous')).toBeInTheDocument();
  });

  it('renders error state for settings on general tab', () => {
    const error = new Error('Settings load failed');
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url === '/v1/settings') return { data: null, loading: false, error, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: null, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getAllByText(/Settings load failed/i).length).toBeGreaterThan(0);
  });

  it('switches to API Keys tab and renders key entries', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url === '/v1/settings') return { data: mockSettings, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    fireEvent.click(screen.getByText('API Keys'));
    expect(screen.getByText('API Key Management')).toBeInTheDocument();
    expect(screen.getByText('Google Ads API')).toBeInTheDocument();
    expect(screen.getByText('Meta Marketing API')).toBeInTheDocument();
    expect(screen.getByText('OpenAI API')).toBeInTheDocument();
  });

  it('shows key rotation overdue warning for warning status keys', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url === '/v1/settings') return { data: mockSettings, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    fireEvent.click(screen.getByText('API Keys'));
    expect(screen.getByText(/Key rotation overdue/)).toBeInTheDocument();
  });

  it('switches to AI Agents tab and renders agent config', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url === '/v1/settings') return { data: mockSettings, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    fireEvent.click(screen.getByText('AI Agents'));
    expect(screen.getByText('AI Agent Configuration')).toBeInTheDocument();
    expect(screen.getByText('Claude Opus (Primary Agent)')).toBeInTheDocument();
    expect(screen.getByText('Claude Sonnet (Sub-Agent)')).toBeInTheDocument();
    expect(screen.getByText('Cross-Challenge Configuration')).toBeInTheDocument();
  });

  it('renders opus agent config values in AI Agents tab', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url === '/v1/settings') return { data: mockSettings, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    fireEvent.click(screen.getByText('AI Agents'));
    expect(screen.getByDisplayValue('4096')).toBeInTheDocument();
    expect(screen.getByDisplayValue('0.7')).toBeInTheDocument();
  });

  it('switches to Notifications tab and renders channels', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url === '/v1/settings') return { data: mockSettings, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    fireEvent.click(screen.getByText('Notifications'));
    expect(screen.getByText('Notification Settings')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Slack')).toBeInTheDocument();
    expect(screen.getByText('SMS')).toBeInTheDocument();
  });

  it('renders notification threshold inputs', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url === '/v1/settings') return { data: mockSettings, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    fireEvent.click(screen.getByText('Notifications'));
    expect(screen.getByText('Alert Thresholds')).toBeInTheDocument();
    expect(screen.getByText('ROAS Alert Below')).toBeInTheDocument();
    expect(screen.getByText('Spend Anomaly %')).toBeInTheDocument();
    expect(screen.getByText('CPC Spike %')).toBeInTheDocument();
    expect(screen.getByText('Fraud Score Threshold')).toBeInTheDocument();
  });

  it('switches to Security tab and renders security settings', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url === '/v1/settings') return { data: mockSettings, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    fireEvent.click(screen.getByText('Security'));
    expect(screen.getByText('Security Settings')).toBeInTheDocument();
    expect(screen.getByText('Data Encryption')).toBeInTheDocument();
    expect(screen.getByText('MFA Enforcement')).toBeInTheDocument();
    expect(screen.getByText('Audit Logging')).toBeInTheDocument();
  });

  it('switches to Appearance tab and renders theme options', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url === '/v1/settings') return { data: mockSettings, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    fireEvent.click(screen.getByText('Appearance'));
    expect(screen.getByText('Light')).toBeInTheDocument();
    expect(screen.getByText('Dark')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
  });

  it('renders sidebar position options in Appearance tab', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url === '/v1/settings') return { data: mockSettings, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    fireEvent.click(screen.getByText('Appearance'));
    expect(screen.getByText('Left')).toBeInTheDocument();
    expect(screen.getByText('Right')).toBeInTheDocument();
  });

  it('renders density options in Appearance tab', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url === '/v1/settings') return { data: mockSettings, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    fireEvent.click(screen.getByText('Appearance'));
    expect(screen.getByText('Compact')).toBeInTheDocument();
    expect(screen.getByText('Comfortable')).toBeInTheDocument();
    expect(screen.getByText('Spacious')).toBeInTheDocument();
  });

  it('renders Save Changes button', () => {
    mockUseApiQuery.mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });
    renderComponent();
    expect(screen.getByText('Save Changes')).toBeInTheDocument();
  });

  it('updates company name when input changes', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url === '/v1/settings') return { data: mockSettings, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    const input = screen.getByDisplayValue('GrowthX Inc.');
    fireEvent.change(input, { target: { value: 'NewCo' } });
    expect(screen.getByDisplayValue('NewCo')).toBeInTheDocument();
  });
});
