import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React, { createElement, type ReactNode } from 'react';

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
  AreaChart: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  BarChart: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  LineChart: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  PieChart: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  RadarChart: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  ComposedChart: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  Area: () => null, Bar: () => null, Line: () => null, Pie: () => null, Radar: () => null,
  XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null,
  Legend: () => null, Cell: () => null, PolarGrid: () => null, PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null, Funnel: () => null, FunnelChart: () => null,
  ScatterChart: () => null, Scatter: () => null, ZAxis: () => null,
}));

import { useApiQuery } from '../../src/hooks/useApi';
import DataEngineering from '../../src/pages/DataEngineering';

const mockUseApiQuery = useApiQuery as ReturnType<typeof vi.fn>;

const mockMonitoringData = {
  kpis: {
    pipelinesActive: 12,
    pipelinesActiveChange: 2,
    dataThroughput: '2.4M/hr',
    dataThroughputChange: 15,
    errorRate: '0.012%',
    errorRateChange: -0.3,
    uptime: '99.97%',
    uptimeChange: 0.02,
  },
  pipelines: [
    { id: 'p1', name: 'GA4 Events', source: 'Google Analytics', destination: 'BigQuery', status: 'healthy' as const, throughput: '450K/hr', errors: 0, lastRun: '2 min ago' },
    { id: 'p2', name: 'Meta Ads', source: 'Meta API', destination: 'Warehouse', status: 'degraded' as const, throughput: '120K/hr', errors: 5, lastRun: '5 min ago' },
    { id: 'p3', name: 'CRM Sync', source: 'Salesforce', destination: 'Data Lake', status: 'down' as const, throughput: '0/hr', errors: 42, lastRun: '30 min ago' },
  ],
  throughputData: [
    { hour: '00:00', events: 1200000 },
    { hour: '06:00', events: 2400000 },
    { hour: '12:00', events: 3100000 },
  ],
  errorRateData: [
    { day: 'Mon', errorRate: 0.015 },
    { day: 'Tue', errorRate: 0.012 },
    { day: 'Wed', errorRate: 0.008 },
  ],
  serverTrackingEndpoints: [
    { name: 'Analytics Endpoint', status: 'operational' as const, latency: '12ms', uptime: '99.99%' },
    { name: 'Conversion Endpoint', status: 'degraded' as const, latency: '85ms', uptime: '99.5%' },
  ],
  eventValidations: [
    { name: 'Purchase Events', status: 'valid' as const },
    { name: 'Page View Events', status: 'warning' as const, message: 'Missing utm_source parameter in 3% of events' },
  ],
};

const mockQualityData = {
  metrics: [
    { label: 'Completeness', value: '99.2%', numericValue: 0.8, color: 'success' as const, description: 'All required fields populated' },
    { label: 'Freshness', value: '< 5 min', numericValue: 95, color: 'success' as const, description: 'Data latency within SLA' },
    { label: 'Schema Validation', value: '98.5%', numericValue: 98.5, color: 'success' as const, description: 'Events matching schema definition' },
    { label: 'Duplicates', value: '0.02%', numericValue: 0.02, color: 'primary' as const, description: 'Duplicate rate across all pipelines' },
  ],
  errorLog: [
    { id: 'e1', timestamp: '2024-01-15 14:32', pipeline: 'CRM Sync', severity: 'critical' as const, message: 'Connection timeout', details: 'Failed to connect to Salesforce API after 3 retries' },
    { id: 'e2', timestamp: '2024-01-15 13:45', pipeline: 'Meta Ads', severity: 'warning' as const, message: 'Rate limit approaching', details: 'Meta API rate limit at 85%' },
  ],
};

function renderComponent() {
  return render(
    <BrowserRouter>
      <DataEngineering />
    </BrowserRouter>
  );
}

describe('DataEngineering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page header with title and subtitle', () => {
    mockUseApiQuery.mockReturnValue({ data: null, loading: true, error: null, refetch: vi.fn() });
    renderComponent();
    expect(screen.getByText('Data Engineering')).toBeInTheDocument();
    expect(screen.getByText('Event Tracking, Pipeline Monitoring & Data Quality')).toBeInTheDocument();
  });

  it('renders loading state when monitoring data is loading', () => {
    mockUseApiQuery.mockReturnValue({ data: null, loading: true, error: null, refetch: vi.fn() });
    renderComponent();
    expect(screen.getByText('Data Engineering')).toBeInTheDocument();
    expect(screen.queryByText('GA4 Events')).not.toBeInTheDocument();
  });

  it('renders error state when monitoring API fails', () => {
    const error = new Error('Monitoring service unavailable');
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('monitoring')) return { data: null, loading: false, error, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getAllByText(/Monitoring service unavailable/i).length).toBeGreaterThan(0);
  });

  it('renders KPI cards with monitoring data', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('monitoring')) return { data: mockMonitoringData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('data-quality')) return { data: mockQualityData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Pipelines Active')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getAllByText('Data Throughput').length).toBeGreaterThan(0);
    expect(screen.getByText('2.4M/hr')).toBeInTheDocument();
    expect(screen.getByText('Uptime')).toBeInTheDocument();
    expect(screen.getByText('99.97%')).toBeInTheDocument();
  });

  it('renders pipeline table with all pipelines', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('monitoring')) return { data: mockMonitoringData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('data-quality')) return { data: mockQualityData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('GA4 Events')).toBeInTheDocument();
    expect(screen.getAllByText('Meta Ads').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CRM Sync').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Google Analytics').length).toBeGreaterThan(0);
    expect(screen.getAllByText('BigQuery').length).toBeGreaterThan(0);
  });

  it('renders pipeline throughput values', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('monitoring')) return { data: mockMonitoringData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('data-quality')) return { data: mockQualityData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('450K/hr')).toBeInTheDocument();
    expect(screen.getByText('0/hr')).toBeInTheDocument();
  });

  it('renders data quality metrics when quality data is loaded', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('monitoring')) return { data: mockMonitoringData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('data-quality')) return { data: mockQualityData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Completeness')).toBeInTheDocument();
    expect(screen.getByText('Freshness')).toBeInTheDocument();
    expect(screen.getByText('Schema Validation')).toBeInTheDocument();
    expect(screen.getByText('Duplicates')).toBeInTheDocument();
  });

  it('renders error log entries', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('monitoring')) return { data: mockMonitoringData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('data-quality')) return { data: mockQualityData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Connection timeout')).toBeInTheDocument();
    expect(screen.getByText('Rate limit approaching')).toBeInTheDocument();
  });

  it('renders server tracking endpoints', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('monitoring')) return { data: mockMonitoringData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('data-quality')) return { data: mockQualityData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Analytics Endpoint')).toBeInTheDocument();
    expect(screen.getByText('Conversion Endpoint')).toBeInTheDocument();
    expect(screen.getAllByText('operational').length).toBeGreaterThan(0);
    expect(screen.getAllByText('degraded').length).toBeGreaterThan(0);
  });

  it('renders event validations with warning messages', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('monitoring')) return { data: mockMonitoringData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('data-quality')) return { data: mockQualityData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Purchase Events')).toBeInTheDocument();
    expect(screen.getByText('Page View Events')).toBeInTheDocument();
    expect(screen.getByText('Missing utm_source parameter in 3% of events')).toBeInTheDocument();
  });

  it('renders empty state when no pipelines exist', () => {
    const emptyMonitoring = { ...mockMonitoringData, pipelines: [] };
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('monitoring')) return { data: emptyMonitoring, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('data-quality')) return { data: mockQualityData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('No pipelines')).toBeInTheDocument();
  });

  it('renders Run Agent and Refresh buttons', () => {
    mockUseApiQuery.mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });
    renderComponent();
    expect(screen.getByText('Run Agent')).toBeInTheDocument();
    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });

  it('renders error state for data quality API failure', () => {
    const error = new Error('Quality data error');
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('monitoring')) return { data: mockMonitoringData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('data-quality')) return { data: null, loading: false, error, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getAllByText(/Quality data error/i).length).toBeGreaterThan(0);
  });
});
