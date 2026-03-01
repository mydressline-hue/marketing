import { useEffect, useCallback, useState } from 'react';
import {
  Globe,
  TrendingUp,
  DollarSign,
  Users,
  Activity,
  BarChart3,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import KPICard from '../components/shared/KPICard';
import Card from '../components/shared/Card';
import StatusBadge from '../components/shared/StatusBadge';
import ConfidenceScore from '../components/shared/ConfidenceScore';
import PageHeader from '../components/shared/PageHeader';
import { useApiQuery } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { KPISkeleton, ChartSkeleton, CardSkeleton } from '../components/shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../components/shared/ErrorBoundary';

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

interface DashboardOverview {
  kpis: {
    totalRevenue: { value: string; change: number; trend: 'up' | 'down' | 'stable'; prefix?: string };
    activeCampaigns: { value: number; change: number; trend: 'up' | 'down' | 'stable' };
    globalROAS: { value: string; change: number; trend: 'up' | 'down' | 'stable' };
    activeCountries: { value: number; change: number; trend: 'up' | 'down' | 'stable'; suffix?: string };
  };
  revenueChart: Array<{ month: string; revenue: number; spend: number }>;
  topCountries: Array<{ country: string; flag: string; revenue: number; pct: number }>;
  systemConfidence: Array<{ label: string; score: number }>;
  overallConfidence: number;
}

interface SpendSummary {
  channels: Array<{ channel: string; spend: number; revenue: number }>;
}

interface AgentStatusItem {
  name: string;
  status: 'active' | 'idle' | 'error' | 'warning' | 'paused';
}

interface AlertItem {
  id: number | string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  time: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL = 30_000; // 30 seconds
const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#3b82f6', '#ec4899'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (val: number) =>
  val >= 1_000_000
    ? `$${(val / 1_000_000).toFixed(1)}M`
    : `$${(val / 1_000).toFixed(0)}K`;

const statusDot = (status: string) => {
  const color =
    status === 'active'
      ? 'bg-green-500'
      : status === 'idle'
        ? 'bg-yellow-400'
        : 'bg-red-500';
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
};

const severityStyles: Record<string, string> = {
  critical: 'border-l-red-500 bg-red-50',
  warning: 'border-l-yellow-500 bg-yellow-50',
  info: 'border-l-blue-500 bg-blue-50',
};

const severityIcon: Record<string, string> = {
  critical: 'text-red-600',
  warning: 'text-yellow-600',
  info: 'text-blue-600',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Dashboard() {
  // ---- API data fetching with 30-second polling ----
  const {
    data: overview,
    loading: overviewLoading,
    error: overviewError,
    refetch: refetchOverview,
  } = useApiQuery<DashboardOverview>('/v1/dashboard/overview', { refetchInterval: POLL_INTERVAL });

  const {
    data: spendSummary,
    loading: spendLoading,
    error: spendError,
    refetch: refetchSpend,
  } = useApiQuery<SpendSummary>('/v1/campaigns/spend/summary', { refetchInterval: POLL_INTERVAL });

  const {
    data: agentsData,
    loading: agentsLoading,
    error: agentsError,
    refetch: refetchAgents,
  } = useApiQuery<AgentStatusItem[]>('/v1/agents', { refetchInterval: POLL_INTERVAL });

  const {
    data: alertsData,
    loading: alertsLoading,
    error: alertsError,
    refetch: refetchAlerts,
  } = useApiQuery<AlertItem[]>('/v1/alerts?limit=5', { refetchInterval: POLL_INTERVAL });

  // ---- WebSocket for real-time updates ----
  const { connected, subscribe } = useWebSocket();

  // Local state for real-time patches
  const [realtimeAgents, setRealtimeAgents] = useState<AgentStatusItem[] | null>(null);
  const [realtimeAlerts, setRealtimeAlerts] = useState<AlertItem[] | null>(null);

  useEffect(() => {
    const unsubAgents = subscribe('agent_status', (msg) => {
      const update = msg.data as AgentStatusItem[];
      if (Array.isArray(update)) {
        setRealtimeAgents(update);
      }
    });

    const unsubAlerts = subscribe('alert', (msg) => {
      const newAlert = msg.data as AlertItem;
      setRealtimeAlerts((prev) => {
        const current = prev ?? alertsData ?? [];
        return [newAlert, ...current].slice(0, 5);
      });
    });

    return () => {
      unsubAgents();
      unsubAlerts();
    };
  }, [subscribe, alertsData]);

  // Merge real-time data with polled data
  const agents: AgentStatusItem[] = realtimeAgents ?? agentsData ?? [];
  const alerts: AlertItem[] = realtimeAlerts ?? alertsData ?? [];
  const revenueData = overview?.revenueChart ?? [];
  const channelPerformance = spendSummary?.channels ?? [];
  const topCountries = overview?.topCountries ?? [];
  const systemConfidenceMetrics = overview?.systemConfidence ?? [];
  const overallConfidence = overview?.overallConfidence ?? 0;

  // Derive connection status label
  const systemStatus = connected ? 'All systems operational' : 'Connecting...';
  const systemStatusColor = connected ? 'bg-green-500' : 'bg-yellow-400';
  const systemPingColor = connected ? 'bg-green-400' : 'bg-yellow-300';

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Command Center"
        subtitle="AI International Growth Engine - Real-time Overview"
        icon={<Globe className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-surface-500">
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${systemPingColor} opacity-75`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${systemStatusColor}`} />
              </span>
              {systemStatus}
            </span>
          </div>
        }
      />

      {/* KPI Row */}
      {overviewError ? (
        <ApiErrorDisplay error={overviewError} onRetry={refetchOverview} compact />
      ) : overviewLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <KPISkeleton key={i} />
          ))}
        </div>
      ) : overview ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Total Revenue"
            value={overview.kpis.totalRevenue.value}
            change={overview.kpis.totalRevenue.change}
            trend={overview.kpis.totalRevenue.trend}
            prefix={overview.kpis.totalRevenue.prefix ?? '$'}
          />
          <KPICard
            label="Active Campaigns"
            value={overview.kpis.activeCampaigns.value}
            change={overview.kpis.activeCampaigns.change}
            trend={overview.kpis.activeCampaigns.trend}
          />
          <KPICard
            label="Global ROAS"
            value={overview.kpis.globalROAS.value}
            change={overview.kpis.globalROAS.change}
            trend={overview.kpis.globalROAS.trend}
          />
          <KPICard
            label="Active Countries"
            value={overview.kpis.activeCountries.value}
            change={overview.kpis.activeCountries.change}
            trend={overview.kpis.activeCountries.trend}
            suffix={overview.kpis.activeCountries.suffix ?? ' markets'}
          />
        </div>
      ) : null}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Trends */}
        {overviewError ? (
          <Card
            title="Revenue Trends"
            subtitle="Last 6 months"
            actions={<TrendingUp className="w-4 h-4 text-surface-400" />}
          >
            <ApiErrorDisplay error={overviewError} onRetry={refetchOverview} />
          </Card>
        ) : overviewLoading ? (
          <ChartSkeleton />
        ) : (
          <Card
            title="Revenue Trends"
            subtitle="Last 6 months"
            actions={<TrendingUp className="w-4 h-4 text-surface-400" />}
          >
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <Tooltip
                    formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fill="url(#revGrad)"
                    name="Revenue"
                  />
                  <Area
                    type="monotone"
                    dataKey="spend"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fill="url(#spendGrad)"
                    name="Spend"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* Channel Performance */}
        {spendError ? (
          <Card
            title="Channel Performance"
            subtitle="Spend vs Revenue by channel"
            actions={<BarChart3 className="w-4 h-4 text-surface-400" />}
          >
            <ApiErrorDisplay error={spendError} onRetry={refetchSpend} />
          </Card>
        ) : spendLoading ? (
          <ChartSkeleton />
        ) : (
          <Card
            title="Channel Performance"
            subtitle="Spend vs Revenue by channel"
            actions={<BarChart3 className="w-4 h-4 text-surface-400" />}
          >
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={channelPerformance} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="channel" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <Tooltip
                    formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                    }}
                  />
                  <Bar dataKey="spend" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Spend" />
                  <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
      </div>

      {/* Agent Status + Top Countries Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent Status Grid */}
        {agentsError ? (
          <Card
            title="Agent Status"
            subtitle="AI agents"
            className="lg:col-span-2"
          >
            <ApiErrorDisplay error={agentsError} onRetry={refetchAgents} />
          </Card>
        ) : agentsLoading ? (
          <div className="lg:col-span-2">
            <CardSkeleton lines={6} />
          </div>
        ) : (
          <Card
            title="Agent Status"
            subtitle={`${agents.length} AI agents`}
            className="lg:col-span-2"
            actions={
              <div className="flex items-center gap-3 text-xs text-surface-500">
                <span className="flex items-center gap-1">{statusDot('active')} Active</span>
                <span className="flex items-center gap-1">{statusDot('idle')} Idle</span>
                <span className="flex items-center gap-1">{statusDot('error')} Error</span>
              </div>
            }
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {agents.map((agent) => (
                <div
                  key={agent.name}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    agent.status === 'error'
                      ? 'border-red-200 bg-red-50'
                      : agent.status === 'idle'
                        ? 'border-yellow-200 bg-yellow-50/50'
                        : 'border-surface-200 bg-surface-50/50'
                  }`}
                >
                  {statusDot(agent.status)}
                  <span className="truncate font-medium text-surface-700">{agent.name}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Top Countries */}
        {overviewError ? (
          <Card
            title="Top Countries by Revenue"
            subtitle="Current month"
            actions={<Globe className="w-4 h-4 text-surface-400" />}
          >
            <ApiErrorDisplay error={overviewError} onRetry={refetchOverview} />
          </Card>
        ) : overviewLoading ? (
          <CardSkeleton lines={6} />
        ) : (
          <Card
            title="Top Countries by Revenue"
            subtitle="Current month"
            actions={<Globe className="w-4 h-4 text-surface-400" />}
          >
            <div className="space-y-4">
              {topCountries.map((c) => (
                <div key={c.country}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-surface-700">
                      {c.flag} {c.country}
                    </span>
                    <span className="text-sm font-semibold text-surface-900">
                      {formatCurrency(c.revenue)}
                    </span>
                  </div>
                  <div className="w-full bg-surface-100 rounded-full h-2">
                    <div
                      className="bg-indigo-500 h-2 rounded-full transition-all"
                      style={{ width: `${c.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Alerts + System Confidence Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Alerts */}
        {alertsError ? (
          <Card
            title="Recent Alerts"
            subtitle="Requires attention"
            className="lg:col-span-2"
          >
            <ApiErrorDisplay error={alertsError} onRetry={refetchAlerts} />
          </Card>
        ) : alertsLoading ? (
          <div className="lg:col-span-2">
            <CardSkeleton lines={3} />
          </div>
        ) : (
          <Card
            title="Recent Alerts"
            subtitle="Requires attention"
            className="lg:col-span-2"
            actions={
              <span className="flex items-center gap-1 text-xs text-red-600 font-medium bg-red-50 px-2 py-0.5 rounded-full">
                <AlertTriangle className="w-3 h-3" />
                {alerts.filter((a) => a.severity === 'critical').length} critical
              </span>
            }
          >
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`flex items-start gap-3 rounded-lg border-l-4 p-3 ${severityStyles[alert.severity]}`}
                >
                  <AlertTriangle
                    className={`w-4 h-4 mt-0.5 shrink-0 ${severityIcon[alert.severity]}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-surface-800">{alert.message}</p>
                    <p className="text-xs text-surface-500 mt-1">{alert.time}</p>
                  </div>
                  <StatusBadge status={alert.severity} size="sm" />
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* System Confidence */}
        {overviewError ? (
          <Card
            title="System Confidence"
            subtitle="AI engine health"
            actions={<Zap className="w-4 h-4 text-surface-400" />}
          >
            <ApiErrorDisplay error={overviewError} onRetry={refetchOverview} />
          </Card>
        ) : overviewLoading ? (
          <CardSkeleton lines={5} />
        ) : (
          <Card
            title="System Confidence"
            subtitle="AI engine health"
            actions={<Zap className="w-4 h-4 text-surface-400" />}
          >
            <div className="space-y-5">
              {systemConfidenceMetrics.map((metric) => (
                <div key={metric.label} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-surface-700">{metric.label}</span>
                  <ConfidenceScore score={metric.score} size="sm" />
                </div>
              ))}
            </div>

            {/* Overall score */}
            <div className="mt-6 pt-5 border-t border-surface-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-surface-900">Overall Confidence</p>
                <p className="text-xs text-surface-500 mt-0.5">Weighted average across all metrics</p>
              </div>
              <ConfidenceScore score={overallConfidence} size="md" />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
