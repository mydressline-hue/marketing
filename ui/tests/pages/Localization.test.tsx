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
import Localization from '../../src/pages/Localization';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockCountries = [
  { id: 'c1', name: 'Germany', code: 'DE', region: 'Europe', language: 'de', currency: 'EUR', timezone: 'CET', is_active: true, created_at: '2024-01-01', updated_at: '2024-01-15', opportunity_score: 85, entry_strategy: 'Direct market entry' },
  { id: 'c2', name: 'Japan', code: 'JP', region: 'Asia', language: 'ja', currency: 'JPY', timezone: 'JST', is_active: true, created_at: '2024-01-01', updated_at: '2024-01-15', opportunity_score: 78, entry_strategy: 'Localized partnership' },
  { id: 'c3', name: 'Saudi Arabia', code: 'SA', region: 'MENA', language: 'ar', currency: 'SAR', timezone: 'AST', is_active: true, created_at: '2024-01-01', updated_at: '2024-01-15', opportunity_score: 72, entry_strategy: 'Regional distributor' },
];

const mockTranslations = [
  { id: 't1', source_content_id: 'src-1', language: 'de', translated_text: 'Willkommen bei unserem Shop', status: 'completed', cultural_adaptations: { tone_adjustments: ['Formal tone preferred'], imagery_notes: [], taboo_topics: [], local_references: [] }, created_at: '2024-01-10', updated_at: '2024-01-15' },
  { id: 't2', source_content_id: 'src-2', language: 'de', translated_text: 'Sonderangebote', status: 'completed', cultural_adaptations: null, created_at: '2024-01-10', updated_at: '2024-01-14' },
  { id: 't3', source_content_id: 'src-1', language: 'ja', translated_text: '\u3088\u3046\u3053\u305D', status: 'completed', cultural_adaptations: { tone_adjustments: [], imagery_notes: [], taboo_topics: ['Direct pricing comparisons'], local_references: [] }, created_at: '2024-01-10', updated_at: '2024-01-13' },
  { id: 't4', source_content_id: 'src-1', language: 'ar', translated_text: '\u0645\u0631\u062D\u0628\u0627', status: 'pending', cultural_adaptations: { tone_adjustments: ['Respectful greeting style'], imagery_notes: [], taboo_topics: ['Alcohol references'], local_references: [] }, created_at: '2024-01-10', updated_at: '2024-01-12' },
];

// Helper - Localization uses 2 useApiQuery calls: countries, translations
function setupMocks(overrides: {
  countries?: { data: any; loading: boolean; error: any };
  translations?: { data: any; loading: boolean; error: any };
} = {}) {
  const defaultReturn = { data: null, loading: false, error: null, refetch: vi.fn() };
  (useApiQuery as any)
    .mockReturnValueOnce({ ...defaultReturn, ...overrides.countries })
    .mockReturnValueOnce({ ...defaultReturn, ...overrides.translations });
}

const renderPage = () =>
  render(createElement(BrowserRouter, null, createElement(Localization)));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Localization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Loading states ----

  it('shows loading indicator in KPIs when data is loading', () => {
    setupMocks({
      countries: { data: null, loading: true, error: null },
      translations: { data: null, loading: true, error: null },
    });
    renderPage();
    expect(screen.getByText('Languages Active')).toBeInTheDocument();
    // KPI values should show '--' when loading
    expect(screen.getAllByText('--').length).toBeGreaterThan(0);
  });

  it('renders page header with title', () => {
    setupMocks({
      countries: { data: null, loading: true, error: null },
      translations: { data: null, loading: true, error: null },
    });
    renderPage();
    expect(screen.getByText('Multi-Language Localization')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    setupMocks({
      countries: { data: null, loading: true, error: null },
      translations: { data: null, loading: true, error: null },
    });
    renderPage();
    expect(screen.getByText('Native-Level Translation & Cultural Adaptation')).toBeInTheDocument();
  });

  // ---- Error states ----

  it('shows error display when countries data fails', () => {
    setupMocks({
      countries: { data: null, loading: false, error: new Error('Countries failed') },
      translations: { data: mockTranslations, loading: false, error: null },
    });
    renderPage();
    expect(screen.getAllByText(/retry/i).length).toBeGreaterThan(0);
  });

  // ---- Data loaded states ----

  it('renders KPI cards when data is loaded', () => {
    setupMocks({
      countries: { data: mockCountries, loading: false, error: null },
      translations: { data: mockTranslations, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Languages Active')).toBeInTheDocument();
    expect(screen.getByText('Translation Coverage')).toBeInTheDocument();
    expect(screen.getByText('Cultural Adaptations')).toBeInTheDocument();
    expect(screen.getByText('Currency Pairs')).toBeInTheDocument();
  });

  it('renders language progress table with languages', () => {
    setupMocks({
      countries: { data: mockCountries, loading: false, error: null },
      translations: { data: mockTranslations, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Language Progress')).toBeInTheDocument();
    expect(screen.getAllByText('German').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Japanese').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Arabic').length).toBeGreaterThan(0);
  });

  it('renders translation completeness by content type chart', () => {
    setupMocks({
      countries: { data: mockCountries, loading: false, error: null },
      translations: { data: mockTranslations, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Translation Completeness by Content Type')).toBeInTheDocument();
  });

  it('renders cultural adaptation settings', () => {
    setupMocks({
      countries: { data: mockCountries, loading: false, error: null },
      translations: { data: mockTranslations, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Cultural Adaptation Settings')).toBeInTheDocument();
  });

  it('renders translation quality review section', () => {
    setupMocks({
      countries: { data: mockCountries, loading: false, error: null },
      translations: { data: mockTranslations, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Translation Quality Review')).toBeInTheDocument();
  });

  it('renders currency conversion pairs section', () => {
    setupMocks({
      countries: { data: mockCountries, loading: false, error: null },
      translations: { data: mockTranslations, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Currency Conversion Pairs')).toBeInTheDocument();
  });

  it('renders legal compliance messaging section', () => {
    setupMocks({
      countries: { data: mockCountries, loading: false, error: null },
      translations: { data: mockTranslations, loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('Legal Compliance Messaging')).toBeInTheDocument();
  });

  // ---- Empty states ----

  it('renders empty state when no countries or translations exist', () => {
    setupMocks({
      countries: { data: [], loading: false, error: null },
      translations: { data: [], loading: false, error: null },
    });
    renderPage();
    expect(screen.getByText('No languages found')).toBeInTheDocument();
  });
});
