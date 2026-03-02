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
  ScatterChart: ({ children }: any) => createElement('div', { 'data-testid': 'scatter-chart' }, children),
  Area: () => null, Bar: () => null, Line: () => null, Pie: () => null, Radar: () => null,
  Scatter: () => null,
  XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null,
  Legend: () => null, Cell: () => null, PolarGrid: () => null, PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null, ZAxis: () => null,
}));

import { useApiQuery } from '../../src/hooks/useApi';
import MarketIntelligence from '../../src/pages/MarketIntelligence';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockCountriesData = {
  countries: [
    {
      rank: 1,
      country: 'Germany',
      flag: '\uD83C\uDDE9\uD83C\uDDEA',
      opportunityScore: 92,
      gdp: '$4.2T',
      gdpValue: 4200,
      internetPenetration: 93,
      ecommerceAdoption: 78,
      adCostIndex: 0.85,
      entryStrategy: 'Direct Entry',
      status: 'active',
      region: 'Europe',
    },
    {
      rank: 2,
      country: 'Japan',
      flag: '\uD83C\uDDEF\uD83C\uDDF5',
      opportunityScore: 88,
      gdp: '$5.1T',
      gdpValue: 5100,
      internetPenetration: 92,
      ecommerceAdoption: 82,
      adCostIndex: 1.15,
      entryStrategy: 'Partnership',
      status: 'planned',
      region: 'Asia',
    },
    {
      rank: 3,
      country: 'Brazil',
      flag: '\uD83C\uDDE7\uD83C\uDDF7',
      opportunityScore: 75,
      gdp: '$1.9T',
      gdpValue: 1900,
      internetPenetration: 81,
      ecommerceAdoption: 55,
      adCostIndex: 0.45,
      entryStrategy: 'Localization',
      status: 'planned',
      region: 'Americas',
    },
  ],
  radarData: [
    { dimension: 'GDP', Germany: 95, Japan: 98, Brazil: 65 },
    { dimension: 'Internet', Germany: 93, Japan: 92, Brazil: 81 },
  ],
  insights: [
    { id: 1, title: 'European expansion', description: 'Strong DACH region growth', color: 'emerald' as const },
    { id: 2, title: 'APAC potential', description: 'Japan and Korea show high readiness', color: 'blue' as const },
  ],
};

const mockAgentStatus = {
  status: 'active',
  lastRun: '2 hours ago',
  confidence: 92,
};

// Helper for mock setup
function setupMocks(overrides: {
  countries?: { data: any; loading: boolean; error: any };
  agentStatus?: { data: any; loading: boolean; error: any };
} = {}) {
  const defaultReturn = { data: null, loading: false, error: null, refetch: vi.fn() };
  const countriesReturn = { ...defaultReturn, ...overrides.countries };
  const agentStatusReturn = { ...defaultReturn, ...overrides.agentStatus };

  (useApiQuery as any)
    .mockReturnValueOnce(countriesReturn)      // /v1/countries
    .mockReturnValueOnce(agentStatusReturn);   // /v1/agents/market-intelligence
}

const renderPage = () =>
  render(createElement(BrowserRouter, null, createElement(MarketIntelligence)));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MarketIntelligence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Loading state ----

  it('shows page skeleton when countries are loading', () => {
    setupMocks({ countries: { data: null, loading: true, error: null } });
    const { container } = renderPage();
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  // ---- Error state ----

  it('shows error display when countries fetch fails', () => {
    setupMocks({ countries: { data: null, loading: false, error: new Error('Failed') } });
    renderPage();
    expect(screen.getByText(/failed to load market intelligence data/i)).toBeInTheDocument();
  });

  it('renders the page header even on error', () => {
    setupMocks({ countries: { data: null, loading: false, error: new Error('Failed') } });
    renderPage();
    expect(screen.getByText('Global Market Intelligence')).toBeInTheDocument();
  });

  // ---- Data loaded state ----

  it('renders page header with correct title and subtitle', () => {
    setupMocks({
      countries: { data: mockCountriesData, loading: false, error: null },
      agentStatus: { data: mockAgentStatus, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Global Market Intelligence')).toBeInTheDocument();
    expect(screen.getByText('AI-Powered Country Analysis & Opportunity Scoring')).toBeInTheDocument();
  });

  it('renders country opportunity ranking table with country names', () => {
    setupMocks({
      countries: { data: mockCountriesData, loading: false, error: null },
      agentStatus: { data: mockAgentStatus, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Country Opportunity Ranking')).toBeInTheDocument();
    expect(screen.getAllByText('Germany').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Japan').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Brazil').length).toBeGreaterThan(0);
  });

  it('renders opportunity scores for countries', () => {
    setupMocks({
      countries: { data: mockCountriesData, loading: false, error: null },
      agentStatus: { data: mockAgentStatus, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('92')).toBeInTheDocument();
    expect(screen.getByText('88')).toBeInTheDocument();
    expect(screen.getByText('75')).toBeInTheDocument();
  });

  it('renders scatter chart for opportunity vs ad cost', () => {
    setupMocks({
      countries: { data: mockCountriesData, loading: false, error: null },
      agentStatus: { data: mockAgentStatus, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Opportunity Score vs. Ad Cost Index')).toBeInTheDocument();
    expect(screen.getByTestId('scatter-chart')).toBeInTheDocument();
  });

  it('renders radar chart for top 3 markets comparison', () => {
    setupMocks({
      countries: { data: mockCountriesData, loading: false, error: null },
      agentStatus: { data: mockAgentStatus, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Top 3 Markets Comparison')).toBeInTheDocument();
    expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
  });

  it('renders AI market insights', () => {
    setupMocks({
      countries: { data: mockCountriesData, loading: false, error: null },
      agentStatus: { data: mockAgentStatus, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('AI Market Insights')).toBeInTheDocument();
    expect(screen.getByText('European expansion')).toBeInTheDocument();
    expect(screen.getByText('APAC potential')).toBeInTheDocument();
  });

  it('renders the Run Analysis button', () => {
    setupMocks({
      countries: { data: mockCountriesData, loading: false, error: null },
      agentStatus: { data: mockAgentStatus, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Run Analysis')).toBeInTheDocument();
  });

  it('renders the Export Report button', () => {
    setupMocks({
      countries: { data: mockCountriesData, loading: false, error: null },
      agentStatus: { data: mockAgentStatus, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Export Report')).toBeInTheDocument();
  });

  // ---- Filter / search interactions ----

  it('renders search input for filtering countries', () => {
    setupMocks({
      countries: { data: mockCountriesData, loading: false, error: null },
      agentStatus: { data: mockAgentStatus, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByPlaceholderText('Search countries, strategies...')).toBeInTheDocument();
  });

  it('renders region filter dropdown with All Regions option', () => {
    setupMocks({
      countries: { data: mockCountriesData, loading: false, error: null },
      agentStatus: { data: mockAgentStatus, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('All Regions')).toBeInTheDocument();
  });

  it('renders agent last run info', () => {
    setupMocks({
      countries: { data: mockCountriesData, loading: false, error: null },
      agentStatus: { data: mockAgentStatus, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Last run: 2 hours ago')).toBeInTheDocument();
  });

  it('displays markets analyzed count in table subtitle', () => {
    setupMocks({
      countries: { data: mockCountriesData, loading: false, error: null },
      agentStatus: { data: mockAgentStatus, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('3 markets analyzed')).toBeInTheDocument();
  });
});
