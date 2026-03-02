import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => createElement('div', null, children),
  AreaChart: ({ children }: any) => createElement('div', null, children),
  BarChart: ({ children }: any) => createElement('div', null, children),
  LineChart: ({ children }: any) => createElement('div', null, children),
  PieChart: ({ children }: any) => createElement('div', null, children),
  RadarChart: ({ children }: any) => createElement('div', null, children),
  ComposedChart: ({ children }: any) => createElement('div', null, children),
  Area: () => null, Bar: () => null, Line: () => null, Pie: () => null, Radar: () => null,
  XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null,
  Legend: () => null, Cell: () => null, PolarGrid: () => null, PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null, ScatterChart: () => null, Scatter: () => null, ZAxis: () => null,
  Funnel: () => null, FunnelChart: () => null,
}));

import { useApiQuery } from '../../src/hooks/useApi';
import CompetitiveIntel from '../../src/pages/CompetitiveIntel';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockCompetitorData = {
  competitors: [
    { name: 'GlobalReach AI', estAdSpend: '$2.5M/mo', topChannels: ['Google', 'Meta'], marketShare: 28, trend: 'growing' as const, threatLevel: 'critical' as const },
    { name: 'AdScale Intl', estAdSpend: '$1.8M/mo', topChannels: ['Google', 'TikTok'], marketShare: 22, trend: 'stable' as const, threatLevel: 'warning' as const },
    { name: 'CrossBorder Labs', estAdSpend: '$900K/mo', topChannels: ['Meta', 'LinkedIn'], marketShare: 12, trend: 'declining' as const, threatLevel: 'active' as const },
  ],
  marketShareData: [
    { name: 'Our Brand', share: 18 },
    { name: 'GlobalReach AI', share: 28 },
    { name: 'AdScale Intl', share: 22 },
  ],
  activityTimeline: [
    { id: 1, competitor: 'GlobalReach AI', type: 'campaign' as const, description: 'Launched new campaign in DACH region', date: 'Jan 15', daysAgo: 2 },
    { id: 2, competitor: 'AdScale Intl', type: 'price_change' as const, description: 'Reduced pricing by 15% in APAC', date: 'Jan 14', daysAgo: 3 },
  ],
  radarData: [
    { metric: 'Brand Awareness', ourBrand: 75, globalReach: 90, adScale: 70 },
    { metric: 'Ad Spend', ourBrand: 60, globalReach: 85, adScale: 72 },
    { metric: 'Market Coverage', ourBrand: 65, globalReach: 80, adScale: 68 },
  ],
  messagingGaps: [
    { id: 1, opportunity: 'Sustainability messaging in EU', impact: 'high' as const, market: 'Europe', detail: 'Competitors not emphasizing eco-friendly practices' },
    { id: 2, opportunity: 'Local language support in LATAM', impact: 'medium' as const, market: 'Latin America', detail: 'Gap in Portuguese and Spanish content' },
  ],
  socialMonitoring: [
    { competitor: 'GlobalReach AI', platform: 'LinkedIn', postsPerWeek: 12, avgEngagement: 4.2, followerGrowth: 15, topContentType: 'Case Studies' },
    { competitor: 'Our Brand', platform: 'LinkedIn', postsPerWeek: 8, avgEngagement: 3.8, followerGrowth: 12, topContentType: 'Thought Leadership' },
  ],
  postFrequencyData: [
    { name: 'Mon', globalReach: 3, adScale: 2, ourBrand: 2, crossBorder: 1 },
    { name: 'Tue', globalReach: 4, adScale: 3, ourBrand: 3, crossBorder: 2 },
  ],
  kpis: {
    competitorsTracked: 8,
    competitorsTrackedChange: 2,
    marketShare: '18',
    marketShareChange: 1.5,
    shareOfVoice: '22',
    shareOfVoiceChange: 3.2,
    threatAlerts: 5,
    threatAlertsChange: -2,
  },
};

const mockTrendsData = {
  trendAlerts: [
    { id: 1, trend: 'AI-powered ad targeting adoption', category: 'Technology', relevance: 'high' as const, description: 'Major competitors adopting AI for ad targeting', detectedAt: '2 days ago' },
    { id: 2, trend: 'Privacy-first marketing shift', category: 'Regulation', relevance: 'medium' as const, description: 'Industry moving towards cookieless tracking', detectedAt: '1 week ago' },
  ],
};

// Helper - CompetitiveIntel uses 2 useApiQuery calls: competitors, trends
function setupMocks(overrides: {
  competitors?: { data: any; loading: boolean; error: any };
  trends?: { data: any; loading: boolean; error: any };
} = {}) {
  const defaultReturn = { data: null, loading: false, error: null, refetch: vi.fn() };
  (useApiQuery as any)
    .mockReturnValueOnce({ ...defaultReturn, ...overrides.competitors })
    .mockReturnValueOnce({ ...defaultReturn, ...overrides.trends });
}

const renderPage = () =>
  render(createElement(BrowserRouter, null, createElement(CompetitiveIntel)));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CompetitiveIntel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Loading states ----

  it('shows skeletons when competitor data is loading', () => {
    setupMocks({
      competitors: { data: null, loading: true, error: null },
      trends: { data: null, loading: true, error: null },
    });
    const { container } = renderPage();
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders page header with title', () => {
    setupMocks({
      competitors: { data: null, loading: true, error: null },
      trends: { data: null, loading: true, error: null },
    });
    renderPage();
    expect(screen.getByText('Competitive Intelligence')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    setupMocks({
      competitors: { data: null, loading: true, error: null },
      trends: { data: null, loading: true, error: null },
    });
    renderPage();
    expect(screen.getByText('Competitor Monitoring, Trend Detection & Gap Analysis')).toBeInTheDocument();
  });

  // ---- Error states ----

  it('shows error display when competitor data fails', () => {
    setupMocks({
      competitors: { data: null, loading: false, error: new Error('Competitors failed') },
      trends: { data: mockTrendsData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getAllByText(/retry/i).length).toBeGreaterThan(0);
  });

  // ---- Data loaded states ----

  it('renders KPI cards when data is loaded', () => {
    setupMocks({
      competitors: { data: mockCompetitorData, loading: false, error: null },
      trends: { data: mockTrendsData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Competitors Tracked')).toBeInTheDocument();
    expect(screen.getAllByText('Market Share').length).toBeGreaterThan(0);
    expect(screen.getByText('Share of Voice')).toBeInTheDocument();
    expect(screen.getByText('Threat Alerts')).toBeInTheDocument();
  });

  it('renders competitor overview table with names', () => {
    setupMocks({
      competitors: { data: mockCompetitorData, loading: false, error: null },
      trends: { data: mockTrendsData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Competitor Overview')).toBeInTheDocument();
    expect(screen.getAllByText('GlobalReach AI').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AdScale Intl').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CrossBorder Labs').length).toBeGreaterThan(0);
  });

  it('renders market share comparison chart', () => {
    setupMocks({
      competitors: { data: mockCompetitorData, loading: false, error: null },
      trends: { data: mockTrendsData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Market Share Comparison')).toBeInTheDocument();
  });

  it('renders competitor activity timeline', () => {
    setupMocks({
      competitors: { data: mockCompetitorData, loading: false, error: null },
      trends: { data: mockTrendsData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Competitor Activity Timeline')).toBeInTheDocument();
    expect(screen.getByText('Launched new campaign in DACH region')).toBeInTheDocument();
  });

  it('renders competitive positioning radar chart', () => {
    setupMocks({
      competitors: { data: mockCompetitorData, loading: false, error: null },
      trends: { data: mockTrendsData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Competitive Positioning')).toBeInTheDocument();
  });

  it('renders messaging gap analysis section', () => {
    setupMocks({
      competitors: { data: mockCompetitorData, loading: false, error: null },
      trends: { data: mockTrendsData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Messaging Gap Analysis')).toBeInTheDocument();
    expect(screen.getByText('Sustainability messaging in EU')).toBeInTheDocument();
    expect(screen.getByText('Local language support in LATAM')).toBeInTheDocument();
  });

  it('renders social content monitoring table', () => {
    setupMocks({
      competitors: { data: mockCompetitorData, loading: false, error: null },
      trends: { data: mockTrendsData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Social Content Monitoring')).toBeInTheDocument();
  });

  it('renders trend detection alerts', () => {
    setupMocks({
      competitors: { data: mockCompetitorData, loading: false, error: null },
      trends: { data: mockTrendsData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Trend Detection Alerts')).toBeInTheDocument();
    expect(screen.getByText('AI-powered ad targeting adoption')).toBeInTheDocument();
    expect(screen.getByText('Privacy-first marketing shift')).toBeInTheDocument();
  });

  // ---- Empty states ----

  it('renders empty state when no competitors exist', () => {
    setupMocks({
      competitors: { data: { ...mockCompetitorData, competitors: [], marketShareData: [], activityTimeline: [], radarData: [], messagingGaps: [], socialMonitoring: [], postFrequencyData: [] }, loading: false, error: null },
      trends: { data: { trendAlerts: [] }, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('No competitors found')).toBeInTheDocument();
  });

  it('shows Run Agent button', () => {
    setupMocks({
      competitors: { data: mockCompetitorData, loading: false, error: null },
      trends: { data: mockTrendsData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Run Agent')).toBeInTheDocument();
  });
});
