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
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => createElement('div', { 'data-testid': 'responsive-container' }, children),
  AreaChart: ({ children }: { children?: ReactNode }) => createElement('div', { 'data-testid': 'area-chart' }, children),
  BarChart: ({ children }: { children?: ReactNode }) => createElement('div', { 'data-testid': 'bar-chart' }, children),
  LineChart: ({ children }: { children?: ReactNode }) => createElement('div', { 'data-testid': 'line-chart' }, children),
  PieChart: ({ children }: { children?: ReactNode }) => createElement('div', { 'data-testid': 'pie-chart' }, children),
  RadarChart: ({ children }: { children?: ReactNode }) => createElement('div', { 'data-testid': 'radar-chart' }, children),
  ComposedChart: ({ children }: { children?: ReactNode }) => createElement('div', { 'data-testid': 'composed-chart' }, children),
  Area: () => null, Bar: () => null, Line: () => null, Pie: () => null, Radar: () => null,
  XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null,
  Legend: () => null, Cell: () => null, PolarGrid: () => null, PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null, Funnel: () => null, FunnelChart: () => null,
  ScatterChart: () => null, Scatter: () => null, ZAxis: () => null,
}));

import { useApiQuery } from '../../src/hooks/useApi';
import Analytics from '../../src/pages/Analytics';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockSpendSummary = {
  total_spend: 150000,
  total_revenue: 620000,
  roas: 4.1,
  cpc: 0.85,
  ctr: 3.8,
  daily: [
    { date: 'Jan 1', revenue: 20000, spend: 5000 },
    { date: 'Jan 2', revenue: 22000, spend: 5500 },
    { date: 'Jan 3', revenue: 21000, spend: 5200 },
  ],
};

const mockCampaigns = [
  {
    id: 'c1', name: 'US Search', platform: 'google', country: 'US',
    status: 'active', budget: 50000, spent: 32000, impressions: 1200000,
    clicks: 48000, conversions: 1200, roas: 4.5, cpc: 0.67, ctr: 4.0,
  },
];

const mockOverview = {
  cac: { value: 28.50, change: -5.2, trend: 'down' as const },
  ltv: { value: 185, change: 8.3, trend: 'up' as const },
  roas: { value: 4.1, change: 3.5, trend: 'up' as const },
  mer: { value: 3.2, change: 2.1, trend: 'up' as const },
  funnel: [
    { label: 'Impressions', value: 5000000, formatted: '5M' },
    { label: 'Clicks', value: 200000, formatted: '200K' },
    { label: 'Add to Cart', value: 25000, formatted: '25K' },
    { label: 'Checkout', value: 12000, formatted: '12K' },
    { label: 'Purchase', value: 8000, formatted: '8K' },
  ],
  channel_attribution: [
    { name: 'Google', value: 35, revenue: '$217K' },
    { name: 'Meta', value: 28, revenue: '$174K' },
    { name: 'TikTok', value: 18, revenue: '$112K' },
    { name: 'Bing', value: 12, revenue: '$74K' },
    { name: 'Snap', value: 7, revenue: '$43K' },
  ],
  country_performance: [
    { country: 'United States', revenue: 250000, spend: 60000, roas: 4.2 },
    { country: 'Germany', revenue: 120000, spend: 30000, roas: 4.0 },
    { country: 'Japan', revenue: 85000, spend: 25000, roas: 3.4 },
  ],
  ltv_cac_trend: [
    { month: 'Aug', ltvCacRatio: 5.8, ltv: 165, cac: 28.5 },
    { month: 'Sep', ltvCacRatio: 6.1, ltv: 172, cac: 28.2 },
    { month: 'Oct', ltvCacRatio: 6.3, ltv: 178, cac: 28.3 },
    { month: 'Nov', ltvCacRatio: 6.5, ltv: 185, cac: 28.5 },
  ],
  attribution_models: [
    { model: 'Last Click', google: 42, meta: 25, tiktok: 15, bing: 12, snap: 6, totalConversions: 8200, roas: 3.9 },
    { model: 'Time Decay', google: 35, meta: 28, tiktok: 18, bing: 12, snap: 7, totalConversions: 8500, roas: 4.2 },
    { model: 'Linear', google: 30, meta: 30, tiktok: 20, bing: 13, snap: 7, totalConversions: 8400, roas: 4.0 },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const renderPage = () =>
  render(createElement(BrowserRouter, null, createElement(Analytics)));

function mockQueries(overrides: {
  spend?: Partial<ReturnType<typeof useApiQuery>>;
  campaigns?: Partial<ReturnType<typeof useApiQuery>>;
  overview?: Partial<ReturnType<typeof useApiQuery>>;
} = {}) {
  const defaultReturn = { data: null, loading: false, error: null, refetch: vi.fn() };
  vi.mocked(useApiQuery).mockImplementation((url: string) => {
    if (url === '/v1/campaigns/spend/summary') return { ...defaultReturn, ...overrides.spend };
    if (url === '/v1/campaigns') return { ...defaultReturn, ...overrides.campaigns };
    if (url === '/v1/dashboard/overview') return { ...defaultReturn, ...overrides.overview };
    return defaultReturn;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Loading states ----

  it('shows KPI skeletons when overview is loading', () => {
    mockQueries({
      overview: { loading: true },
      spend: { loading: true },
      campaigns: { loading: true },
    });
    const { container } = renderPage();
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBeGreaterThan(0);
  });

  it('shows chart skeletons when spend is loading', () => {
    mockQueries({
      overview: { data: mockOverview },
      spend: { loading: true },
      campaigns: { data: mockCampaigns },
    });
    const { container } = renderPage();
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBeGreaterThan(0);
  });

  // ---- Error states ----

  it('shows error display when overview API errors', () => {
    mockQueries({
      overview: { error: new Error('Overview Error') },
      spend: { data: mockSpendSummary },
      campaigns: { data: mockCampaigns },
    });
    renderPage();
    expect(screen.getAllByText(/retry/i).length).toBeGreaterThan(0);
  });

  it('shows error display when spend API errors', () => {
    mockQueries({
      overview: { data: mockOverview },
      spend: { error: new Error('Spend Error') },
      campaigns: { data: mockCampaigns },
    });
    renderPage();
    expect(screen.getAllByText(/retry/i).length).toBeGreaterThan(0);
  });

  // ---- Page header ----

  it('renders page header with correct title and subtitle', () => {
    mockQueries({
      overview: { data: mockOverview },
      spend: { data: mockSpendSummary },
      campaigns: { data: mockCampaigns },
    });
    renderPage();
    expect(screen.getByText('Performance Analytics')).toBeInTheDocument();
    expect(screen.getByText(/Unified Dashboard/)).toBeInTheDocument();
  });

  // ---- Date range picker ----

  it('renders date range picker buttons', () => {
    mockQueries({
      overview: { data: mockOverview },
      spend: { data: mockSpendSummary },
      campaigns: { data: mockCampaigns },
    });
    renderPage();
    expect(screen.getByText('7d')).toBeInTheDocument();
    expect(screen.getByText('30d')).toBeInTheDocument();
    expect(screen.getByText('90d')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  // ---- KPI cards ----

  it('renders KPI cards with correct labels', () => {
    mockQueries({
      overview: { data: mockOverview },
      spend: { data: mockSpendSummary },
      campaigns: { data: mockCampaigns },
    });
    renderPage();
    expect(screen.getByText('Customer Acquisition Cost')).toBeInTheDocument();
    expect(screen.getByText('Lifetime Value')).toBeInTheDocument();
    expect(screen.getByText('Return on Ad Spend')).toBeInTheDocument();
    expect(screen.getByText('Marketing Efficiency Ratio')).toBeInTheDocument();
  });

  // ---- Charts ----

  it('renders revenue and ad spend chart', () => {
    mockQueries({
      overview: { data: mockOverview },
      spend: { data: mockSpendSummary },
      campaigns: { data: mockCampaigns },
    });
    renderPage();
    expect(screen.getByText('Revenue & Ad Spend')).toBeInTheDocument();
    expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
  });

  it('renders channel attribution pie chart section', () => {
    mockQueries({
      overview: { data: mockOverview },
      spend: { data: mockSpendSummary },
      campaigns: { data: mockCampaigns },
    });
    renderPage();
    expect(screen.getByText('Channel Attribution')).toBeInTheDocument();
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
  });

  // ---- Conversion funnel ----

  it('renders conversion funnel with steps', () => {
    mockQueries({
      overview: { data: mockOverview },
      spend: { data: mockSpendSummary },
      campaigns: { data: mockCampaigns },
    });
    renderPage();
    expect(screen.getByText('Conversion Funnel')).toBeInTheDocument();
    expect(screen.getByText('Impressions')).toBeInTheDocument();
    expect(screen.getByText('5M')).toBeInTheDocument();
    expect(screen.getByText('Clicks')).toBeInTheDocument();
    expect(screen.getByText('200K')).toBeInTheDocument();
  });

  it('renders funnel summary stats', () => {
    mockQueries({
      overview: { data: mockOverview },
      spend: { data: mockSpendSummary },
      campaigns: { data: mockCampaigns },
    });
    renderPage();
    expect(screen.getByText('Click-Through Rate')).toBeInTheDocument();
    expect(screen.getByText('Cart Rate')).toBeInTheDocument();
    expect(screen.getByText('Checkout Rate')).toBeInTheDocument();
    expect(screen.getByText('Purchase Rate')).toBeInTheDocument();
  });

  // ---- Country performance ----

  it('renders country performance chart section', () => {
    mockQueries({
      overview: { data: mockOverview },
      spend: { data: mockSpendSummary },
      campaigns: { data: mockCampaigns },
    });
    renderPage();
    expect(screen.getByText('Country Performance')).toBeInTheDocument();
  });

  // ---- LTV/CAC trend ----

  it('renders LTV/CAC ratio trend chart', () => {
    mockQueries({
      overview: { data: mockOverview },
      spend: { data: mockSpendSummary },
      campaigns: { data: mockCampaigns },
    });
    renderPage();
    expect(screen.getByText('LTV / CAC Ratio Trend')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  // ---- Attribution model comparison ----

  it('renders attribution model comparison table', () => {
    mockQueries({
      overview: { data: mockOverview },
      spend: { data: mockSpendSummary },
      campaigns: { data: mockCampaigns },
    });
    renderPage();
    expect(screen.getByText('Cross-Channel Attribution Model Comparison')).toBeInTheDocument();
    expect(screen.getByText('Last Click')).toBeInTheDocument();
    expect(screen.getByText(/Time Decay/)).toBeInTheDocument();
    expect(screen.getByText('Linear')).toBeInTheDocument();
  });

  it('highlights the recommended attribution model', () => {
    mockQueries({
      overview: { data: mockOverview },
      spend: { data: mockSpendSummary },
      campaigns: { data: mockCampaigns },
    });
    renderPage();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
  });

  // ---- Action buttons ----

  it('renders Refresh, Filters, and Export buttons', () => {
    mockQueries({
      overview: { data: mockOverview },
      spend: { data: mockSpendSummary },
      campaigns: { data: mockCampaigns },
    });
    renderPage();
    expect(screen.getByText('Refresh')).toBeInTheDocument();
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
  });
});
