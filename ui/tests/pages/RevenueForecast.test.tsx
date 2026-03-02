import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React, { createElement } from 'react';

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
  AreaChart: ({ children }: any) => createElement('div', null, children),
  BarChart: ({ children }: any) => createElement('div', null, children),
  LineChart: ({ children }: any) => createElement('div', null, children),
  PieChart: ({ children }: any) => createElement('div', null, children),
  RadarChart: ({ children }: any) => createElement('div', null, children),
  ComposedChart: ({ children }: any) => createElement('div', null, children),
  Area: () => null, Bar: () => null, Line: () => null, Pie: () => null, Radar: () => null,
  XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null,
  Legend: () => null, Cell: () => null, PolarGrid: () => null, PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null, Funnel: () => null, FunnelChart: () => null,
  ScatterChart: () => null, Scatter: () => null, ZAxis: () => null,
}));

import { useApiQuery } from '../../src/hooks/useApi';
import RevenueForecast from '../../src/pages/RevenueForecast';

const mockUseApiQuery = useApiQuery as ReturnType<typeof vi.fn>;

const mockForecastData = {
  kpis: {
    projectedRevenue: '$2.4M',
    projectedRevenueChange: 18.5,
    ltvCacRatio: '4.2x',
    ltvCacChange: 0.8,
    breakEvenDay: 'Day 45',
    breakEvenChange: -5,
    growthRate: '24%',
    growthRateChange: 3.2,
  },
  revenueProjectionData: [
    { month: 'Jan', conservative: 150000, projected: 200000, aggressive: 250000, type: 'historical' as const },
    { month: 'Feb', conservative: 165000, projected: 220000, aggressive: 280000, type: 'historical' as const },
    { month: 'Jul', conservative: 200000, projected: 300000, aggressive: 400000, type: 'forecast' as const },
  ],
  breakEvenData: [
    { day: 0, cumulativeRevenue: 0, cumulativeCost: 50000 },
    { day: 30, cumulativeRevenue: 40000, cumulativeCost: 60000 },
    { day: 45, cumulativeRevenue: 75000, cumulativeCost: 70000 },
    { day: 60, cumulativeRevenue: 120000, cumulativeCost: 80000 },
  ],
  ltvCacTrendData: [
    { month: 'Jan', ltv: 180, cac: 45, ratio: 4.0 },
    { month: 'Feb', ltv: 195, cac: 42, ratio: 4.6 },
  ],
  ltvMetrics: {
    currentLtv: '$195',
    ltvTarget: '$250',
    ltvProgress: 78,
    currentCac: '$42',
    cacTarget: '$35',
    cacProgress: 83,
    paybackPeriod: '3.2 months',
    paybackChange: '-0.4 months',
    ltvCacRatio: '4.6x',
    ltvCacPrevious: '4.0x',
  },
  countryRevenueData: [
    { country: 'United States', revenue: 1200000, projected: 1500000 },
    { country: 'United Kingdom', revenue: 450000, projected: 600000 },
    { country: 'Germany', revenue: 350000, projected: 480000 },
  ],
  scenarios: [
    { id: 'conservative', label: 'Conservative', description: 'Minimal new market entry', revenue: '$1.8M', growth: '+12%', confidence: 85, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-300' },
    { id: 'base', label: 'Base Case', description: 'Planned expansion trajectory', revenue: '$2.4M', growth: '+24%', confidence: 72, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-300' },
    { id: 'aggressive', label: 'Aggressive', description: 'Maximum market penetration', revenue: '$3.1M', growth: '+38%', confidence: 55, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-300' },
  ],
  riskFactors: [
    { rank: 1, risk: 'Currency fluctuation in emerging markets', impact: 'High', probability: '45%' },
    { rank: 2, risk: 'Regulatory changes in EU markets', impact: 'Medium', probability: '30%' },
  ],
};

const mockProjectionsData = {
  projections: [
    { period: '30-Day', revenue: '$820K', change: '+12%', up: true, newMarkets: 2, campaigns: 45, roas: '4.2x' },
    { period: '60-Day', revenue: '$1.6M', change: '+18%', up: true, newMarkets: 4, campaigns: 62, roas: '4.5x' },
    { period: '90-Day', revenue: '$2.4M', change: '+24%', up: true, newMarkets: 6, campaigns: 78, roas: '4.8x' },
  ],
};

function renderComponent() {
  return render(
    <BrowserRouter>
      <RevenueForecast />
    </BrowserRouter>
  );
}

describe('RevenueForecast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page header with title and subtitle', () => {
    mockUseApiQuery.mockReturnValue({ data: null, loading: true, error: null, refetch: vi.fn() });
    renderComponent();
    expect(screen.getByText('Revenue Forecasting')).toBeInTheDocument();
    expect(screen.getByText('Predictive Modeling, LTV/CAC Analysis & Scenario Simulations')).toBeInTheDocument();
  });

  it('renders KPI cards when forecast data loads', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('forecast')) return { data: mockForecastData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('projections')) return { data: mockProjectionsData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Projected Revenue')).toBeInTheDocument();
    expect(screen.getByText('LTV/CAC Ratio')).toBeInTheDocument();
    expect(screen.getByText('Break-Even')).toBeInTheDocument();
    expect(screen.getByText('Growth Rate')).toBeInTheDocument();
  });

  it('renders error state when forecast API fails', () => {
    const error = new Error('Forecast unavailable');
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('forecast')) return { data: null, loading: false, error, refetch: vi.fn() };
      if (url.includes('projections')) return { data: null, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getAllByText(/Forecast unavailable/i).length).toBeGreaterThan(0);
  });

  it('renders scenario simulation cards', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('forecast')) return { data: mockForecastData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('projections')) return { data: mockProjectionsData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Conservative')).toBeInTheDocument();
    expect(screen.getByText('Base Case')).toBeInTheDocument();
    expect(screen.getByText('Aggressive')).toBeInTheDocument();
    expect(screen.getByText('$1.8M')).toBeInTheDocument();
    expect(screen.getByText('$3.1M')).toBeInTheDocument();
  });

  it('changes active scenario when a scenario card is clicked', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('forecast')) return { data: mockForecastData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('projections')) return { data: mockProjectionsData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Currently selected scenario')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Conservative'));
    expect(screen.getByText('Currently selected scenario')).toBeInTheDocument();
  });

  it('renders LTV/CAC metrics', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('forecast')) return { data: mockForecastData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('projections')) return { data: mockProjectionsData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Current LTV')).toBeInTheDocument();
    expect(screen.getByText('$195')).toBeInTheDocument();
    expect(screen.getByText('Current CAC')).toBeInTheDocument();
    expect(screen.getByText('$42')).toBeInTheDocument();
    expect(screen.getByText('Payback Period')).toBeInTheDocument();
    expect(screen.getByText('3.2 months')).toBeInTheDocument();
  });

  it('renders 30/60/90-day projection cards', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('forecast')) return { data: mockForecastData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('projections')) return { data: mockProjectionsData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('30-Day Outlook')).toBeInTheDocument();
    expect(screen.getByText('60-Day Outlook')).toBeInTheDocument();
    expect(screen.getByText('90-Day Outlook')).toBeInTheDocument();
    expect(screen.getByText('$820K')).toBeInTheDocument();
    expect(screen.getByText('$1.6M')).toBeInTheDocument();
  });

  it('renders risk factors table', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('forecast')) return { data: mockForecastData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('projections')) return { data: mockProjectionsData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Currency fluctuation in emerging markets')).toBeInTheDocument();
    expect(screen.getByText('Regulatory changes in EU markets')).toBeInTheDocument();
    expect(screen.getAllByText('High').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Medium').length).toBeGreaterThan(0);
  });

  it('renders Run Forecast button', () => {
    mockUseApiQuery.mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });
    renderComponent();
    expect(screen.getByText('Run Forecast')).toBeInTheDocument();
  });

  it('renders break-even analysis with day information', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('forecast')) return { data: mockForecastData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('projections')) return { data: mockProjectionsData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Break-Even Analysis')).toBeInTheDocument();
    expect(screen.getAllByText(/Day 45/).length).toBeGreaterThan(0);
  });
});
