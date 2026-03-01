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
  Play,
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
import { useApiQuery, useApiMutation } from '../hooks/useApi';
import { TableSkeleton, ChartSkeleton, CardSkeleton } from '../components/shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../components/shared/ErrorBoundary';
import EmptyState from '../components/shared/EmptyState';

// ---------------------------------------------------------------------------
// API response types
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

interface MonitoringResponse {
  kpis: {
    pipelinesActive: number;
    pipelinesActiveChange: number;
    dataThroughput: string;
    dataThroughputChange: number;
    errorRate: string;
    errorRateChange: number;
    uptime: string;
    uptimeChange: number;
  };
  pipelines: Pipeline[];
  throughputData: Array<{ hour: string; events: number }>;
  errorRateData: Array<{ day: string; errorRate: number }>;
  serverTrackingEndpoints: Array<{
    name: string;
    status: 'operational' | 'degraded' | 'down';
    latency: string;
    uptime: string;
  }>;
  eventValidations: Array<{
    name: string;
    status: 'valid' | 'warning';
    message?: string;
  }>;
}

interface DataQualityMetric {
  label: string;
  value: string;
  numericValue: number;
  color: 'success' | 'warning' | 'danger' | 'primary';
  description: string;
}

interface DataQualityResponse {
  metrics: DataQualityMetric[];
  errorLog: Array<{
    id: string;
    timestamp: string;
    pipeline: string;
    severity: 'error' | 'warning' | 'critical';
    message: string;
    details: string;
  }>;
}

interface AgentExecuteResponse {
  success: boolean;
  message: string;
}

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

  // API queries
  const {
    data: monitoringData,
    loading: monitoringLoading,
    error: monitoringError,
    refetch: refetchMonitoring,
  } = useApiQuery<MonitoringResponse>('/v1/infrastructure/monitoring');

  const {
    data: qualityData,
    loading: qualityLoading,
    error: qualityError,
    refetch: refetchQuality,
  } = useApiQuery<DataQualityResponse>('/v1/infrastructure/data-quality');

  // Agent execution mutation
  const {
    mutate: runAgent,
    loading: agentRunning,
  } = useApiMutation<AgentExecuteResponse>('/v1/agents/data-engineering/run', { method: 'POST' });

  const handleRunAgent = async () => {
    const result = await runAgent();
    if (result?.success) {
      refetchMonitoring();
      refetchQuality();
    }
  };

  const handleRefresh = () => {
    refetchMonitoring();
    refetchQuality();
  };

  // Derived data
  const kpis = monitoringData?.kpis;
  const pipelines = monitoringData?.pipelines ?? [];
  const throughputData = monitoringData?.throughputData ?? [];
  const errorRateData = monitoringData?.errorRateData ?? [];
  const serverTrackingEndpoints = monitoringData?.serverTrackingEndpoints ?? [];
  const eventValidations = monitoringData?.eventValidations ?? [];
  const dataQualityMetrics = qualityData?.metrics ?? [];
  const errorLog = qualityData?.errorLog ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Data Engineering"
        subtitle="Event Tracking, Pipeline Monitoring & Data Quality"
        icon={<Database className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={handleRunAgent}
              disabled={agentRunning}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              {agentRunning ? 'Running...' : 'Run Agent'}
            </button>
            <button
              onClick={handleRefresh}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-surface-600 bg-surface-100 hover:bg-surface-200 transition-colors"
            >
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
      {monitoringError ? (
        <ApiErrorDisplay error={monitoringError} onRetry={refetchMonitoring} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {monitoringLoading ? (
            <>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-surface-200 p-5">
                  <CardSkeleton lines={2} />
                </div>
              ))}
            </>
          ) : (
            <>
              <KPICard
                label="Pipelines Active"
                value={kpis?.pipelinesActive ?? 0}
                change={kpis?.pipelinesActiveChange ?? 0}
                trend="up"
              />
              <KPICard
                label="Data Throughput"
                value={kpis?.dataThroughput ?? '0/hr'}
                change={kpis?.dataThroughputChange ?? 0}
                trend="up"
              />
              <KPICard
                label="Error Rate"
                value={kpis?.errorRate ?? '0%'}
                change={kpis?.errorRateChange ?? 0}
                trend="down"
              />
              <KPICard
                label="Uptime"
                value={kpis?.uptime ?? '0%'}
                change={kpis?.uptimeChange ?? 0}
                trend="up"
              />
            </>
          )}
        </div>
      )}

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
        {monitoringLoading ? (
          <TableSkeleton rows={6} columns={8} />
        ) : monitoringError ? (
          <ApiErrorDisplay error={monitoringError} onRetry={refetchMonitoring} />
        ) : pipelines.length === 0 ? (
          <EmptyState title="No pipelines" description="No pipeline data is available." />
        ) : (
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
        )}
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Data Throughput Chart */}
        <Card
          title="Data Throughput"
          subtitle="Events processed per hour (last 24 hours)"
          actions={<Activity className="w-4 h-4 text-surface-400" />}
        >
          {monitoringLoading ? (
            <ChartSkeleton height="h-72" />
          ) : monitoringError ? (
            <ApiErrorDisplay error={monitoringError} onRetry={refetchMonitoring} />
          ) : throughputData.length === 0 ? (
            <EmptyState title="No throughput data" description="Throughput metrics are not available." />
          ) : (
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
                    formatter={(value: number | undefined) => [formatEvents(value ?? 0), 'Events']}
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
          )}
        </Card>

        {/* Error Rate Trend Chart */}
        <Card
          title="Error Rate Trend"
          subtitle="Daily error rate percentage (last 7 days)"
          actions={<AlertTriangle className="w-4 h-4 text-surface-400" />}
        >
          {monitoringLoading ? (
            <ChartSkeleton height="h-72" />
          ) : monitoringError ? (
            <ApiErrorDisplay error={monitoringError} onRetry={refetchMonitoring} />
          ) : errorRateData.length === 0 ? (
            <EmptyState title="No error data" description="Error rate data is not available." />
          ) : (
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
                    formatter={(value: number | undefined) => [`${(value ?? 0).toFixed(3)}%`, 'Error Rate']}
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
          )}
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
          {monitoringLoading ? (
            <CardSkeleton lines={4} />
          ) : monitoringError ? (
            <ApiErrorDisplay error={monitoringError} onRetry={refetchMonitoring} />
          ) : eventValidations.length === 0 ? (
            <EmptyState title="No validations" description="Event validation data is not available." />
          ) : (
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
          )}
        </Card>

        {/* Server-Side Tracking Status */}
        <Card
          title="Server-Side Tracking Status"
          subtitle="Endpoint health and latency monitoring"
          actions={<Server className="w-4 h-4 text-surface-400" />}
        >
          {monitoringLoading ? (
            <CardSkeleton lines={5} />
          ) : monitoringError ? (
            <ApiErrorDisplay error={monitoringError} onRetry={refetchMonitoring} />
          ) : serverTrackingEndpoints.length === 0 ? (
            <EmptyState title="No endpoints" description="Server tracking endpoint data is not available." />
          ) : (
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
          )}
        </Card>
      </div>

      {/* Data Quality Dashboard */}
      <Card
        title="Data Quality Dashboard"
        subtitle="Automated quality checks across all pipelines"
        actions={<Zap className="w-4 h-4 text-surface-400" />}
      >
        {qualityLoading ? (
          <CardSkeleton lines={4} />
        ) : qualityError ? (
          <ApiErrorDisplay error={qualityError} onRetry={refetchQuality} />
        ) : dataQualityMetrics.length === 0 ? (
          <EmptyState title="No quality data" description="Data quality metrics are not available." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {dataQualityMetrics.map((metric) => (
              <div key={metric.label} className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-surface-700">{metric.label}</span>
                  <span className="text-sm font-bold text-surface-900">{metric.value}</span>
                </div>
                <ProgressBar
                  value={
                    metric.label === 'Freshness'
                      ? metric.numericValue
                      : metric.label === 'Schema Validation'
                        ? metric.numericValue
                        : 100 - metric.numericValue
                  }
                  max={100}
                  color={metric.color}
                  size="md"
                />
                <p className="text-xs text-surface-500">{metric.description}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Error Log */}
      <Card
        title="Error Log"
        subtitle="Recent pipeline errors"
        actions={
          !qualityLoading && errorLog.length > 0 ? (
            <span className="flex items-center gap-1 text-xs text-red-600 font-medium bg-red-50 px-2 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" />
              {errorLog.filter((e) => e.severity === 'critical').length} critical
            </span>
          ) : undefined
        }
      >
        {qualityLoading ? (
          <CardSkeleton lines={6} />
        ) : qualityError ? (
          <ApiErrorDisplay error={qualityError} onRetry={refetchQuality} />
        ) : errorLog.length === 0 ? (
          <EmptyState
            icon={<CheckCircle className="w-6 h-6 text-success-500" />}
            title="No errors"
            description="All pipelines are running without errors."
          />
        ) : (
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
        )}
      </Card>
    </div>
  );
}
