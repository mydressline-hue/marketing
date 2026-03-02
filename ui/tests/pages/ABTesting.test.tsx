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
import ABTesting from '../../src/pages/ABTesting';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockTestsResponse = {
  tests: [
    {
      id: 'test-1',
      name: 'Homepage Hero Redesign',
      type: 'creative' as const,
      status: 'running' as const,
      variants: [
        { name: 'Control', conversionRate: 3.2, visitors: 15000, conversions: 480, isWinner: false },
        { name: 'Variant A', conversionRate: 4.1, visitors: 15000, conversions: 615, isWinner: false },
      ],
      confidence: 91,
      improvement: 28,
      startDate: '2024-01-15',
      duration: '14 days',
      trafficSplit: [50, 50],
      successMetric: 'conversion_rate',
    },
    {
      id: 'test-2',
      name: 'Pricing Page Test',
      type: 'pricing' as const,
      status: 'completed' as const,
      variants: [
        { name: 'Control', conversionRate: 2.8, visitors: 20000, conversions: 560, isWinner: false },
        { name: 'Variant B', conversionRate: 3.5, visitors: 20000, conversions: 700, isWinner: true },
      ],
      confidence: 97,
      improvement: 25,
      startDate: '2024-01-01',
      duration: '21 days',
      trafficSplit: [50, 50],
      successMetric: 'revenue_per_visitor',
    },
  ],
  summary: {
    activeTests: 5,
    activeTestsChange: 2,
    completed: 12,
    completedChange: 3,
    avgImprovement: '+18.5%',
    avgImprovementChange: 4.2,
    statisticalConfidence: '94.2%',
    statisticalConfidenceChange: 1.8,
  },
  improvementTrend: [
    { month: 'Jan', improvement: 12 },
    { month: 'Feb', improvement: 15 },
    { month: 'Mar', improvement: 18 },
  ],
};

const mockDetailResponse = {
  test: mockTestsResponse.tests[0],
  variantComparison: [
    { name: 'Control', conversionRate: 3.2, visitors: 15000, conversions: 480 },
    { name: 'Variant A', conversionRate: 4.1, visitors: 15000, conversions: 615 },
  ],
};

const mockAnalysisResponse = {
  recommendations: [
    { id: 'rec-1', title: 'Test CTA color on checkout', reason: 'Low click-through on checkout button', expectedImpact: '+12% CVR', priority: 'high' as const },
    { id: 'rec-2', title: 'Test product image carousel', reason: 'Competitors using carousel format', expectedImpact: '+8% engagement', priority: 'medium' as const },
  ],
};

// Helper - ABTesting uses 3 useApiQuery calls: tests, detail, analysis
function setupMocks(overrides: {
  tests?: { data: unknown; loading: boolean; error: unknown };
  detail?: { data: unknown; loading: boolean; error: unknown };
  analysis?: { data: unknown; loading: boolean; error: unknown };
} = {}) {
  const defaultReturn = { data: null, loading: false, error: null, refetch: vi.fn() };
  vi.mocked(useApiQuery)
    .mockReturnValueOnce({ ...defaultReturn, ...overrides.tests })
    .mockReturnValueOnce({ ...defaultReturn, ...overrides.detail })
    .mockReturnValueOnce({ ...defaultReturn, ...overrides.analysis });
}

const renderPage = () =>
  render(createElement(BrowserRouter, null, createElement(ABTesting)));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ABTesting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Loading states ----

  it('shows skeletons when tests are loading', () => {
    setupMocks({ tests: { data: null, loading: true, error: null } });
    const { container } = renderPage();
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders page header with title', () => {
    setupMocks({ tests: { data: null, loading: true, error: null } });
    renderPage();
    expect(screen.getByText('A/B Testing Engine')).toBeInTheDocument();
  });

  it('renders subtitle text', () => {
    setupMocks({ tests: { data: null, loading: true, error: null } });
    renderPage();
    expect(screen.getByText('Statistical Testing & Iterative Optimization')).toBeInTheDocument();
  });

  // ---- Error states ----

  it('shows error display when tests data fails', () => {
    setupMocks({ tests: { data: null, loading: false, error: new Error('Tests failed') } });
    renderPage();
    expect(screen.getAllByText(/retry/i).length).toBeGreaterThan(0);
  });

  // ---- Data loaded states ----

  it('renders KPI cards when summary data is loaded', () => {
    setupMocks({
      tests: { data: mockTestsResponse, loading: false, error: null },
      detail: { data: mockDetailResponse, loading: false, error: null },
      analysis: { data: mockAnalysisResponse, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Active Tests')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Avg Improvement')).toBeInTheDocument();
    expect(screen.getByText('Statistical Confidence')).toBeInTheDocument();
  });

  it('renders test cards with test names', () => {
    setupMocks({
      tests: { data: mockTestsResponse, loading: false, error: null },
      detail: { data: mockDetailResponse, loading: false, error: null },
      analysis: { data: mockAnalysisResponse, loading: false, error: null },
    });
    renderPage();
    expect(screen.getAllByText('Homepage Hero Redesign').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pricing Page Test').length).toBeGreaterThan(0);
  });

  it('renders variant names within test cards', () => {
    setupMocks({
      tests: { data: mockTestsResponse, loading: false, error: null },
      detail: { data: mockDetailResponse, loading: false, error: null },
      analysis: { data: mockAnalysisResponse, loading: false, error: null },
    });
    renderPage();
    expect(screen.getAllByText('Control').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Variant A').length).toBeGreaterThan(0);
  });

  it('renders improvement trend chart card', () => {
    setupMocks({
      tests: { data: mockTestsResponse, loading: false, error: null },
      detail: { data: mockDetailResponse, loading: false, error: null },
      analysis: { data: mockAnalysisResponse, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Cumulative Improvement Trend')).toBeInTheDocument();
  });

  it('renders AI recommended next tests', () => {
    setupMocks({
      tests: { data: mockTestsResponse, loading: false, error: null },
      detail: { data: mockDetailResponse, loading: false, error: null },
      analysis: { data: mockAnalysisResponse, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('AI Recommended Next Tests')).toBeInTheDocument();
    expect(screen.getByText('Test CTA color on checkout')).toBeInTheDocument();
    expect(screen.getByText('Test product image carousel')).toBeInTheDocument();
  });

  it('renders filter tabs for test types', () => {
    setupMocks({
      tests: { data: mockTestsResponse, loading: false, error: null },
      detail: { data: mockDetailResponse, loading: false, error: null },
      analysis: { data: mockAnalysisResponse, loading: false, error: null },
    });
    renderPage();
    expect(screen.getAllByText('All').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Creative').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Landing Page').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pricing').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Offer').length).toBeGreaterThan(0);
  });

  // ---- Empty states ----

  it('renders empty state when no tests exist', () => {
    setupMocks({
      tests: { data: { tests: [], summary: null, improvementTrend: [] }, loading: false, error: null },
      detail: { data: null, loading: false, error: null },
      analysis: { data: { recommendations: [] }, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('No tests found')).toBeInTheDocument();
  });

  it('shows New Test button in header', () => {
    setupMocks({
      tests: { data: mockTestsResponse, loading: false, error: null },
      detail: { data: mockDetailResponse, loading: false, error: null },
      analysis: { data: mockAnalysisResponse, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('New Test')).toBeInTheDocument();
  });
});
