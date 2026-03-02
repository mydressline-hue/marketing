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
import CreativeStudio from '../../src/pages/CreativeStudio';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockCreativesData = {
  kpis: [
    { label: 'Total Creatives', value: 128, change: 15, trend: 'up' as const },
    { label: 'Avg Performance', value: '8.4', change: 0.3, trend: 'up' as const },
    { label: 'Active Assets', value: 86, change: 5, trend: 'up' as const },
    { label: 'Brand Compliance', value: '94%', change: 2, trend: 'up' as const },
  ],
  creatives: [
    {
      id: 'cr1', title: 'Summer Glow Ad Copy', type: 'ad_copy' as const,
      preview: 'Unlock your summer glow with ProGlow Serum. Clinically proven results in 14 days.',
      platform: 'Meta', country: 'US', performanceScore: 9.2, status: 'active' as const,
    },
    {
      id: 'cr2', title: 'Product Demo Script', type: 'video_script' as const,
      preview: 'Scene 1: Close-up of product application...',
      platform: 'TikTok', country: 'JP', performanceScore: 8.5, status: 'active' as const,
    },
    {
      id: 'cr3', title: 'UGC Testimonial Script', type: 'ugc_script' as const,
      preview: 'Hey guys! I have been using this serum for 2 weeks and...',
      platform: 'Instagram', country: 'US', performanceScore: 7.8, status: 'draft' as const,
    },
    {
      id: 'cr4', title: 'Holiday Banner', type: 'image' as const,
      preview: '', platform: 'Google', country: 'DE', performanceScore: 8.1,
      status: 'review' as const, colorPlaceholder: 'from-purple-500 to-pink-500',
    },
  ],
  topPerforming: [
    {
      id: 'tp1', title: 'Summer Glow Ad Copy', type: 'Ad Copy',
      score: 9.2, impressions: '1.2M', ctr: '4.8%', conversions: 3400,
    },
    {
      id: 'tp2', title: 'Product Demo Script', type: 'Video Script',
      score: 8.5, impressions: '850K', ctr: '5.2%', conversions: 2100,
    },
  ],
  fatigueAlerts: [
    {
      id: 'fa1', creative: 'Old Summer Ad', platform: 'Meta',
      frequency: 4.2, threshold: 5, daysActive: 28,
      recommendation: 'Consider refreshing creative to maintain engagement.',
    },
  ],
  brandToneChecks: [
    { label: 'Voice Consistency', status: 'compliant' as const, score: 96 },
    { label: 'Color Palette', status: 'compliant' as const, score: 92 },
    { label: 'Messaging Tone', status: 'warning' as const, score: 78 },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const renderPage = () =>
  render(createElement(BrowserRouter, null, createElement(CreativeStudio)));

function mockQuery(override: Partial<ReturnType<typeof useApiQuery>> = {}) {
  const defaultReturn = { data: null, loading: false, error: null, refetch: vi.fn() };
  (useApiQuery as any).mockReturnValue({ ...defaultReturn, ...override });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreativeStudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- Loading states ----

  it('shows loading skeletons when data is loading', () => {
    mockQuery({ loading: true });
    const { container } = renderPage();
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBeGreaterThan(0);
  });

  // ---- Error states ----

  it('shows error display when API errors', () => {
    mockQuery({ error: new Error('Creatives API Error') });
    renderPage();
    expect(screen.getAllByText(/retry/i).length).toBeGreaterThan(0);
  });

  // ---- Page header ----

  it('renders page header with correct title', () => {
    mockQuery({ data: mockCreativesData });
    renderPage();
    expect(screen.getByText('Creative Studio')).toBeInTheDocument();
    expect(screen.getByText(/AI-Powered Ad Copy/)).toBeInTheDocument();
  });

  // ---- KPI cards ----

  it('renders KPI cards from creatives data', () => {
    mockQuery({ data: mockCreativesData });
    renderPage();
    expect(screen.getByText('Total Creatives')).toBeInTheDocument();
    expect(screen.getByText('Avg Performance')).toBeInTheDocument();
    expect(screen.getByText('Active Assets')).toBeInTheDocument();
    expect(screen.getByText('Brand Compliance')).toBeInTheDocument();
  });

  // ---- Creative gallery ----

  it('renders creative items in the gallery', () => {
    mockQuery({ data: mockCreativesData });
    renderPage();
    expect(screen.getAllByText('Summer Glow Ad Copy').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Product Demo Script').length).toBeGreaterThan(0);
    expect(screen.getAllByText('UGC Testimonial Script').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Holiday Banner').length).toBeGreaterThan(0);
  });

  it('renders tab filter options for creative types', () => {
    mockQuery({ data: mockCreativesData });
    renderPage();
    expect(screen.getAllByText('All').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ad Copy').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Video Scripts').length).toBeGreaterThan(0);
    expect(screen.getAllByText('UGC Scripts').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Images').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Thumbnails').length).toBeGreaterThan(0);
  });

  // ---- AI Generation Panel ----

  it('renders AI generation panel', () => {
    mockQuery({ data: mockCreativesData });
    renderPage();
    expect(screen.getByText('AI Generation')).toBeInTheDocument();
    expect(screen.getByText('Generate Creative')).toBeInTheDocument();
  });

  // ---- Brand Tone Compliance ----

  it('renders brand tone compliance checks', () => {
    mockQuery({ data: mockCreativesData });
    renderPage();
    expect(screen.getByText('Brand Tone Compliance')).toBeInTheDocument();
    expect(screen.getByText('Voice Consistency')).toBeInTheDocument();
    expect(screen.getByText('Color Palette')).toBeInTheDocument();
    expect(screen.getByText('Messaging Tone')).toBeInTheDocument();
    expect(screen.getByText('Overall Compliance')).toBeInTheDocument();
  });

  // ---- Top Performing ----

  it('renders top performing creatives list', () => {
    mockQuery({ data: mockCreativesData });
    renderPage();
    expect(screen.getByText('Top Performing Creatives')).toBeInTheDocument();
  });

  // ---- Fatigue Alerts ----

  it('renders creative fatigue alerts', () => {
    mockQuery({ data: mockCreativesData });
    renderPage();
    expect(screen.getByText('Creative Fatigue Alerts')).toBeInTheDocument();
    expect(screen.getByText('Old Summer Ad')).toBeInTheDocument();
    expect(screen.getByText(/Consider refreshing creative/)).toBeInTheDocument();
  });

  // ---- New Creative button ----

  it('renders New Creative button in header', () => {
    mockQuery({ data: mockCreativesData });
    renderPage();
    expect(screen.getByText('New Creative')).toBeInTheDocument();
  });
});
