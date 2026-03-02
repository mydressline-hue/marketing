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
import ContentBlog from '../../src/pages/ContentBlog';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockContentData = {
  items: [
    {
      id: 'a1', title: 'Ultimate Skincare Guide for Winter', type: 'blog' as const,
      language: 'English', country: 'US', seoScore: 92, status: 'published' as const,
      publishDate: '2026-01-15',
    },
    {
      id: 'a2', title: 'K-Beauty Trends 2026', type: 'guide' as const,
      language: 'Korean', country: 'KR', seoScore: 78, status: 'draft' as const,
      publishDate: '',
    },
    {
      id: 'a3', title: 'Organic Face Serum Review', type: 'product' as const,
      language: 'German', country: 'DE', seoScore: 65, status: 'review' as const,
      publishDate: '2026-02-01',
    },
  ],
  total: 3,
};

const mockStatsData = {
  kpis: [
    { label: 'Articles Published', value: 42, change: 8, trend: 'up' as const },
    { label: 'Avg SEO Score', value: 82, change: 3, trend: 'up' as const, suffix: '/100' },
    { label: 'Organic Traffic', value: '+18%', change: 18, trend: 'up' as const },
    { label: 'Shopify Synced', value: 38, change: 5, trend: 'up' as const },
  ],
  organicTraffic: [
    { month: 'Sep', traffic: 12000 },
    { month: 'Oct', traffic: 15000 },
    { month: 'Nov', traffic: 18000 },
  ],
  keywordRankings: [
    { keyword: 'skincare routine', position: 2 },
    { keyword: 'best face serum', position: 4 },
  ],
  pipeline: [
    { stage: 'Research', count: 5, color: 'bg-blue-500' },
    { stage: 'Writing', count: 8, color: 'bg-yellow-500' },
    { stage: 'Review', count: 3, color: 'bg-purple-500' },
    { stage: 'Published', count: 42, color: 'bg-green-500' },
  ],
  shopifySync: {
    connected: true, lastSync: '10 min ago', itemsSynced: 38,
    totalItems: 42, syncErrors: 1, pendingSync: 3,
    recentErrors: [{ id: 'e1', message: 'Image upload failed for SKU-1234' }],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const renderPage = () =>
  render(createElement(BrowserRouter, null, createElement(ContentBlog)));

function mockQueries(overrides: {
  content?: Partial<ReturnType<typeof useApiQuery>>;
  stats?: Partial<ReturnType<typeof useApiQuery>>;
} = {}) {
  const defaultReturn = { data: null, loading: false, error: null, refetch: vi.fn() };
  (useApiQuery as any).mockImplementation((url: string) => {
    if (url === '/v1/content') return { ...defaultReturn, ...overrides.content };
    if (url === '/v1/content?stats=true') return { ...defaultReturn, ...overrides.stats };
    return defaultReturn;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContentBlog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Loading states ----

  it('shows table skeleton when content is loading', () => {
    mockQueries({ content: { loading: true }, stats: { loading: true } });
    const { container } = renderPage();
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBeGreaterThan(0);
  });

  // ---- Error states ----

  it('shows error display when content API errors', () => {
    mockQueries({
      content: { error: new Error('Content Error') },
      stats: { data: mockStatsData },
    });
    renderPage();
    expect(screen.getAllByText(/retry/i).length).toBeGreaterThan(0);
  });

  it('shows error display when stats API errors', () => {
    mockQueries({
      content: { data: mockContentData },
      stats: { error: new Error('Stats Error') },
    });
    renderPage();
    expect(screen.getAllByText(/retry/i).length).toBeGreaterThan(0);
  });

  // ---- Page header ----

  it('renders page header with correct title', () => {
    mockQueries({
      content: { data: mockContentData },
      stats: { data: mockStatsData },
    });
    renderPage();
    expect(screen.getByText('AI Content & Blog Engine')).toBeInTheDocument();
    expect(screen.getByText(/SEO-Optimized Content Generation/)).toBeInTheDocument();
  });

  // ---- KPI cards ----

  it('renders KPI cards from stats data', () => {
    mockQueries({
      content: { data: mockContentData },
      stats: { data: mockStatsData },
    });
    renderPage();
    expect(screen.getByText('Articles Published')).toBeInTheDocument();
    expect(screen.getByText('Avg SEO Score')).toBeInTheDocument();
    expect(screen.getAllByText('Organic Traffic').length).toBeGreaterThan(0);
    expect(screen.getByText('Shopify Synced')).toBeInTheDocument();
  });

  // ---- Content table ----

  it('renders content library table with items', () => {
    mockQueries({
      content: { data: mockContentData },
      stats: { data: mockStatsData },
    });
    renderPage();
    expect(screen.getByText('Content Library')).toBeInTheDocument();
    expect(screen.getByText('Ultimate Skincare Guide for Winter')).toBeInTheDocument();
    expect(screen.getByText('K-Beauty Trends 2026')).toBeInTheDocument();
    expect(screen.getByText('Organic Face Serum Review')).toBeInTheDocument();
  });

  it('shows content type badges in the table', () => {
    mockQueries({
      content: { data: mockContentData },
      stats: { data: mockStatsData },
    });
    renderPage();
    expect(screen.getByText('Blog Post')).toBeInTheDocument();
    expect(screen.getByText('Guide')).toBeInTheDocument();
    expect(screen.getByText('Product')).toBeInTheDocument();
  });

  it('renders search input for filtering content', () => {
    mockQueries({
      content: { data: mockContentData },
      stats: { data: mockStatsData },
    });
    renderPage();
    expect(screen.getByPlaceholderText('Search content...')).toBeInTheDocument();
  });

  it('filters content by search query', () => {
    mockQueries({
      content: { data: mockContentData },
      stats: { data: mockStatsData },
    });
    renderPage();
    const searchInput = screen.getByPlaceholderText('Search content...');
    fireEvent.change(searchInput, { target: { value: 'K-Beauty' } });
    expect(screen.getByText('K-Beauty Trends 2026')).toBeInTheDocument();
    expect(screen.queryByText('Ultimate Skincare Guide for Winter')).not.toBeInTheDocument();
  });

  // ---- Charts ----

  it('renders organic traffic chart', () => {
    mockQueries({
      content: { data: mockContentData },
      stats: { data: mockStatsData },
    });
    renderPage();
    expect(screen.getAllByText('Organic Traffic').length).toBeGreaterThanOrEqual(2);
  });

  it('renders keyword rankings chart', () => {
    mockQueries({
      content: { data: mockContentData },
      stats: { data: mockStatsData },
    });
    renderPage();
    expect(screen.getByText('Keyword Rankings')).toBeInTheDocument();
  });

  // ---- Content pipeline ----

  it('renders content pipeline with stages', () => {
    mockQueries({
      content: { data: mockContentData },
      stats: { data: mockStatsData },
    });
    renderPage();
    expect(screen.getByText('Content Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(screen.getByText('Writing')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
  });

  // ---- AI Content Generator ----

  it('renders AI content generator panel', () => {
    mockQueries({
      content: { data: mockContentData },
      stats: { data: mockStatsData },
    });
    renderPage();
    expect(screen.getByText('AI Content Generator')).toBeInTheDocument();
    expect(screen.getByText('Generate Content')).toBeInTheDocument();
  });

  // ---- Shopify Sync ----

  it('renders Shopify sync status', () => {
    mockQueries({
      content: { data: mockContentData },
      stats: { data: mockStatsData },
    });
    renderPage();
    expect(screen.getByText('Shopify Sync Status')).toBeInTheDocument();
    expect(screen.getByText('Connected & Syncing')).toBeInTheDocument();
  });
});
