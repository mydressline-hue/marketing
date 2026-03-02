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
import BudgetOptimizer from '../../src/pages/BudgetOptimizer';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockBudgetData = {
  kpis: {
    totalBudget: 2500000,
    totalAllocated: 2100000,
    totalSpent: 1600000,
    projectedRoi: 4.2,
    budgetChange: 5.3,
    allocatedChange: 3.1,
    spentChange: 8.2,
    roiChange: 1.4,
  },
  allocations: [
    { id: '1', channel: 'Google Ads', allocated: 800000, spent: 600000, remaining: 200000, roas: 4.5, recommendation: 'increase' as const, aiNote: 'High ROAS – increase budget', color: '#6366f1' },
    { id: '2', channel: 'Meta Ads', allocated: 600000, spent: 450000, remaining: 150000, roas: 3.2, recommendation: 'maintain' as const, aiNote: 'Steady performance', color: '#22c55e' },
    { id: '3', channel: 'TikTok Ads', allocated: 300000, spent: 280000, remaining: 20000, roas: 1.8, recommendation: 'decrease' as const, aiNote: 'Low ROAS – consider decreasing', color: '#f59e0b' },
  ],
  countries: [
    { country: 'United States', allocated: 1000000, spent: 750000, flag: '\uD83C\uDDFA\uD83C\uDDF8' },
    { country: 'Germany', allocated: 500000, spent: 420000, flag: '\uD83C\uDDE9\uD83C\uDDEA' },
  ],
  recommendations: [
    { id: 1, action: 'increase' as const, message: 'Increase Google Ads spend by 15%', impact: '+$45K revenue', confidence: 92 },
    { id: 2, action: 'pause' as const, message: 'Pause Snapchat campaign in SA', impact: 'Save $12K/month', confidence: 87 },
  ],
  guardrails: [
    { rule: 'Max daily spend per channel', threshold: '$50,000', status: 'active' as const, triggered: false },
    { rule: 'ROAS floor guard', threshold: 'ROAS < 2.0x triggers alert', status: 'active' as const, triggered: true },
  ],
  forecast: [
    { month: 'Jan', projected: 400000, actual: 380000 },
    { month: 'Feb', projected: 420000, actual: 415000 },
    { month: 'Mar', projected: 450000, actual: null },
  ],
};

// Helper
function setupMocks(overrides: { data?: unknown; loading?: boolean; error?: unknown } = {}) {
  const defaultReturn = { data: null, loading: false, error: null, refetch: vi.fn() };
  vi.mocked(useApiQuery).mockReturnValue({ ...defaultReturn, ...overrides });
}

const renderPage = () =>
  render(createElement(BrowserRouter, null, createElement(BudgetOptimizer)));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BudgetOptimizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Loading states ----

  it('shows skeletons when data is loading', () => {
    setupMocks({ loading: true });
    const { container } = renderPage();
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders page header with title', () => {
    setupMocks({ loading: true });
    renderPage();
    expect(screen.getByText('Budget Optimizer')).toBeInTheDocument();
  });

  it('renders subtitle text', () => {
    setupMocks({ loading: true });
    renderPage();
    expect(screen.getByText('Dynamic Allocation & Risk-Managed Spend Optimization')).toBeInTheDocument();
  });

  // ---- Error states ----

  it('shows error display when budget data fails to load', () => {
    setupMocks({ error: new Error('Budget load failed') });
    renderPage();
    expect(screen.getAllByText(/retry/i).length).toBeGreaterThan(0);
  });

  // ---- Data loaded states ----

  it('renders KPI cards when data is loaded', () => {
    setupMocks({ data: mockBudgetData });
    renderPage();
    expect(screen.getByText('Total Budget')).toBeInTheDocument();
    expect(screen.getAllByText('Allocated').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Spent').length).toBeGreaterThan(0);
    expect(screen.getByText('Projected ROI')).toBeInTheDocument();
  });

  it('renders channel allocation table with channel names', () => {
    setupMocks({ data: mockBudgetData });
    renderPage();
    expect(screen.getAllByText('Google Ads').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Meta Ads').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TikTok Ads').length).toBeGreaterThan(0);
  });

  it('renders channel allocation details card title', () => {
    setupMocks({ data: mockBudgetData });
    renderPage();
    expect(screen.getByText('Channel Allocation Details')).toBeInTheDocument();
  });

  it('renders budget allocation pie chart card', () => {
    setupMocks({ data: mockBudgetData });
    renderPage();
    expect(screen.getByText('Budget Allocation by Channel')).toBeInTheDocument();
  });

  it('renders country budget utilization section', () => {
    setupMocks({ data: mockBudgetData });
    renderPage();
    expect(screen.getByText('Budget Utilization by Country')).toBeInTheDocument();
    expect(screen.getByText(/United States/)).toBeInTheDocument();
    expect(screen.getByText(/Germany/)).toBeInTheDocument();
  });

  it('renders AI reallocation suggestions', () => {
    setupMocks({ data: mockBudgetData });
    renderPage();
    expect(screen.getByText('AI Reallocation Suggestions')).toBeInTheDocument();
    expect(screen.getByText('Increase Google Ads spend by 15%')).toBeInTheDocument();
    expect(screen.getByText('Pause Snapchat campaign in SA')).toBeInTheDocument();
  });

  it('renders risk management rules with triggered state', () => {
    setupMocks({ data: mockBudgetData });
    renderPage();
    expect(screen.getByText('Risk Management Rules')).toBeInTheDocument();
    expect(screen.getByText('Max daily spend per channel')).toBeInTheDocument();
    expect(screen.getByText('ROAS floor guard')).toBeInTheDocument();
  });

  it('renders budget forecast chart card', () => {
    setupMocks({ data: mockBudgetData });
    renderPage();
    expect(screen.getByText('Budget Forecast')).toBeInTheDocument();
  });

  // ---- Empty states ----

  it('renders empty states when data arrays are empty', () => {
    setupMocks({
      data: {
        kpis: mockBudgetData.kpis,
        allocations: [],
        countries: [],
        recommendations: [],
        guardrails: [],
        forecast: [],
      },
    });
    renderPage();
    expect(screen.getByText('No allocations')).toBeInTheDocument();
    expect(screen.getByText('No country data')).toBeInTheDocument();
    expect(screen.getByText('No recommendations')).toBeInTheDocument();
    expect(screen.getByText('No guardrails configured')).toBeInTheDocument();
    expect(screen.getByText('No forecast data')).toBeInTheDocument();
  });

  it('shows Run Reallocation button in header', () => {
    setupMocks({ data: mockBudgetData });
    renderPage();
    expect(screen.getByText('Run Reallocation')).toBeInTheDocument();
  });
});
