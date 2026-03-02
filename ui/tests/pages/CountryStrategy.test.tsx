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
import CountryStrategy from '../../src/pages/CountryStrategy';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockCountries = {
  countries: [
    { id: 'us', code: 'US', label: 'United States', flag: 'US' },
    { id: 'de', code: 'DE', label: 'Germany', flag: 'DE' },
    { id: 'jp', code: 'JP', label: 'Japan', flag: 'JP' },
  ],
};

const mockCountryDetail = {
  id: 'us',
  code: 'US',
  label: 'United States',
  flag: 'US',
  overview: {
    positioning: 'Premium health & wellness brand',
    culturalTone: 'Direct, confident, aspirational',
    priceSensitivity: 'low' as const,
    messagingStyle: 'Performance-driven with social proof',
  },
  platformMix: [
    { platform: 'Google', allocation: 35 },
    { platform: 'Meta', allocation: 30 },
    { platform: 'TikTok', allocation: 20 },
  ],
  culturalInsights: [
    'US consumers prefer direct messaging',
    'Influencer partnerships are key',
    'Sustainability messaging resonates well',
  ],
  competitors: [
    { name: 'Competitor A', share: 25, status: 'active' },
    { name: 'Competitor B', share: 18, status: 'growing' },
  ],
  entryPhases: [
    { name: 'Market Research', timeline: 'Q1 2026', description: 'Comprehensive market analysis', status: 'completed' },
    { name: 'Soft Launch', timeline: 'Q2 2026', description: 'Limited campaign rollout', status: 'in_progress' },
    { name: 'Full Scale', timeline: 'Q3 2026', description: 'Full market entry', status: 'planned' },
  ],
  confidence: 88,
  radarData: [
    { axis: 'Market Size', value: 95 },
    { axis: 'Competition', value: 70 },
    { axis: 'Digital Maturity', value: 92 },
    { axis: 'Ad Cost', value: 65 },
  ],
  blueprintActions: [
    'Launch Google Search campaigns targeting high-intent keywords',
    'Partner with US-based micro-influencers for authenticity',
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const renderPage = () =>
  render(createElement(BrowserRouter, null, createElement(CountryStrategy)));

function mockQueries(overrides: {
  countries?: Partial<ReturnType<typeof useApiQuery>>;
  detail?: Partial<ReturnType<typeof useApiQuery>>;
  strategy?: Partial<ReturnType<typeof useApiQuery>>;
} = {}) {
  const defaultReturn = { data: null, loading: false, error: null, refetch: vi.fn() };
  vi.mocked(useApiQuery).mockImplementation((url: string) => {
    if (url === '/v1/countries') return { ...defaultReturn, ...overrides.countries };
    if (url.startsWith('/v1/countries/')) return { ...defaultReturn, ...overrides.detail };
    return defaultReturn;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CountryStrategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeletons when countries list is loading', () => {
    mockQueries({ countries: { loading: true } });
    const { container } = renderPage();
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBeGreaterThan(0);
  });

  it('shows error display when countries API errors', () => {
    mockQueries({ countries: { error: new Error('Countries Error') } });
    renderPage();
    expect(screen.getByText('Country Strategy')).toBeInTheDocument();
    expect(screen.getByText(/Failed to load countries/)).toBeInTheDocument();
  });

  it('renders page header with correct title', () => {
    mockQueries({
      countries: { data: mockCountries },
      detail: { data: mockCountryDetail },
    });
    renderPage();
    expect(screen.getByText('Country Strategy')).toBeInTheDocument();
    expect(screen.getByText(/Brand Positioning & Market Entry Blueprints/)).toBeInTheDocument();
  });

  it('renders country selector tabs', () => {
    mockQueries({
      countries: { data: mockCountries },
      detail: { data: mockCountryDetail },
    });
    renderPage();
    expect(screen.getAllByText('US').length).toBeGreaterThan(0);
    expect(screen.getAllByText('DE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('JP').length).toBeGreaterThan(0);
  });

  it('renders strategy overview section when detail is loaded', () => {
    mockQueries({
      countries: { data: mockCountries },
      detail: { data: mockCountryDetail },
    });
    renderPage();
    expect(screen.getByText('Strategy Overview')).toBeInTheDocument();
    expect(screen.getByText('Premium health & wellness brand')).toBeInTheDocument();
    expect(screen.getByText('Direct, confident, aspirational')).toBeInTheDocument();
  });

  it('renders cultural insights list', () => {
    mockQueries({
      countries: { data: mockCountries },
      detail: { data: mockCountryDetail },
    });
    renderPage();
    expect(screen.getByText('Cultural Insights')).toBeInTheDocument();
    expect(screen.getByText('US consumers prefer direct messaging')).toBeInTheDocument();
    expect(screen.getByText('Influencer partnerships are key')).toBeInTheDocument();
  });

  it('renders competitive landscape', () => {
    mockQueries({
      countries: { data: mockCountries },
      detail: { data: mockCountryDetail },
    });
    renderPage();
    expect(screen.getByText('Competitive Landscape')).toBeInTheDocument();
    expect(screen.getByText('Competitor A')).toBeInTheDocument();
    expect(screen.getByText('Competitor B')).toBeInTheDocument();
  });

  it('renders entry strategy timeline', () => {
    mockQueries({
      countries: { data: mockCountries },
      detail: { data: mockCountryDetail },
    });
    renderPage();
    expect(screen.getByText('Entry Strategy Timeline')).toBeInTheDocument();
    expect(screen.getByText('Market Research')).toBeInTheDocument();
    expect(screen.getByText('Soft Launch')).toBeInTheDocument();
    expect(screen.getByText('Full Scale')).toBeInTheDocument();
  });

  it('renders strategy confidence score', () => {
    mockQueries({
      countries: { data: mockCountries },
      detail: { data: mockCountryDetail },
    });
    renderPage();
    expect(screen.getByText('Strategy Confidence')).toBeInTheDocument();
  });

  it('renders strategic blueprint actions', () => {
    mockQueries({
      countries: { data: mockCountries },
      detail: { data: mockCountryDetail },
    });
    renderPage();
    expect(screen.getByText('Strategic Blueprint')).toBeInTheDocument();
    expect(screen.getByText(/Launch Google Search campaigns/)).toBeInTheDocument();
    expect(screen.getByText(/Partner with US-based micro-influencers/)).toBeInTheDocument();
  });

  it('shows empty state when no countries are configured', () => {
    mockQueries({ countries: { data: { countries: [] } } });
    renderPage();
    expect(screen.getByText('No countries configured')).toBeInTheDocument();
  });

  it('renders radar chart for market readiness', () => {
    mockQueries({
      countries: { data: mockCountries },
      detail: { data: mockCountryDetail },
    });
    renderPage();
    expect(screen.getByText('Market Readiness')).toBeInTheDocument();
    expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
  });
});
