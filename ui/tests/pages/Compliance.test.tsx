import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  ResponsiveContainer: ({ children }: any) => createElement('div', null, children),
  AreaChart: ({ children }: any) => createElement('div', null, children),
  BarChart: ({ children }: any) => createElement('div', null, children),
  LineChart: ({ children }: any) => createElement('div', null, children),
  PieChart: ({ children }: any) => createElement('div', null, children),
  RadarChart: ({ children }: any) => createElement('div', null, children),
  ComposedChart: ({ children }: any) => createElement('div', null, children),
  Area: () => null, Bar: () => null, Line: () => null, Pie: () => null, Radar: () => null,
  XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null,
  Legend: () => null, Cell: () => null, PolarGrid: () => null, PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null, ScatterChart: () => null, Scatter: () => null, ZAxis: () => null,
  Funnel: () => null, FunnelChart: () => null,
}));

import { useApiQuery } from '../../src/hooks/useApi';
import Compliance from '../../src/pages/Compliance';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockRules = [
  { id: 'r1', name: 'GDPR Data Collection', country: 'Germany', category: 'Data Protection', status: 'compliant' as const, lastChecked: '2 hours ago', details: 'All consent forms verified', riskLevel: 'Low' as const },
  { id: 'r2', name: 'CCPA Privacy Rights', country: 'United States', category: 'Consumer Rights', status: 'compliant' as const, lastChecked: '1 hour ago', details: 'Opt-out mechanisms in place', riskLevel: 'Low' as const },
  { id: 'r3', name: 'Ad Disclosure SA', country: 'Saudi Arabia', category: 'Ad Standards', status: 'warning' as const, lastChecked: '30 min ago', details: 'Missing Arabic disclosure text', riskLevel: 'Medium' as const },
  { id: 'r4', name: 'VAT Compliance', country: 'United Kingdom', category: 'Tax', status: 'violation' as const, lastChecked: '15 min ago', details: 'VAT not displayed on checkout', riskLevel: 'High' as const },
];

const mockStatus = {
  overview: [
    { name: 'Compliant', value: 75, color: '#22c55e' },
    { name: 'Warning', value: 15, color: '#f59e0b' },
    { name: 'Violation', value: 5, color: '#ef4444' },
    { name: 'Review', value: 5, color: '#6366f1' },
  ],
  kpis: {
    complianceScore: 94,
    complianceScoreChange: 2.1,
    activeRegulations: 24,
    activeRegulationsChange: 3,
    violations: 2,
    violationsChange: -1,
    pendingReviews: 4,
    pendingReviewsChange: 1,
  },
  countryCompliance: [
    { country: 'US', compliance: 98 },
    { country: 'DE', compliance: 96 },
    { country: 'SA', compliance: 88 },
    { country: 'JP', compliance: 92 },
  ],
  flaggedCampaigns: [
    { id: 'fc-1', name: 'Summer Sale DE', market: 'Germany', issue: 'Missing cookie consent banner', severity: 'warning' as const, flaggedDate: '2024-01-15', assignee: 'Compliance Bot' },
    { id: 'fc-2', name: 'Flash Sale SA', market: 'Saudi Arabia', issue: 'Ad copy not compliant with local guidelines', severity: 'critical' as const, flaggedDate: '2024-01-14', assignee: 'Review Team' },
  ],
  dataProtection: [
    { label: 'Consent Management', description: 'Cookie consent and data processing agreements', status: 'compliant' as const },
    { label: 'Data Retention', description: '90-day retention policy enforced', status: 'warning' as const },
  ],
  adRestrictions: [
    { country: 'Saudi Arabia', categories: ['Alcohol', 'Gambling', 'Adult Content'], enforced: true },
    { country: 'Germany', categories: ['Tobacco', 'Gambling'], enforced: true },
  ],
  auditLog: [
    { id: 'al-1', timestamp: '2024-01-15 14:30', action: 'GDPR compliance check', agent: 'Compliance Agent', result: 'Pass' },
    { id: 'al-2', timestamp: '2024-01-15 14:00', action: 'Ad disclosure validation', agent: 'Compliance Agent', result: 'Pending' },
  ],
};

const mockCountries = [
  { code: 'US', name: 'United States', flag: '\uD83C\uDDFA\uD83C\uDDF8' },
  { code: 'DE', name: 'Germany', flag: '\uD83C\uDDE9\uD83C\uDDEA' },
];

// Helper - Compliance uses 3 useApiQuery calls: rules, status, countries
function setupMocks(overrides: {
  rules?: { data: any; loading: boolean; error: any };
  status?: { data: any; loading: boolean; error: any };
  countries?: { data: any; loading: boolean; error: any };
} = {}) {
  const defaultReturn = { data: null, loading: false, error: null, refetch: vi.fn() };
  (useApiQuery as any)
    .mockReturnValueOnce({ ...defaultReturn, ...overrides.rules })
    .mockReturnValueOnce({ ...defaultReturn, ...overrides.status })
    .mockReturnValueOnce({ ...defaultReturn, ...overrides.countries });
}

const renderPage = () =>
  render(createElement(BrowserRouter, null, createElement(Compliance)));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Compliance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Loading states ----

  it('shows skeletons when all data is loading', () => {
    setupMocks({
      rules: { data: null, loading: true, error: null },
      status: { data: null, loading: true, error: null },
      countries: { data: null, loading: true, error: null },
    });
    const { container } = renderPage();
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders page header with title', () => {
    setupMocks({
      rules: { data: null, loading: true, error: null },
      status: { data: null, loading: true, error: null },
      countries: { data: null, loading: true, error: null },
    });
    renderPage();
    expect(screen.getByText('Compliance & Regulatory')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    setupMocks({
      rules: { data: null, loading: true, error: null },
      status: { data: null, loading: true, error: null },
      countries: { data: null, loading: true, error: null },
    });
    renderPage();
    expect(screen.getByText('GDPR, CCPA & Local Ad Law Enforcement')).toBeInTheDocument();
  });

  // ---- Error states ----

  it('shows global error when all queries fail', () => {
    setupMocks({
      rules: { data: null, loading: false, error: new Error('Rules failed') },
      status: { data: null, loading: false, error: new Error('Status failed') },
      countries: { data: null, loading: false, error: new Error('Countries failed') },
    });
    renderPage();
    expect(screen.getAllByText(/retry/i).length).toBeGreaterThan(0);
  });

  // ---- Data loaded states ----

  it('renders KPI cards when data is loaded', () => {
    setupMocks({
      rules: { data: mockRules, loading: false, error: null },
      status: { data: mockStatus, loading: false, error: null },
      countries: { data: mockCountries, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Compliance Score')).toBeInTheDocument();
    expect(screen.getByText('Active Regulations')).toBeInTheDocument();
    expect(screen.getByText('Violations')).toBeInTheDocument();
    expect(screen.getByText('Pending Reviews')).toBeInTheDocument();
  });

  it('renders compliance overview pie chart card', () => {
    setupMocks({
      rules: { data: mockRules, loading: false, error: null },
      status: { data: mockStatus, loading: false, error: null },
      countries: { data: mockCountries, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Compliance Overview')).toBeInTheDocument();
    expect(screen.getByText('Compliant')).toBeInTheDocument();
  });

  it('renders country compliance bar chart', () => {
    setupMocks({
      rules: { data: mockRules, loading: false, error: null },
      status: { data: mockStatus, loading: false, error: null },
      countries: { data: mockCountries, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Country Compliance')).toBeInTheDocument();
  });

  it('renders regulation tracking table with rules', () => {
    setupMocks({
      rules: { data: mockRules, loading: false, error: null },
      status: { data: mockStatus, loading: false, error: null },
      countries: { data: mockCountries, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Regulation Tracking')).toBeInTheDocument();
    expect(screen.getByText('GDPR Data Collection')).toBeInTheDocument();
    expect(screen.getByText('CCPA Privacy Rights')).toBeInTheDocument();
    expect(screen.getByText('VAT Compliance')).toBeInTheDocument();
  });

  it('renders flagged campaigns section', () => {
    setupMocks({
      rules: { data: mockRules, loading: false, error: null },
      status: { data: mockStatus, loading: false, error: null },
      countries: { data: mockCountries, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('High-Risk Campaign Flags')).toBeInTheDocument();
    expect(screen.getByText('Summer Sale DE')).toBeInTheDocument();
    expect(screen.getByText('Flash Sale SA')).toBeInTheDocument();
  });

  it('renders data protection compliance section', () => {
    setupMocks({
      rules: { data: mockRules, loading: false, error: null },
      status: { data: mockStatus, loading: false, error: null },
      countries: { data: mockCountries, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Data Protection Compliance')).toBeInTheDocument();
    expect(screen.getByText('Consent Management')).toBeInTheDocument();
    expect(screen.getByText('Data Retention')).toBeInTheDocument();
  });

  it('renders ad restriction enforcement section', () => {
    setupMocks({
      rules: { data: mockRules, loading: false, error: null },
      status: { data: mockStatus, loading: false, error: null },
      countries: { data: mockCountries, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Ad Restriction Enforcement')).toBeInTheDocument();
    expect(screen.getAllByText('Saudi Arabia').length).toBeGreaterThan(0);
  });

  it('renders audit log table', () => {
    setupMocks({
      rules: { data: mockRules, loading: false, error: null },
      status: { data: mockStatus, loading: false, error: null },
      countries: { data: mockCountries, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Recent Compliance Audit Log')).toBeInTheDocument();
    expect(screen.getByText('GDPR compliance check')).toBeInTheDocument();
  });

  it('renders category filter buttons', () => {
    setupMocks({
      rules: { data: mockRules, loading: false, error: null },
      status: { data: mockStatus, loading: false, error: null },
      countries: { data: mockCountries, loading: false, error: null },
    });
    renderPage();
    expect(screen.getAllByText('Data Protection').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ad Standards').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Consumer Rights').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tax').length).toBeGreaterThan(0);
  });

  it('shows Run Audit button', () => {
    setupMocks({
      rules: { data: mockRules, loading: false, error: null },
      status: { data: mockStatus, loading: false, error: null },
      countries: { data: mockCountries, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Run Audit')).toBeInTheDocument();
  });
});
