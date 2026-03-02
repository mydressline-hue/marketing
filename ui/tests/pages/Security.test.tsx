import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
import Security from '../../src/pages/Security';

const mockUseApiQuery = useApiQuery as ReturnType<typeof vi.fn>;

const mockSecurityData = {
  kpis: {
    securityScore: '94/100',
    securityScoreChange: 2,
    apiKeysActive: 8,
    apiKeysChange: 0,
    accessViolations: 3,
    accessViolationsChange: -2,
    threatsBlocked: 127,
    threatsBlockedChange: 15,
  },
  encryption: {
    atRest: 'AES-256',
    inTransit: 'TLS 1.3',
  },
  secretVault: {
    provider: 'AWS Secrets Manager',
    status: 'active',
    lastRotation: '3 days ago',
  },
  ddosProtection: {
    status: 'active',
    attacksBlocked: 127,
    uptime: '99.99%',
  },
  mfa: {
    adminAccounts: '100%',
    allUsers: '98%',
    method: 'TOTP + WebAuthn',
  },
  securityEventsByType: [
    { name: 'Auth Failures', value: 45, color: '#ef4444' },
    { name: 'Rate Limits', value: 120, color: '#f59e0b' },
    { name: 'API Anomalies', value: 23, color: '#3b82f6' },
  ],
  threatScans: [
    { id: 'ts1', target: 'API Gateway', result: 'Clean', vulnerabilities: 0, lastScan: '1 hour ago', severity: 'low' as const },
    { id: 'ts2', target: 'Database Cluster', result: '1 advisory', vulnerabilities: 1, lastScan: '2 hours ago', severity: 'medium' as const },
  ],
  soc2Checklist: [
    { id: 'soc1', category: 'Data Encryption', status: 'pass' as const, detail: 'All data encrypted at rest and in transit', lastAudit: '2024-01-10' },
    { id: 'soc2', category: 'Access Control', status: 'warning' as const, detail: 'MFA coverage needs improvement', lastAudit: '2024-01-10' },
  ],
  roles: [
    { role: 'Admin', iconType: 'shield', users: 3, permissions: { 'API Keys': 'full', 'Campaigns': 'full', 'Billing': 'full', 'Analytics': 'full', 'User Mgmt': 'full', 'Kill Switch': 'full' } },
    { role: 'Analyst', iconType: 'eye', users: 12, permissions: { 'API Keys': 'none', 'Campaigns': 'read', 'Billing': 'none', 'Analytics': 'full', 'User Mgmt': 'none', 'Kill Switch': 'none' } },
  ],
  sessions: [
    { user: 'john.doe', role: 'Admin', location: 'New York, US', device: 'Chrome / macOS', since: '2h 15m' },
    { user: 'jane.smith', role: 'Analyst', location: 'London, UK', device: 'Firefox / Windows', since: '45m' },
  ],
};

const mockApiKeysData = {
  keys: [
    { id: 'k1', name: 'Google Ads API', service: 'Google Ads', created: '2024-01-01', lastUsed: '2 min ago', status: 'active' as const, rotation: 'Every 30 days', expiresIn: '22 days', requests: 45000 },
    { id: 'k2', name: 'Meta Marketing API', service: 'Meta', created: '2023-12-15', lastUsed: '5 min ago', status: 'active' as const, rotation: 'Every 30 days', expiresIn: '10 days', requests: 32000 },
  ],
};

const mockAuditData = {
  entries: [
    { id: 'a1', timestamp: '2024-01-15 14:32', user: 'john.doe', action: 'API Key Rotated', ip: '192.168.1.1', status: 'completed' as const },
    { id: 'a2', timestamp: '2024-01-15 13:10', user: 'jane.smith', action: 'Login', ip: '10.0.0.5', status: 'active' as const },
  ],
};

function renderComponent() {
  return render(
    <BrowserRouter>
      <Security />
    </BrowserRouter>
  );
}

describe('Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page header with title and subtitle', () => {
    mockUseApiQuery.mockReturnValue({ data: null, loading: true, error: null, refetch: vi.fn() });
    renderComponent();
    expect(screen.getByText('Enterprise Security')).toBeInTheDocument();
    expect(screen.getByText('API Protection, Access Control & SOC2 Compliance')).toBeInTheDocument();
  });

  it('renders KPI cards when security data loads', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('security')) return { data: mockSecurityData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('audit')) return { data: mockAuditData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Security Score')).toBeInTheDocument();
    expect(screen.getByText('94/100')).toBeInTheDocument();
    expect(screen.getByText('API Keys Active')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('Access Violations')).toBeInTheDocument();
    expect(screen.getByText('Threats Blocked')).toBeInTheDocument();
  });

  it('renders error state when security API fails', () => {
    const error = new Error('Security data unavailable');
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('security')) return { data: null, loading: false, error, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: null, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('audit')) return { data: null, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getAllByText(/Security data unavailable/i).length).toBeGreaterThan(0);
  });

  it('renders encryption information on overview tab', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('security')) return { data: mockSecurityData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('audit')) return { data: mockAuditData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('AES-256')).toBeInTheDocument();
    expect(screen.getByText('TLS 1.3')).toBeInTheDocument();
  });

  it('renders secret vault information on overview tab', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('security')) return { data: mockSecurityData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('audit')) return { data: mockAuditData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('AWS Secrets Manager')).toBeInTheDocument();
    expect(screen.getByText('3 days ago')).toBeInTheDocument();
  });

  it('renders MFA status on overview tab', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('security')) return { data: mockSecurityData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('audit')) return { data: mockAuditData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('98%')).toBeInTheDocument();
    expect(screen.getByText('TOTP + WebAuthn')).toBeInTheDocument();
  });

  it('renders threat scans on overview tab', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('security')) return { data: mockSecurityData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('audit')) return { data: mockAuditData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('API Gateway')).toBeInTheDocument();
    expect(screen.getByText('Database Cluster')).toBeInTheDocument();
    expect(screen.getByText('Clean')).toBeInTheDocument();
    expect(screen.getByText('1 advisory')).toBeInTheDocument();
  });

  it('renders SOC2 checklist items on overview tab', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('security')) return { data: mockSecurityData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('audit')) return { data: mockAuditData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getAllByText('Data Encryption').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Access Control').length).toBeGreaterThan(0);
  });

  it('switches to API Keys tab and renders key table', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('security')) return { data: mockSecurityData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('audit')) return { data: mockAuditData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    const apiKeysTab = screen.getByRole('button', { name: /API Keys/i });
    fireEvent.click(apiKeysTab);
    expect(screen.getByText('Google Ads API')).toBeInTheDocument();
    expect(screen.getByText('Meta Marketing API')).toBeInTheDocument();
    expect(screen.getByText('Generate New Key')).toBeInTheDocument();
  });

  it('switches to Access Control tab and renders roles', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('security')) return { data: mockSecurityData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('audit')) return { data: mockAuditData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    const accessTab = screen.getByRole('button', { name: /Access Control/i });
    fireEvent.click(accessTab);
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Analyst')).toBeInTheDocument();
    expect(screen.getByText('Manage Roles')).toBeInTheDocument();
  });

  it('switches to Access Control tab and renders active sessions', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('security')) return { data: mockSecurityData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('audit')) return { data: mockAuditData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    const accessTab = screen.getByRole('button', { name: /Access Control/i });
    fireEvent.click(accessTab);
    expect(screen.getByText('john.doe')).toBeInTheDocument();
    expect(screen.getByText('jane.smith')).toBeInTheDocument();
  });

  it('switches to Audit & Compliance tab and renders audit log', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('security')) return { data: mockSecurityData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('audit')) return { data: mockAuditData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    const auditTab = screen.getByRole('button', { name: /Audit & Compliance/i });
    fireEvent.click(auditTab);
    expect(screen.getByText('API Key Rotated')).toBeInTheDocument();
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.1')).toBeInTheDocument();
    expect(screen.getByText('Export Log')).toBeInTheDocument();
  });

  it('renders Run Security Scan button', () => {
    mockUseApiQuery.mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });
    renderComponent();
    expect(screen.getByText('Run Security Scan')).toBeInTheDocument();
  });

  it('renders security events by type on overview tab', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('security')) return { data: mockSecurityData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('api-keys')) return { data: mockApiKeysData, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('audit')) return { data: mockAuditData, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Auth Failures')).toBeInTheDocument();
    expect(screen.getByText('Rate Limits')).toBeInTheDocument();
    expect(screen.getByText('API Anomalies')).toBeInTheDocument();
  });
});
