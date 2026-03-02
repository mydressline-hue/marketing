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
  ComposedChart: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  Area: () => null, Bar: () => null, Line: () => null, Pie: () => null, Radar: () => null,
  XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null,
  Legend: () => null, Cell: () => null, PolarGrid: () => null, PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null, Funnel: () => null, FunnelChart: () => null,
  ScatterChart: () => null, Scatter: () => null, ZAxis: () => null,
}));

import { useApiQuery } from '../../src/hooks/useApi';
import OrganicSocial from '../../src/pages/OrganicSocial';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockSocialData = {
  posts: [
    {
      id: 'p1', platform: 'instagram' as const, content: 'Check out our new skincare line!',
      scheduledTime: '10:00 AM', scheduledDay: 'Mon', country: 'United States',
      language: 'English', status: 'scheduled' as const, likes: 1200, comments: 85,
      shares: 45, reach: 15000,
    },
    {
      id: 'p2', platform: 'tiktok' as const, content: 'Summer glow routine #skincare',
      scheduledTime: '2:00 PM', scheduledDay: 'Wed', country: 'Japan',
      language: 'Japanese', status: 'draft' as const, likes: 0, comments: 0,
      shares: 0, reach: 0,
    },
    {
      id: 'p3', platform: 'twitter' as const, content: 'Big sale this weekend!',
      scheduledTime: '12:00 PM', scheduledDay: 'Fri', country: 'Germany',
      language: 'German', status: 'published' as const, likes: 3200, comments: 150,
      shares: 320, reach: 45000,
    },
  ],
  kpis: [
    { label: 'Total Posts', value: 48, change: 12, trend: 'up' as const },
    { label: 'Engagement Rate', value: '4.8%', change: 0.5, trend: 'up' as const },
    { label: 'Total Reach', value: '2.1M', change: 15, trend: 'up' as const },
    { label: 'Followers Growth', value: '+12.5K', change: 8, trend: 'up' as const },
  ],
  engagementTrend: [
    { day: 'Jan 1', likes: 1500, comments: 200, shares: 100 },
    { day: 'Jan 2', likes: 1800, comments: 220, shares: 130 },
  ],
  topPosts: [
    {
      id: 'tp1', platform: 'instagram' as const, content: 'Our bestseller is back in stock!',
      scheduledTime: '10:00 AM', scheduledDay: 'Mon', country: 'United States',
      language: 'English', status: 'published' as const, likes: 8500, comments: 420,
      shares: 1200, reach: 95000,
    },
  ],
  hashtagStrategy: [
    { platform: 'Instagram', hashtags: ['#skincare', '#beauty', '#glow'] },
    { platform: 'TikTok', hashtags: ['#skincarecheck', '#beautytok'] },
  ],
  toneSettings: [
    {
      country: 'United States', flag: 'US', tone: 'Bold & Direct',
      formality: 'Casual' as const, emojiUsage: 'Heavy' as const, humor: 'High' as const,
      keyNotes: 'Focus on results-driven messaging',
    },
    {
      country: 'Japan', flag: 'JP', tone: 'Polite & Refined',
      formality: 'Formal' as const, emojiUsage: 'Moderate' as const, humor: 'Low' as const,
      keyNotes: 'Emphasize quality and craftsmanship',
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const renderPage = () =>
  render(createElement(BrowserRouter, null, createElement(OrganicSocial)));

function mockQuery(override: Partial<ReturnType<typeof useApiQuery>> = {}) {
  const defaultReturn = { data: null, loading: false, error: null, refetch: vi.fn() };
  vi.mocked(useApiQuery).mockReturnValue({ ...defaultReturn, ...override });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OrganicSocial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Loading state ----

  it('shows loading skeletons when data is loading', () => {
    mockQuery({ loading: true });
    const { container } = renderPage();
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBeGreaterThan(0);
  });

  it('renders page header even during loading', () => {
    mockQuery({ loading: true });
    renderPage();
    expect(screen.getByText('Organic Social Automation')).toBeInTheDocument();
  });

  // ---- Error state ----

  it('shows error display when API errors', () => {
    mockQuery({ error: new Error('Social API Error') });
    renderPage();
    expect(screen.getByText('Organic Social Automation')).toBeInTheDocument();
    expect(screen.getAllByText(/retry/i).length).toBeGreaterThan(0);
  });

  // ---- Data loaded ----

  it('renders page header with correct title and subtitle', () => {
    mockQuery({ data: mockSocialData });
    renderPage();
    expect(screen.getByText('Organic Social Automation')).toBeInTheDocument();
    expect(screen.getByText(/Daily Content Scheduling/)).toBeInTheDocument();
  });

  it('renders KPI cards from social data', () => {
    mockQuery({ data: mockSocialData });
    renderPage();
    expect(screen.getByText('Total Posts')).toBeInTheDocument();
    expect(screen.getByText('Engagement Rate')).toBeInTheDocument();
    expect(screen.getByText('Total Reach')).toBeInTheDocument();
    expect(screen.getByText('Followers Growth')).toBeInTheDocument();
  });

  it('renders content calendar card', () => {
    mockQuery({ data: mockSocialData });
    renderPage();
    expect(screen.getByText('Content Calendar')).toBeInTheDocument();
  });

  it('renders upcoming posts section', () => {
    mockQuery({ data: mockSocialData });
    renderPage();
    expect(screen.getByText('Upcoming Posts')).toBeInTheDocument();
    expect(screen.getByText(/Check out our new skincare line!/)).toBeInTheDocument();
  });

  it('renders engagement trends chart section', () => {
    mockQuery({ data: mockSocialData });
    renderPage();
    expect(screen.getByText('Engagement Trends')).toBeInTheDocument();
    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
  });

  it('renders best performing posts section', () => {
    mockQuery({ data: mockSocialData });
    renderPage();
    expect(screen.getByText('Best Performing Posts')).toBeInTheDocument();
    expect(screen.getByText(/Our bestseller is back in stock!/)).toBeInTheDocument();
  });

  it('renders hashtag strategy section', () => {
    mockQuery({ data: mockSocialData });
    renderPage();
    expect(screen.getByText('Hashtag Strategy')).toBeInTheDocument();
    expect(screen.getByText('#skincare')).toBeInTheDocument();
    expect(screen.getByText('#beauty')).toBeInTheDocument();
  });

  it('renders AI tone adaptation section with country settings', () => {
    mockQuery({ data: mockSocialData });
    renderPage();
    expect(screen.getByText('AI Tone Adaptation')).toBeInTheDocument();
    expect(screen.getByText('United States')).toBeInTheDocument();
    expect(screen.getByText('Japan')).toBeInTheDocument();
    expect(screen.getByText('Bold & Direct')).toBeInTheDocument();
    expect(screen.getByText('Polite & Refined')).toBeInTheDocument();
  });

  it('renders Schedule Post and AI Optimize buttons', () => {
    mockQuery({ data: mockSocialData });
    renderPage();
    expect(screen.getByText('Schedule Post')).toBeInTheDocument();
    expect(screen.getByText('AI Optimize')).toBeInTheDocument();
  });
});
