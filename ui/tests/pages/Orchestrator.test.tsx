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
import Orchestrator from '../../src/pages/Orchestrator';

const mockUseApiQuery = useApiQuery as ReturnType<typeof vi.fn>;

const mockAgents = [
  {
    id: 1, name: 'Content Strategist', status: 'active' as const, confidence: 92,
    tasksCompleted: 145, tasksPending: 3, lastAction: 'Generated content brief for UAE campaign',
    lastUpdated: '2 min ago', challenges: ['Brand Agent', 'SEO Agent'], crossChallengedBy: ['Compliance Agent'],
  },
  {
    id: 2, name: 'Budget Optimizer', status: 'idle' as const, confidence: 88,
    tasksCompleted: 98, tasksPending: 0, lastAction: 'Optimized daily budget allocation',
    lastUpdated: '10 min ago', challenges: ['Revenue Agent'], crossChallengedBy: ['Risk Agent'],
  },
  {
    id: 3, name: 'Fraud Detector', status: 'warning' as const, confidence: 65,
    tasksCompleted: 210, tasksPending: 7, lastAction: 'Flagged suspicious click pattern',
    lastUpdated: '1 min ago', challenges: [], crossChallengedBy: ['Data Agent'],
  },
  {
    id: 4, name: 'Risk Analyzer', status: 'error' as const, confidence: 42,
    tasksCompleted: 55, tasksPending: 12, lastAction: 'Error during risk assessment',
    lastUpdated: '5 min ago', challenges: ['Budget Agent'], crossChallengedBy: [],
  },
];

const mockDecisions = [
  { decision: 'Increase US Google Ads budget by 15%', sources: 'Budget + Revenue', confidence: 91, impact: 'High', status: 'approved' },
  { decision: 'Pause TikTok campaign in JP', sources: 'Fraud + Risk', confidence: 78, impact: 'Medium', status: 'pending' },
  { decision: 'Launch new SEO campaign for DE', sources: 'Content + SEO', confidence: 85, impact: 'High', status: 'approved' },
];

const mockCrossChallenge = {
  contradictions: [
    { agents: ['Budget Agent', 'Risk Agent'], issue: 'Budget increase conflicts with risk threshold', resolution: 'Capped increase to 10%', status: 'completed' },
    { agents: ['Content Agent', 'Brand Agent'], issue: 'Tone mismatch in generated content', resolution: 'Pending human review', status: 'warning' },
  ],
  systemHealth: [
    { metric: 'Accuracy', value: 92 },
    { metric: 'Latency', value: 85 },
    { metric: 'Coverage', value: 95 },
    { metric: 'Consistency', value: 88 },
  ],
};

function renderComponent() {
  return render(
    <BrowserRouter>
      <Orchestrator />
    </BrowserRouter>
  );
}

describe('Orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page header with title and subtitle', () => {
    mockUseApiQuery.mockReturnValue({ data: null, loading: true, error: null, refetch: vi.fn() });
    renderComponent();
    expect(screen.getByText('Master Orchestrator')).toBeInTheDocument();
    expect(screen.getByText('Agent Coordination, Cross-Challenge Protocol & Decision Matrix')).toBeInTheDocument();
  });

  it('renders KPI cards with computed agent data', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('/v1/agents') && !url.includes('orchestrator') && !url.includes('challenge')) return { data: mockAgents, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('decisions')) return { data: mockDecisions, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('challenge')) return { data: mockCrossChallenge, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Active Agents')).toBeInTheDocument();
    expect(screen.getByText('1/20')).toBeInTheDocument();
    expect(screen.getByText('Avg Confidence')).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
    expect(screen.getByText('Tasks Completed')).toBeInTheDocument();
    expect(screen.getByText('Contradictions')).toBeInTheDocument();
  });

  it('renders agent status matrix with agent list', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('/v1/agents') && !url.includes('orchestrator') && !url.includes('challenge')) return { data: mockAgents, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('decisions')) return { data: mockDecisions, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('challenge')) return { data: mockCrossChallenge, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Agent Status Matrix')).toBeInTheDocument();
    expect(screen.getByText(/Content Strategist/)).toBeInTheDocument();
    expect(screen.getByText(/Budget Optimizer/)).toBeInTheDocument();
    expect(screen.getByText(/Fraud Detector/)).toBeInTheDocument();
    expect(screen.getByText(/Risk Analyzer/)).toBeInTheDocument();
  });

  it('expands agent details when agent row is clicked', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('/v1/agents') && !url.includes('orchestrator') && !url.includes('challenge')) return { data: mockAgents, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('decisions')) return { data: mockDecisions, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('challenge')) return { data: mockCrossChallenge, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    const agentButton = screen.getByText(/Content Strategist/).closest('button');
    fireEvent.click(agentButton!);
    expect(screen.getByText('Generated content brief for UAE campaign')).toBeInTheDocument();
    expect(screen.getByText(/145 completed, 3 pending/)).toBeInTheDocument();
    expect(screen.getAllByText('Brand Agent').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SEO Agent').length).toBeGreaterThan(0);
  });

  it('renders decision matrix with decisions', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('/v1/agents') && !url.includes('orchestrator') && !url.includes('challenge')) return { data: mockAgents, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('decisions')) return { data: mockDecisions, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('challenge')) return { data: mockCrossChallenge, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Decision Matrix')).toBeInTheDocument();
    expect(screen.getByText('Increase US Google Ads budget by 15%')).toBeInTheDocument();
    expect(screen.getByText('Pause TikTok campaign in JP')).toBeInTheDocument();
    expect(screen.getByText('Launch new SEO campaign for DE')).toBeInTheDocument();
  });

  it('renders contradiction detection with contradictions', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('/v1/agents') && !url.includes('orchestrator') && !url.includes('challenge')) return { data: mockAgents, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('decisions')) return { data: mockDecisions, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('challenge')) return { data: mockCrossChallenge, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('Contradiction Detection')).toBeInTheDocument();
    expect(screen.getByText('Budget increase conflicts with risk threshold')).toBeInTheDocument();
    expect(screen.getByText('Capped increase to 10%')).toBeInTheDocument();
    expect(screen.getByText('Tone mismatch in generated content')).toBeInTheDocument();
  });

  it('renders empty state when no agents exist', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('/v1/agents') && !url.includes('orchestrator') && !url.includes('challenge')) return { data: [], loading: false, error: null, refetch: vi.fn() };
      if (url.includes('decisions')) return { data: mockDecisions, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('challenge')) return { data: mockCrossChallenge, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('No agents found')).toBeInTheDocument();
  });

  it('renders empty state for decisions when none exist', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('/v1/agents') && !url.includes('orchestrator') && !url.includes('challenge')) return { data: mockAgents, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('decisions')) return { data: [], loading: false, error: null, refetch: vi.fn() };
      if (url.includes('challenge')) return { data: mockCrossChallenge, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('No decisions yet')).toBeInTheDocument();
  });

  it('renders error state when agents API fails', () => {
    const error = new Error('Agent data unavailable');
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('/v1/agents') && !url.includes('orchestrator') && !url.includes('challenge')) return { data: null, loading: false, error, refetch: vi.fn() };
      if (url.includes('decisions')) return { data: null, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('challenge')) return { data: null, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getAllByText(/Agent data unavailable/i).length).toBeGreaterThan(0);
  });

  it('renders Run Orchestration button', () => {
    mockUseApiQuery.mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });
    renderComponent();
    expect(screen.getAllByText('Run Orchestration').length).toBeGreaterThan(0);
  });

  it('renders WebSocket connection status indicator as Live', () => {
    mockUseApiQuery.mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });
    renderComponent();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders system health radar chart section', () => {
    mockUseApiQuery.mockImplementation((url: string) => {
      if (url.includes('/v1/agents') && !url.includes('orchestrator') && !url.includes('challenge')) return { data: mockAgents, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('decisions')) return { data: mockDecisions, loading: false, error: null, refetch: vi.fn() };
      if (url.includes('challenge')) return { data: mockCrossChallenge, loading: false, error: null, refetch: vi.fn() };
      return { data: null, loading: false, error: null, refetch: vi.fn() };
    });
    renderComponent();
    expect(screen.getByText('System Health')).toBeInTheDocument();
    expect(screen.getByText('Agent Performance')).toBeInTheDocument();
  });
});
