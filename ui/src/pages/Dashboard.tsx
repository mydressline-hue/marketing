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

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const revenueData = [
  { month: 'Sep', revenue: 1620000, spend: 410000 },
  { month: 'Oct', revenue: 1780000, spend: 430000 },
  { month: 'Nov', revenue: 1950000, spend: 460000 },
  { month: 'Dec', revenue: 2100000, spend: 480000 },
  { month: 'Jan', revenue: 2280000, spend: 500000 },
  { month: 'Feb', revenue: 2400000, spend: 520000 },
];

const channelPerformance = [
  { channel: 'Google', spend: 185000, revenue: 820000 },
  { channel: 'Meta', spend: 142000, revenue: 610000 },
  { channel: 'TikTok', spend: 98000, revenue: 480000 },
  { channel: 'Bing', spend: 56000, revenue: 290000 },
  { channel: 'Snap', spend: 39000, revenue: 200000 },
];

const agents = [
  { name: 'Market Scanner', status: 'active' as const },
  { name: 'Budget Optimizer', status: 'active' as const },
  { name: 'Creative Engine', status: 'active' as const },
  { name: 'Bid Manager', status: 'active' as const },
  { name: 'Audience Builder', status: 'active' as const },
  { name: 'Translation Agent', status: 'active' as const },
  { name: 'Compliance Checker', status: 'active' as const },
  { name: 'ROAS Analyzer', status: 'active' as const },
  { name: 'Trend Detector', status: 'active' as const },
  { name: 'A/B Test Runner', status: 'active' as const },
  { name: 'Feed Optimizer', status: 'idle' as const },
  { name: 'Keyword Harvester', status: 'active' as const },
  { name: 'Attribution Modeler', status: 'active' as const },
  { name: 'Anomaly Detector', status: 'active' as const },
  { name: 'Report Generator', status: 'idle' as const },
  { name: 'Channel Allocator', status: 'active' as const },
  { name: 'Geo Expander', status: 'idle' as const },
  { name: 'Creative Scorer', status: 'active' as const },
  { name: 'Pacing Controller', status: 'error' as const },
  { name: 'Forecast Engine', status: 'active' as const },
];

const topCountries = [
  { country: 'United States', flag: '\u{1F1FA}\u{1F1F8}', revenue: 820000, pct: 100 },
  { country: 'United Kingdom', flag: '\u{1F1EC}\u{1F1E7}', revenue: 410000, pct: 50 },
  { country: 'Germany', flag: '\u{1F1E9}\u{1F1EA}', revenue: 340000, pct: 41 },
  { country: 'Canada', flag: '\u{1F1E8}\u{1F1E6}', revenue: 265000, pct: 32 },
  { country: 'Australia', flag: '\u{1F1E6}\u{1F1FA}', revenue: 198000, pct: 24 },
  { country: 'France', flag: '\u{1F1EB}\u{1F1F7}', revenue: 167000, pct: 20 },
];

const alerts = [
  {
    id: 1,
    severity: 'critical' as const,
    message: 'Pacing Controller agent is unresponsive \u2014 TikTok DE campaign spend may exceed daily cap.',
    time: '2 min ago',
  },
  {
    id: 2,
    severity: 'warning' as const,
    message: 'Google Ads ROAS in FR dropped below 3.0x threshold. Budget reallocation recommended.',
    time: '18 min ago',
  },
  {
    id: 3,
    severity: 'info' as const,
    message: 'New market opportunity detected: Netherlands shows 22% lower CPA than forecast.',
    time: '1 hr ago',
  },
];

const systemConfidenceMetrics = [
  { label: 'Data Pipeline', score: 97 },
  { label: 'Model Accuracy', score: 91 },
  { label: 'Budget Pacing', score: 84 },
  { label: 'Creative Quality', score: 78 },
];

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
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              All systems operational
            </span>
          </div>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Total Revenue"
          value="2.4M"
          change={12.5}
          trend="up"
          prefix="$"
        />
        <KPICard
          label="Active Campaigns"
          value={147}
          change={8.2}
          trend="up"
        />
        <KPICard
          label="Global ROAS"
          value="4.2x"
          change={15.3}
          trend="up"
        />
        <KPICard
          label="Active Countries"
          value={12}
          change={2}
          trend="up"
          suffix=" markets"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Trends */}
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
                  formatter={(value: number) => formatCurrency(value)}
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

        {/* Channel Performance */}
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
                  formatter={(value: number) => formatCurrency(value)}
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
      </div>

      {/* Agent Status + Top Countries Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent Status Grid */}
        <Card
          title="Agent Status"
          subtitle="20 AI agents"
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

        {/* Top Countries */}
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
      </div>

      {/* Alerts + System Confidence Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Alerts */}
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

        {/* System Confidence */}
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
            <ConfidenceScore score={88} size="md" />
          </div>
        </Card>
      </div>
    </div>
  );
}
