import { useState } from 'react';
import {
  Database,
  Activity,
  CheckCircle,
  AlertTriangle,
  Server,
  Zap,
  Clock,
  RefreshCw,
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
} from 'recharts';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import KPICard from '../components/shared/KPICard';
import StatusBadge from '../components/shared/StatusBadge';
import ProgressBar from '../components/shared/ProgressBar';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface Pipeline {
  id: string;
  name: string;
  source: string;
  destination: string;
  status: 'healthy' | 'degraded' | 'down';
  throughput: string;
  errors: number;
  lastRun: string;
}

const pipelines: Pipeline[] = [
  {
    id: 'pl-001',
    name: 'Google Ads Sync',
    source: 'Google Ads API',
    destination: 'BigQuery',
    status: 'healthy',
    throughput: '342K/hr',
    errors: 0,
    lastRun: '2 min ago',
  },
  {
    id: 'pl-002',
    name: 'Meta Events',
    source: 'Meta CAPI',
    destination: 'Snowflake',
    status: 'healthy',
    throughput: '518K/hr',
    errors: 2,
    lastRun: '1 min ago',
  },
  {
    id: 'pl-003',
    name: 'TikTok Events',
    source: 'TikTok Events API',
    destination: 'BigQuery',
    status: 'degraded',
    throughput: '189K/hr',
    errors: 14,
    lastRun: '5 min ago',
  },
  {
    id: 'pl-004',
    name: 'Shopify Orders',
    source: 'Shopify Webhooks',
    destination: 'PostgreSQL',
    status: 'healthy',
    throughput: '85K/hr',
    errors: 0,
    lastRun: '30 sec ago',
  },
  {
    id: 'pl-005',
    name: 'Analytics ETL',
    source: 'GA4 + Mixpanel',
    destination: 'Data Warehouse',
    status: 'healthy',
    throughput: '720K/hr',
    errors: 1,
    lastRun: '3 min ago',
  },
  {
    id: 'pl-006',
    name: 'Conversion Tracking',
    source: 'Multi-platform',
    destination: 'Attribution DB',
    status: 'healthy',
    throughput: '256K/hr',
    errors: 0,
    lastRun: '1 min ago',
  },
  {
    id: 'pl-007',
    name: 'Audience Sync',
    source: 'CDP',
    destination: 'Ad Platforms',
    status: 'down',
    throughput: '0/hr',
    errors: 47,
    lastRun: '22 min ago',
  },
  {
    id: 'pl-008',
    name: 'Revenue Aggregation',
    source: 'Multiple Sources',
    destination: 'Finance DB',
    status: 'healthy',
    throughput: '128K/hr',
    errors: 0,
    lastRun: '4 min ago',
  },
];

const throughputData = [
  { hour: '00:00', events: 1820000 },
  { hour: '01:00', events: 1540000 },
  { hour: '02:00', events: 1280000 },
  { hour: '03:00', events: 980000 },
  { hour: '04:00', events: 870000 },
  { hour: '05:00', events: 920000 },
  { hour: '06:00', events: 1150000 },
  { hour: '07:00', events: 1480000 },
  { hour: '08:00', events: 1920000 },
  { hour: '09:00', events: 2310000 },
  { hour: '10:00', events: 2580000 },
  { hour: '11:00', events: 2720000 },
  { hour: '12:00', events: 2650000 },
  { hour: '13:00', events: 2810000 },
  { hour: '14:00', events: 2900000 },
  { hour: '15:00', events: 2780000 },
  { hour: '16:00', events: 2620000 },
  { hour: '17:00', events: 2450000 },
  { hour: '18:00', events: 2380000 },
  { hour: '19:00', events: 2520000 },
  { hour: '20:00', events: 2410000 },
  { hour: '21:00', events: 2280000 },
  { hour: '22:00', events: 2050000 },
  { hour: '23:00', events: 1890000 },
];

const errorRateData = [
  { day: 'Mon', errorRate: 0.018 },
  { day: 'Tue', errorRate: 0.022 },
  { day: 'Wed', errorRate: 0.015 },
  { day: 'Thu', errorRate: 0.031 },
  { day: 'Fri', errorRate: 0.024 },
  { day: 'Sat', errorRate: 0.012 },
  { day: 'Sun', errorRate: 0.020 },
];

interface EventValidation {
  name: string;
  status: 'valid' | 'warning';
  message?: string;
}

const eventValidations: EventValidation[] = [
  { name: 'Page View', status: 'valid' },
  { name: 'Add to Cart', status: 'valid' },
  { name: 'Purchase', status: 'warning', message: '3% discrepancy with Shopify' },
  { name: 'Custom Events', status: 'valid' },
];

interface ServerTrackingEndpoint {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  latency: string;
  uptime: string;
}

const serverTrackingEndpoints: ServerTrackingEndpoint[] = [
  { name: 'GTM Server Container', status: 'operational', latency: '12ms', uptime: '99.99%' },
  { name: 'Meta CAPI Endpoint', status: 'operational', latency: '45ms', uptime: '99.95%' },
  { name: 'TikTok Events API', status: 'degraded', latency: '320ms', uptime: '98.70%' },
  { name: 'Google Ads Server Tag', status: 'operational', latency: '18ms', uptime: '99.98%' },
  { name: 'Conversion API Gateway', status: 'operational', latency: '25ms', uptime: '99.97%' },
];

interface DataQualityMetric {
  label: string;
  value: string;
  numericValue: number;
  color: 'success' | 'warning' | 'danger' | 'primary';
}

const dataQualityMetrics: DataQualityMetric[] = [
  { label: 'Schema Validation', value: '99.8%', numericValue: 99.8, color: 'success' },
  { label: 'Duplicate Detection', value: '0.1%', numericValue: 0.1, color: 'success' },
  { label: 'Null Rate', value: '0.3%', numericValue: 0.3, color: 'success' },
  { label: 'Freshness', value: '< 5 min', numericValue: 95, color: 'primary' },
];

interface ErrorLogEntry {
  id: string;
  timestamp: string;
  pipeline: string;
  severity: 'error' | 'warning' | 'critical';
  message: string;
  details: string;
}

const errorLog: ErrorLogEntry[] = [
  {
    id: 'err-001',
    timestamp: '2026-02-25 14:32:18',
    pipeline: 'Audience Sync',
    severity: 'critical',
    message: 'Connection timeout to CDP API',
    details: 'Failed after 3 retry attempts. Connection refused on port 443. CDN provider reported degraded performance in eu-west-1.',
  },
  {
    id: 'err-002',
    timestamp: '2026-02-25 14:28:05',
    pipeline: 'TikTok Events',
    severity: 'error',
    message: 'Rate limit exceeded on TikTok Events API',
    details: 'HTTP 429 received. Current rate: 1,200 req/s. Limit: 1,000 req/s. Auto-throttle engaged, backoff applied.',
  },
  {
    id: 'err-003',
    timestamp: '2026-02-25 14:15:42',
    pipeline: 'Audience Sync',
    severity: 'error',
    message: 'Schema validation failed for audience segment payload',
    details: 'Field "user_ltv" expected type float, received string in 23 records. Records quarantined for review.',
  },
  {
    id: 'err-004',
    timestamp: '2026-02-25 13:58:11',
    pipeline: 'Meta Events',
    severity: 'warning',
    message: 'Partial event delivery - 2 events dropped',
    details: 'Events dropped due to missing required field "event_id". Source: checkout flow v2.3. Auto-generated IDs applied to future events.',
  },
  {
    id: 'err-005',
    timestamp: '2026-02-25 13:42:30',
    pipeline: 'Analytics ETL',
    severity: 'warning',
    message: 'Stale data detected in GA4 export',
    details: 'Data freshness exceeded 10-minute threshold. Last successful pull: 13:31:00. GA4 API latency spike detected, resolved automatically.',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatEvents = (val: number) => {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
  return val.toString();
};

const severityStyles: Record<string, string> = {
  critical: 'border-l-red-500 bg-red-50',
  error: 'border-l-orange-500 bg-orange-50',
  warning: 'border-l-yellow-500 bg-yellow-50',
};

const severityTextColor: Record<string, string> = {
  critical: 'text-red-700',
  error: 'text-orange-700',
  warning: 'text-yellow-700',
};

const serverStatusDot = (status: string) => {
  const color =
    status === 'operational'
      ? 'bg-green-500'
      : status === 'degraded'
        ? 'bg-yellow-400'
        : 'bg-red-500';
  return (
    <span className="relative flex h-2.5 w-2.5">
      {status === 'operational' && (
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-75`} />
      )}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${color}`} />
    </span>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DataEngineering() {
  const [expandedError, setExpandedError] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Data Engineering"
        subtitle="Event Tracking, Pipeline Monitoring & Data Quality"
        icon={<Database className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-3">
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-surface-600 bg-surface-100 hover:bg-surface-200 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <span className="flex items-center gap-1.5 text-sm text-surface-500">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              Live
            </span>
          </div>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Pipelines Active"
          value={18}
          change={5.9}
          trend="up"
        />
        <KPICard
          label="Data Throughput"
          value="2.4M/hr"
          change={12.3}
          trend="up"
        />
        <KPICard
          label="Error Rate"
          value="0.02%"
          change={0.8}
          trend="down"
        />
        <KPICard
          label="Uptime"
          value="99.97%"
          change={0.02}
          trend="up"
        />
      </div>

      {/* Pipeline Status Table */}
      <Card
        title="Pipeline Status"
        subtitle="Real-time pipeline health monitoring"
        actions={
          <div className="flex items-center gap-2 text-xs text-surface-500">
            <Clock className="w-3.5 h-3.5" />
            Updated just now
          </div>
        }
      >
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-100">
                <th className="text-left font-medium text-surface-500 px-5 py-3">Pipeline Name</th>
                <th className="text-left font-medium text-surface-500 px-3 py-3">Source</th>
                <th className="text-left font-medium text-surface-500 px-3 py-3">Destination</th>
                <th className="text-left font-medium text-surface-500 px-3 py-3">Status</th>
                <th className="text-right font-medium text-surface-500 px-3 py-3">Throughput</th>
                <th className="text-right font-medium text-surface-500 px-3 py-3">Errors</th>
                <th className="text-left font-medium text-surface-500 px-3 py-3">Last Run</th>
                <th className="text-right font-medium text-surface-500 px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {pipelines.map((pipeline) => (
                <tr key={pipeline.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-surface-400" />
                      <span className="font-medium text-surface-900">{pipeline.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-surface-600">{pipeline.source}</td>
                  <td className="px-3 py-3 text-surface-600">{pipeline.destination}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={pipeline.status} />
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-surface-700">{pipeline.throughput}</td>
                  <td className="px-3 py-3 text-right">
                    <span
                      className={`font-mono ${
                        pipeline.errors > 10
                          ? 'text-red-600 font-semibold'
                          : pipeline.errors > 0
                            ? 'text-yellow-600'
                            : 'text-surface-500'
                      }`}
                    >
                      {pipeline.errors}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-surface-500">{pipeline.lastRun}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="p-1.5 rounded-md hover:bg-surface-100 text-surface-400 hover:text-surface-600 transition-colors"
                        title="Restart pipeline"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className="p-1.5 rounded-md hover:bg-surface-100 text-surface-400 hover:text-surface-600 transition-colors"
                        title="View details"
                      >
                        <Activity className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Data Throughput Chart */}
        <Card
          title="Data Throughput"
          subtitle="Events processed per hour (last 24 hours)"
          actions={<Activity className="w-4 h-4 text-surface-400" />}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={throughputData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="throughputGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 11 }}
                  stroke="#9ca3af"
                  interval={3}
                />
                <YAxis
                  tickFormatter={formatEvents}
                  tick={{ fontSize: 11 }}
                  stroke="#9ca3af"
                />
                <Tooltip
                  formatter={(value: number) => [formatEvents(value), 'Events']}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="events"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#throughputGrad)"
                  name="Events Processed"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Error Rate Trend Chart */}
        <Card
          title="Error Rate Trend"
          subtitle="Daily error rate percentage (last 7 days)"
          actions={<AlertTriangle className="w-4 h-4 text-surface-400" />}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={errorRateData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis
                  tickFormatter={(val: number) => `${val}%`}
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                  domain={[0, 0.04]}
                />
                <Tooltip
                  formatter={(value: number) => [`${value.toFixed(3)}%`, 'Error Rate']}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                  }}
                />
                <Bar
                  dataKey="errorRate"
                  fill="#f59e0b"
                  radius={[4, 4, 0, 0]}
                  name="Error Rate"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Event Tracking Validation + Server-Side Tracking */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Event Tracking Validation */}
        <Card
          title="Event Tracking Validation"
          subtitle="Real-time event schema and delivery checks"
          actions={<CheckCircle className="w-4 h-4 text-green-500" />}
        >
          <div className="space-y-3">
            {eventValidations.map((evt) => (
              <div
                key={evt.name}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                  evt.status === 'warning'
                    ? 'border-yellow-200 bg-yellow-50/50'
                    : 'border-surface-200 bg-surface-50/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  {evt.status === 'valid' ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  )}
                  <div>
                    <p className="font-medium text-surface-900">{evt.name}</p>
                    {evt.message && (
                      <p className="text-xs text-yellow-600 mt-0.5">{evt.message}</p>
                    )}
                  </div>
                </div>
                <StatusBadge status={evt.status === 'valid' ? 'healthy' : 'warning'} />
              </div>
            ))}
          </div>
        </Card>

        {/* Server-Side Tracking Status */}
        <Card
          title="Server-Side Tracking Status"
          subtitle="Endpoint health and latency monitoring"
          actions={<Server className="w-4 h-4 text-surface-400" />}
        >
          <div className="space-y-3">
            {serverTrackingEndpoints.map((endpoint) => (
              <div
                key={endpoint.name}
                className="flex items-center justify-between rounded-lg border border-surface-200 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  {serverStatusDot(endpoint.status)}
                  <div>
                    <p className="font-medium text-surface-900 text-sm">{endpoint.name}</p>
                    <p className="text-xs text-surface-500 mt-0.5">
                      Latency: {endpoint.latency} | Uptime: {endpoint.uptime}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                    endpoint.status === 'operational'
                      ? 'bg-green-50 text-green-700'
                      : endpoint.status === 'degraded'
                        ? 'bg-yellow-50 text-yellow-700'
                        : 'bg-red-50 text-red-700'
                  }`}
                >
                  {endpoint.status}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Data Quality Dashboard */}
      <Card
        title="Data Quality Dashboard"
        subtitle="Automated quality checks across all pipelines"
        actions={<Zap className="w-4 h-4 text-surface-400" />}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {dataQualityMetrics.map((metric) => (
            <div key={metric.label} className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-surface-700">{metric.label}</span>
                <span className="text-sm font-bold text-surface-900">{metric.value}</span>
              </div>
              <ProgressBar
                value={metric.label === 'Freshness' ? metric.numericValue : metric.label === 'Schema Validation' ? metric.numericValue : 100 - metric.numericValue}
                max={100}
                color={metric.color}
                size="md"
              />
              <p className="text-xs text-surface-500">
                {metric.label === 'Schema Validation' && 'Events matching expected schema'}
                {metric.label === 'Duplicate Detection' && 'Duplicate records identified & deduplicated'}
                {metric.label === 'Null Rate' && 'Null values in required fields'}
                {metric.label === 'Freshness' && 'Time since last data update'}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {/* Error Log */}
      <Card
        title="Error Log"
        subtitle="Last 5 pipeline errors"
        actions={
          <span className="flex items-center gap-1 text-xs text-red-600 font-medium bg-red-50 px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3" />
            {errorLog.filter((e) => e.severity === 'critical').length} critical
          </span>
        }
      >
        <div className="space-y-3">
          {errorLog.map((entry) => (
            <div
              key={entry.id}
              className={`rounded-lg border-l-4 p-4 cursor-pointer transition-all ${severityStyles[entry.severity]} hover:shadow-sm`}
              onClick={() =>
                setExpandedError(expandedError === entry.id ? null : entry.id)
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <AlertTriangle
                    className={`w-4 h-4 mt-0.5 shrink-0 ${severityTextColor[entry.severity]}`}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-surface-900 text-sm">
                        {entry.message}
                      </span>
                      <StatusBadge status={entry.severity} size="sm" />
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-surface-500">
                      <span className="flex items-center gap-1">
                        <Database className="w-3 h-3" />
                        {entry.pipeline}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {entry.timestamp}
                      </span>
                    </div>
                    {expandedError === entry.id && (
                      <div className="mt-3 p-3 bg-white/60 rounded-md border border-surface-200 text-xs text-surface-700 leading-relaxed">
                        {entry.details}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  className="shrink-0 p-1.5 rounded-md hover:bg-white/50 text-surface-400 hover:text-surface-600 transition-colors"
                  title="Retry"
                  onClick={(e) => e.stopPropagation()}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
