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
  AreaChart: ({ children }: { children?: ReactNode }) => createElement('div', { 'data-testid': 'area-chart' }, children),
  BarChart: ({ children }: { children?: ReactNode }) => createElement('div', { 'data-testid': 'bar-chart' }, children),
  LineChart: ({ children }: { children?: ReactNode }) => createElement('div', { 'data-testid': 'line-chart' }, children),
  PieChart: ({ children }: { children?: ReactNode }) => createElement('div', { 'data-testid': 'pie-chart' }, children),
  RadarChart: ({ children }: { children?: ReactNode }) => createElement('div', { 'data-testid': 'radar-chart' }, children),
  ComposedChart: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  Area: () => null, Bar: () => null, Line: () => null, Pie: () => null, Radar: () => null,
  XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null,
  Legend: () => null, Cell: () => null, PolarGrid: () => null, PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null, Funnel: () => null, FunnelChart: () => null,
  ScatterChart: () => null, Scatter: () => null, ZAxis: () => null,
}));

vi.mock('../../src/services/api', () => ({
  default: { put: vi.fn(() => Promise.resolve({ data: {} })) },
}));

import { useApiQuery } from '../../src/hooks/useApi';
import PaidAds from '../../src/pages/PaidAds';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockCampaigns = {
  campaigns: [
    {
      id: 'c1', name: 'US Brand Awareness', platform: 'google' as const, country: 'United States',
      status: 'active' as const, budget: 50000, spent: 32000, impressions: 1200000,
      clicks: 48000, conversions: 1200, roas: 4.5, cpc: 0.67, ctr: 4.0,
    },
    {
      id: 'c2', name: 'DE Performance Max', platform: 'meta' as const, country: 'Germany',
      status: 'active' as const, budget: 30000, spent: 22000, impressions: 800000,
      clicks: 32000, conversions: 960, roas: 3.8, cpc: 0.69, ctr: 4.0,
    },
    {
      id: 'c3', name: 'JP TikTok Launch', platform: 'tiktok' as const, country: 'Japan',
      status: 'paused' as const, budget: 20000, spent: 8000, impressions: 400000,
      clicks: 20000, conversions: 400, roas: 2.5, cpc: 0.40, ctr: 5.0,
    },
    {
      id: 'c4', name: 'UK Draft Campaign', platform: 'google' as const, country: 'United Kingdom',
      status: 'draft' as const, budget: 10000, spent: 0, impressions: 0,
      clicks: 0, conversions: 0, roas: 0, cpc: 0, ctr: 0,
    },
  ],
  total: 4,
};

const mockMetrics = {
  daily: [
    { day: 'Mon Jan 1', spend: 5000, conversions: 120 },
    { day: 'Tue Jan 2', spend: 5500, conversions: 135 },
  ],
  platformRoas: [
    { platform: 'Google', roas: 4.2 },
    { platform: 'Meta', roas: 3.8 },
    { platform: 'TikTok', roas: 2.5 },
  ],
  totals: {
    totalSpend: 62000, totalSpendChange: 12.5,
    totalRevenue: 248000, totalRevenueChange: 15.3,
    averageRoas: 3.5, averageRoasChange: 2.1,
    activeCampaigns: 3, activeCampaignsChange: 1,
  },
};

const mockRecommendations = {
  recommendations: [
    {
      id: 1, type: 'increase' as const, title: 'Increase US Budget',
      description: 'US campaigns showing strong ROAS, consider 20% budget increase.',
      impact: '+$15K estimated additional revenue', urgency: 'high' as const,
    },
    {
      id: 2, type: 'pause' as const, title: 'Pause JP TikTok',
      description: 'Japan TikTok campaign underperforming below threshold.',
      impact: 'Save $400/day', urgency: 'medium' as const,
    },
  ],
};

const mockRetargeting = {
  audiences: [
    { name: 'Cart Abandoners', size: 45000, matchRate: 78, status: 'active' as const, platforms: ['Google', 'Meta'] },
    { name: 'Product Viewers', size: 120000, matchRate: 65, status: 'active' as const, platforms: ['Meta', 'TikTok'] },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const renderPage = () =>
  render(createElement(BrowserRouter, null, createElement(PaidAds)));

function mockQueries(overrides: {
  campaigns?: Partial<ReturnType<typeof useApiQuery>>;
  metrics?: Partial<ReturnType<typeof useApiQuery>>;
  recommendations?: Partial<ReturnType<typeof useApiQuery>>;
  retargeting?: Partial<ReturnType<typeof useApiQuery>>;
} = {}) {
  const defaultReturn = { data: null, loading: false, error: null, refetch: vi.fn() };
  vi.mocked(useApiQuery).mockImplementation((url: string) => {
    if (url === '/v1/campaigns' || url.includes('/integrations/ads/')) return { ...defaultReturn, ...overrides.campaigns };
    if (url === '/v1/campaigns/metrics') return { ...defaultReturn, ...overrides.metrics };
    if (url === '/v1/campaigns/recommendations') return { ...defaultReturn, ...overrides.recommendations };
    if (url === '/v1/campaigns/retargeting') return { ...defaultReturn, ...overrides.retargeting };
    return defaultReturn;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PaidAds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Loading States ----

  it('shows loading skeleton when metrics are loading', () => {
    mockQueries({
      campaigns: { loading: true },
      metrics: { loading: true },
      recommendations: { loading: true },
      retargeting: { loading: true },
    });
    const { container } = renderPage();
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBeGreaterThan(0);
  });

  // ---- Page Header ----

  it('renders the page header with correct title', () => {
    mockQueries({
      campaigns: { data: mockCampaigns },
      metrics: { data: mockMetrics },
      recommendations: { data: mockRecommendations },
      retargeting: { data: mockRetargeting },
    });
    renderPage();
    expect(screen.getByText('Paid Ads Architecture')).toBeInTheDocument();
    expect(screen.getByText(/Multi-Platform Campaign Management/)).toBeInTheDocument();
  });

  // ---- KPI Row ----

  it('renders KPI cards when metrics are loaded', () => {
    mockQueries({
      campaigns: { data: mockCampaigns },
      metrics: { data: mockMetrics },
      recommendations: { data: mockRecommendations },
      retargeting: { data: mockRetargeting },
    });
    renderPage();
    expect(screen.getByText('Total Ad Spend')).toBeInTheDocument();
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getByText('Average ROAS')).toBeInTheDocument();
    expect(screen.getByText('Active Campaigns')).toBeInTheDocument();
  });

  it('shows error display when metrics API errors', () => {
    mockQueries({
      campaigns: { data: mockCampaigns },
      metrics: { error: new Error('Metrics Error') },
      recommendations: { data: mockRecommendations },
      retargeting: { data: mockRetargeting },
    });
    renderPage();
    expect(screen.getAllByText(/error|retry/i).length).toBeGreaterThan(0);
  });

  // ---- Platform Filter Tabs ----

  it('renders platform filter tabs', () => {
    mockQueries({
      campaigns: { data: mockCampaigns },
      metrics: { data: mockMetrics },
      recommendations: { data: mockRecommendations },
      retargeting: { data: mockRetargeting },
    });
    renderPage();
    expect(screen.getAllByText('All').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Google').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Meta').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TikTok').length).toBeGreaterThan(0);
  });

  // ---- Campaign Table ----

  it('renders campaign performance table with data', () => {
    mockQueries({
      campaigns: { data: mockCampaigns },
      metrics: { data: mockMetrics },
      recommendations: { data: mockRecommendations },
      retargeting: { data: mockRetargeting },
    });
    renderPage();
    expect(screen.getByText('Campaign Performance')).toBeInTheDocument();
    expect(screen.getByText('US Brand Awareness')).toBeInTheDocument();
    expect(screen.getByText('DE Performance Max')).toBeInTheDocument();
    expect(screen.getByText('JP TikTok Launch')).toBeInTheDocument();
  });

  it('shows loading skeleton for campaigns table', () => {
    mockQueries({
      campaigns: { loading: true },
      metrics: { data: mockMetrics },
      recommendations: { data: mockRecommendations },
      retargeting: { data: mockRetargeting },
    });
    const { container } = renderPage();
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBeGreaterThan(0);
  });

  it('shows error display when campaigns API errors', () => {
    mockQueries({
      campaigns: { error: new Error('Campaigns Error') },
      metrics: { data: mockMetrics },
      recommendations: { data: mockRecommendations },
      retargeting: { data: mockRetargeting },
    });
    renderPage();
    expect(screen.getByText(/Failed to load campaigns/)).toBeInTheDocument();
  });

  // ---- Charts ----

  it('renders performance trend chart', () => {
    mockQueries({
      campaigns: { data: mockCampaigns },
      metrics: { data: mockMetrics },
      recommendations: { data: mockRecommendations },
      retargeting: { data: mockRetargeting },
    });
    renderPage();
    expect(screen.getByText('Performance Trend')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('renders ROAS by platform chart', () => {
    mockQueries({
      campaigns: { data: mockCampaigns },
      metrics: { data: mockMetrics },
      recommendations: { data: mockRecommendations },
      retargeting: { data: mockRetargeting },
    });
    renderPage();
    expect(screen.getByText('ROAS by Platform')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  // ---- AI Recommendations ----

  it('renders AI recommendations section', () => {
    mockQueries({
      campaigns: { data: mockCampaigns },
      metrics: { data: mockMetrics },
      recommendations: { data: mockRecommendations },
      retargeting: { data: mockRetargeting },
    });
    renderPage();
    expect(screen.getByText('AI Recommendations')).toBeInTheDocument();
    expect(screen.getByText('Increase US Budget')).toBeInTheDocument();
    expect(screen.getByText('Pause JP TikTok')).toBeInTheDocument();
  });

  it('shows loading skeleton for recommendations', () => {
    mockQueries({
      campaigns: { data: mockCampaigns },
      metrics: { data: mockMetrics },
      recommendations: { loading: true },
      retargeting: { data: mockRetargeting },
    });
    const { container } = renderPage();
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBeGreaterThan(0);
  });

  // ---- Retargeting ----

  it('renders retargeting audiences section', () => {
    mockQueries({
      campaigns: { data: mockCampaigns },
      metrics: { data: mockMetrics },
      recommendations: { data: mockRecommendations },
      retargeting: { data: mockRetargeting },
    });
    renderPage();
    expect(screen.getByText('Retargeting Audiences')).toBeInTheDocument();
    expect(screen.getByText('Cart Abandoners')).toBeInTheDocument();
    expect(screen.getByText('Product Viewers')).toBeInTheDocument();
  });

  // ---- Create Campaign Button ----

  it('renders New Campaign button', () => {
    mockQueries({
      campaigns: { data: mockCampaigns },
      metrics: { data: mockMetrics },
      recommendations: { data: mockRecommendations },
      retargeting: { data: mockRetargeting },
    });
    renderPage();
    expect(screen.getByText('New Campaign')).toBeInTheDocument();
  });

  it('shows campaign modal when New Campaign is clicked', () => {
    mockQueries({
      campaigns: { data: mockCampaigns },
      metrics: { data: mockMetrics },
      recommendations: { data: mockRecommendations },
      retargeting: { data: mockRetargeting },
    });
    renderPage();
    fireEvent.click(screen.getByText('New Campaign'));
    expect(screen.getByText('Create Campaign')).toBeInTheDocument();
  });
});
