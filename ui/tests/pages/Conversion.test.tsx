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
import Conversion from '../../src/pages/Conversion';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockOverviewData = {
  kpis: {
    conversionRate: { value: 3.8, change: 0.4, trend: 'up' as const },
    cartAbandonment: { value: 68.2, change: -2.1, trend: 'down' as const },
    avgOrderValue: { value: 124.50, change: 5.3, trend: 'up' as const },
    checkoutCompletion: { value: 42.1, change: 1.8, trend: 'up' as const },
  },
  funnel: {
    steps: [
      { label: 'Landing Page', visitors: 50000, pct: 100 },
      { label: 'Product View', visitors: 32000, pct: 64 },
      { label: 'Add to Cart', visitors: 12000, pct: 24 },
      { label: 'Checkout Start', visitors: 6000, pct: 12 },
      { label: 'Purchase', visitors: 1900, pct: 3.8 },
    ],
    dropOffs: [
      { from: 'Landing Page', to: 'Product View', rate: 36 },
      { from: 'Product View', to: 'Add to Cart', rate: 62.5 },
      { from: 'Add to Cart', to: 'Checkout Start', rate: 50 },
      { from: 'Checkout Start', to: 'Purchase', rate: 68.3 },
    ],
  },
  countryFunnel: [
    { country: 'US', landing: 100, productView: 65, addToCart: 28, checkout: 14, purchase: 4.2 },
    { country: 'DE', landing: 100, productView: 58, addToCart: 22, checkout: 11, purchase: 3.5 },
  ],
  heatmapInsights: [
    { area: 'Hero Banner', insight: 'High click concentration on CTA button', metric: '82%', type: 'click', color: 'bg-red-500' },
    { area: 'Product Grid', insight: 'Users scroll past first 3 items quickly', metric: '45%', type: 'scroll', color: 'bg-yellow-500' },
  ],
  pageSpeed: {
    metrics: [
      { metric: 'LCP', label: 'Largest Contentful Paint', value: 2.1, unit: 's', target: 2.5, status: 'good' as const },
      { metric: 'FID', label: 'First Input Delay', value: 85, unit: 'ms', target: 100, status: 'good' as const },
    ],
    lighthouse: { performance: 92, accessibility: 88, bestPractices: 95 },
  },
  abTests: [
    { id: 1, name: 'Checkout Flow Simplification', status: 'running' as const, variant: 'Single Page', control: 'Multi Step', variantCvr: 4.2, controlCvr: 3.5, confidence: 89, daysRunning: 12, sampleSize: 25000 },
  ],
  conversionTrend: [
    { week: 'W1', cvr: 3.2, aov: 118, cartAbandonment: 71 },
    { week: 'W2', cvr: 3.5, aov: 121, cartAbandonment: 69 },
  ],
  aiInsight: 'Users from mobile devices show 40% higher cart abandonment. Consider optimizing mobile checkout.',
};

const mockCampaignsData = {
  campaigns: [],
  improvementMatrix: [
    { initiative: 'Mobile Checkout Optimization', impact: 85, effort: 40, priority: 1, category: 'UX' },
    { initiative: 'Cart Recovery Emails', impact: 70, effort: 25, priority: 2, category: 'Marketing' },
  ],
  aiSummary: 'Focus on mobile checkout optimization for highest ROI.',
};

// Helper - Conversion uses 2 useApiQuery calls: overview, campaigns
function setupMocks(overrides: {
  overview?: { data: unknown; loading: boolean; error: unknown };
  campaigns?: { data: unknown; loading: boolean; error: unknown };
} = {}) {
  const defaultReturn = { data: null, loading: false, error: null, refetch: vi.fn() };
  vi.mocked(useApiQuery)
    .mockReturnValueOnce({ ...defaultReturn, ...overrides.overview })
    .mockReturnValueOnce({ ...defaultReturn, ...overrides.campaigns });
}

const renderPage = () =>
  render(createElement(BrowserRouter, null, createElement(Conversion)));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Conversion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Loading states ----

  it('shows skeletons when data is loading', () => {
    setupMocks({
      overview: { data: null, loading: true, error: null },
      campaigns: { data: null, loading: true, error: null },
    });
    const { container } = renderPage();
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders page header with title', () => {
    setupMocks({
      overview: { data: null, loading: true, error: null },
      campaigns: { data: null, loading: true, error: null },
    });
    renderPage();
    expect(screen.getByText('Conversion Optimization')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    setupMocks({
      overview: { data: null, loading: true, error: null },
      campaigns: { data: null, loading: true, error: null },
    });
    renderPage();
    expect(screen.getByText('Funnel Analysis, UX Recommendations & Checkout Optimization')).toBeInTheDocument();
  });

  // ---- Error states ----

  it('shows error display when overview data fails', () => {
    setupMocks({
      overview: { data: null, loading: false, error: new Error('Overview failed') },
      campaigns: { data: mockCampaignsData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getAllByText(/retry/i).length).toBeGreaterThan(0);
  });

  // ---- Data loaded states ----

  it('renders KPI cards when data is loaded', () => {
    setupMocks({
      overview: { data: mockOverviewData, loading: false, error: null },
      campaigns: { data: mockCampaignsData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Conversion Rate')).toBeInTheDocument();
    expect(screen.getByText('Cart Abandonment')).toBeInTheDocument();
    expect(screen.getByText('Avg Order Value')).toBeInTheDocument();
    expect(screen.getByText('Checkout Completion')).toBeInTheDocument();
  });

  it('renders conversion funnel with step labels', () => {
    setupMocks({
      overview: { data: mockOverviewData, loading: false, error: null },
      campaigns: { data: mockCampaignsData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Conversion Funnel')).toBeInTheDocument();
    expect(screen.getByText('Landing Page')).toBeInTheDocument();
    expect(screen.getByText('Product View')).toBeInTheDocument();
    expect(screen.getByText('Add to Cart')).toBeInTheDocument();
  });

  it('renders heatmap insights section', () => {
    setupMocks({
      overview: { data: mockOverviewData, loading: false, error: null },
      campaigns: { data: mockCampaignsData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Heatmap Insights')).toBeInTheDocument();
    expect(screen.getByText('High click concentration on CTA button')).toBeInTheDocument();
  });

  it('renders page speed metrics section', () => {
    setupMocks({
      overview: { data: mockOverviewData, loading: false, error: null },
      campaigns: { data: mockCampaignsData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Page Speed Metrics')).toBeInTheDocument();
    expect(screen.getByText('LCP')).toBeInTheDocument();
  });

  it('renders A/B test results table', () => {
    setupMocks({
      overview: { data: mockOverviewData, loading: false, error: null },
      campaigns: { data: mockCampaignsData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Checkout Optimization - A/B Test Results')).toBeInTheDocument();
    expect(screen.getByText('Checkout Flow Simplification')).toBeInTheDocument();
  });

  it('renders AI improvement priority matrix', () => {
    setupMocks({
      overview: { data: mockOverviewData, loading: false, error: null },
      campaigns: { data: mockCampaignsData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('AI-Generated Improvement Priority Matrix')).toBeInTheDocument();
    expect(screen.getByText('Mobile Checkout Optimization')).toBeInTheDocument();
    expect(screen.getByText('Cart Recovery Emails')).toBeInTheDocument();
  });

  it('renders UX recommendations section with empty state', () => {
    setupMocks({
      overview: { data: mockOverviewData, loading: false, error: null },
      campaigns: { data: mockCampaignsData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('UX Recommendations')).toBeInTheDocument();
    expect(screen.getByText('No recommendations yet')).toBeInTheDocument();
  });

  it('shows Run Optimization button', () => {
    setupMocks({
      overview: { data: mockOverviewData, loading: false, error: null },
      campaigns: { data: mockCampaignsData, loading: false, error: null },
    });
    renderPage();
    expect(screen.getAllByText('Run Optimization').length).toBeGreaterThan(0);
  });
});
