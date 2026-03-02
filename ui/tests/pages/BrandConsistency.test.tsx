import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
import BrandConsistency from '../../src/pages/BrandConsistency';

const mockUseApiQuery = useApiQuery as ReturnType<typeof vi.fn>;

const mockStatusData = {
  brandScore: 94,
  brandScoreChange: 2.1,
  campaignsVerified: 47,
  campaignsVerifiedChange: 5,
  toneCompliance: 91,
  toneComplianceChange: 1.8,
  visualCompliance: 88,
  visualComplianceChange: -0.5,
  radarData: [
    { dimension: 'Tone', score: 92, fullMark: 100 },
    { dimension: 'Visual', score: 88, fullMark: 100 },
    { dimension: 'Logo', score: 95, fullMark: 100 },
  ],
  marketComplianceData: [
    { market: 'US', compliance: 95 },
    { market: 'UK', compliance: 87 },
    { market: 'DE', compliance: 78 },
  ],
  voiceSettings: {
    primaryTone: { label: 'Professional', description: 'Formal and authoritative communication style' },
    secondaryTone: { label: 'Friendly', description: 'Warm and approachable supporting tone' },
    forbiddenTones: ['Aggressive', 'Sarcastic'],
    toneDetectionAccuracy: 96,
    campaignsUsingToneCheck: 42,
    totalCampaigns: 47,
  },
  visualChecks: [
    { name: 'Logo Placement', icon: 'image', compliance: 95, notes: '2 outliers' },
    { name: 'Color Palette', icon: 'palette', compliance: 88 },
    { name: 'Typography', icon: 'type', compliance: 72, notes: '5 deviations' },
  ],
  lastScanAgo: '2 hours ago',
  assetsScanned: 1245,
  brandAssets: [
    { name: 'Primary Logo Pack', status: 'active', lastUpdated: '3 days ago', usageCount: 892 },
    { name: 'Brand Guidelines PDF', status: 'active', lastUpdated: '1 week ago', usageCount: 341 },
  ],
};

const mockChecksData = {
  campaignCompliance: [
    { id: '1', name: 'Summer Sale US', channel: 'Google Ads', country: 'US', toneMatch: 95, visualMatch: 92, overallScore: 93, status: 'compliant' as const, issues: 0 },
    { id: '2', name: 'APAC Launch', channel: 'Meta', country: 'JP', toneMatch: 78, visualMatch: 85, overallScore: 81, status: 'warning' as const, issues: 3 },
    { id: '3', name: 'EU Promo', channel: 'TikTok', country: 'DE', toneMatch: 65, visualMatch: 70, overallScore: 67, status: 'violation' as const, issues: 5 },
  ],
  flaggedIssues: [
    { id: 'f1', campaign: 'APAC Launch', type: 'Tone Mismatch', description: 'Overly casual language detected', severity: 'critical' as const, flaggedAt: '2 hours ago' },
    { id: 'f2', campaign: 'EU Promo', type: 'Visual Deviation', description: 'Non-standard font usage', severity: 'warning' as const, flaggedAt: '5 hours ago' },
  ],
};

function renderComponent() {
  return render(
    <BrowserRouter>
      <BrandConsistency />
    </BrowserRouter>
  );
}

describe('BrandConsistency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state when status data is loading', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('status')) return { data: null, loading: true, error: null, refetch: vi.fn() };
      return { data: null, loading: true, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Brand Consistency')).toBeInTheDocument();
  });

  it('renders error state when status API fails', () => {
    const error = new Error('Network error');
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('status')) return { data: null, loading: false, error, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getAllByText('Request failed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Network error').length).toBeGreaterThan(0);
  });

  it('renders KPI cards with data when loaded', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('status')) return { data: mockStatusData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('checks')) return { data: mockChecksData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Brand Score')).toBeInTheDocument();
    expect(screen.getByText('94%')).toBeInTheDocument();
    expect(screen.getByText('Campaigns Verified')).toBeInTheDocument();
    expect(screen.getByText('47')).toBeInTheDocument();
    expect(screen.getByText('Tone Compliance')).toBeInTheDocument();
    expect(screen.getByText('91%')).toBeInTheDocument();
    expect(screen.getByText('Visual Compliance')).toBeInTheDocument();
    expect(screen.getByText('88%')).toBeInTheDocument();
  });

  it('renders voice settings with primary and secondary tone', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('status')) return { data: mockStatusData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('checks')) return { data: mockChecksData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Professional')).toBeInTheDocument();
    expect(screen.getByText('Friendly')).toBeInTheDocument();
    expect(screen.getByText('Aggressive')).toBeInTheDocument();
    expect(screen.getByText('Sarcastic')).toBeInTheDocument();
  });

  it('renders visual compliance checks with progress info', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('status')) return { data: mockStatusData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('checks')) return { data: mockChecksData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Logo Placement')).toBeInTheDocument();
    expect(screen.getByText('Color Palette')).toBeInTheDocument();
    expect(screen.getByText('Typography')).toBeInTheDocument();
    expect(screen.getByText('2 outliers')).toBeInTheDocument();
    expect(screen.getByText('5 deviations')).toBeInTheDocument();
  });

  it('renders campaign compliance table with data', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('status')) return { data: mockStatusData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('checks')) return { data: mockChecksData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Brand Guidelines Compliance')).toBeInTheDocument();
    expect(screen.getByText('Summer Sale US')).toBeInTheDocument();
    expect(screen.getByText('Google Ads')).toBeInTheDocument();
    expect(screen.getByText('TikTok')).toBeInTheDocument();
  });

  it('filters campaigns by status when filter buttons are clicked', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('status')) return { data: mockStatusData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('checks')) return { data: mockChecksData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    const compButton = screen.getByText('Compliant');
    fireEvent.click(compButton);
    expect(screen.getByText('Summer Sale US')).toBeInTheDocument();
    // TikTok channel should disappear from the table since EU Promo (violation) is filtered out
    expect(screen.queryByText('TikTok')).not.toBeInTheDocument();
  });

  it('renders flagged issues with severity indicators', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('status')) return { data: mockStatusData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('checks')) return { data: mockChecksData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Tone Mismatch')).toBeInTheDocument();
    expect(screen.getByText('Visual Deviation')).toBeInTheDocument();
    expect(screen.getByText('Overly casual language detected')).toBeInTheDocument();
  });

  it('renders brand asset library with asset details', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('status')) return { data: mockStatusData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('checks')) return { data: mockChecksData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Primary Logo Pack')).toBeInTheDocument();
    expect(screen.getByText('Brand Guidelines PDF')).toBeInTheDocument();
    expect(screen.getByText('2 packages')).toBeInTheDocument();
  });

  it('renders empty state when no radar data exists', () => {
    const emptyStatusData = { ...mockStatusData, radarData: [] };
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('status')) return { data: emptyStatusData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('checks')) return { data: mockChecksData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('No radar data')).toBeInTheDocument();
  });

  it('renders Run Analysis button in header', () => {
    mockUseApiQuery.mockImplementation(() => ({
      data: null, loading: false, error: null, refetch: vi.fn(),
    }));
    renderComponent();
    expect(screen.getByText('Run Analysis')).toBeInTheDocument();
  });

  it('renders error state for checks API failure', () => {
    const error = new Error('Checks failed to load');
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('status')) return { data: mockStatusData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('checks')) return { data: null, loading: false, error, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getAllByText('Checks failed to load').length).toBeGreaterThan(0);
  });

  it('shows tone detection accuracy and campaign usage stats', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('status')) return { data: mockStatusData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('checks')) return { data: mockChecksData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('96%')).toBeInTheDocument();
    expect(screen.getByText('42 / 47')).toBeInTheDocument();
  });
});
