import { useState, useMemo } from 'react';
import {
  MousePointerClick,
  ArrowDown,
  Eye,
  ShoppingCart,
  CreditCard,
  TrendingUp,
  AlertCircle,
  Lightbulb,
  Play,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import KPICard from '../components/shared/KPICard';
import ProgressBar from '../components/shared/ProgressBar';
import { useApiQuery, useApiMutation } from '../hooks/useApi';
import { ChartSkeleton, CardSkeleton, KPISkeleton } from '../components/shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../components/shared/ErrorBoundary';
import EmptyState from '../components/shared/EmptyState';

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

interface FunnelStep {
  label: string;
  visitors: number;
  pct: number;
}

interface DropOff {
  from: string;
  to: string;
  rate: number;
}

interface CountryFunnelRow {
  country: string;
  landing: number;
  productView: number;
  addToCart: number;
  checkout: number;
  purchase: number;
}

interface HeatmapInsight {
  area: string;
  insight: string;
  metric: string;
  type: string;
  color: string;
}

interface UxRecommendation {
  id: number;
  priority: 'High' | 'Medium' | 'Low';
  title: string;
  description: string;
  impact: string;
  effort: string;
  status: string;
}

interface PageSpeedMetric {
  metric: string;
  label: string;
  value: number;
  unit: string;
  target: number;
  status: 'good' | 'needs-improvement' | 'poor';
}

interface ABTestResult {
  id: number;
  name: string;
  status: 'running' | 'completed';
  variant: string;
  control: string;
  variantCvr: number;
  controlCvr: number;
  confidence: number;
  daysRunning: number;
  sampleSize: number;
}

interface ImprovementItem {
  initiative: string;
  impact: number;
  effort: number;
  priority: number;
  category: string;
}

interface ConversionTrendPoint {
  week: string;
  cvr: number;
  aov: number;
  cartAbandonment: number;
}

interface LighthouseScores {
  performance: number;
  accessibility: number;
  bestPractices: number;
}

interface DashboardOverviewResponse {
  kpis?: {
    conversionRate?: { value: number; change: number; trend: 'up' | 'down' | 'stable' };
    cartAbandonment?: { value: number; change: number; trend: 'up' | 'down' | 'stable' };
    avgOrderValue?: { value: number; change: number; trend: 'up' | 'down' | 'stable' };
    checkoutCompletion?: { value: number; change: number; trend: 'up' | 'down' | 'stable' };
  };
  funnel?: {
    steps: FunnelStep[];
    dropOffs: DropOff[];
  };
  countryFunnel?: CountryFunnelRow[];
  heatmapInsights?: HeatmapInsight[];
  pageSpeed?: {
    metrics: PageSpeedMetric[];
    lighthouse?: LighthouseScores;
  };
  abTests?: ABTestResult[];
  conversionTrend?: ConversionTrendPoint[];
  aiInsight?: string;
}

interface CampaignsResponse {
  campaigns?: Array<{
    id: string;
    country: string;
    conversions: number;
    roas: number;
    [key: string]: unknown;
  }>;
  improvementMatrix?: ImprovementItem[];
  aiSummary?: string;
}

interface AgentExecutionResponse {
  status: string;
  message: string;
  recommendations?: UxRecommendation[];
  improvementMatrix?: ImprovementItem[];
  aiSummary?: string;
}

/* -------------------------------------------------------------------------- */
/*                          ICON MAP & CONSTANTS                              */
/* -------------------------------------------------------------------------- */

const funnelIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'Landing Page': Eye,
  'Product View': MousePointerClick,
  'Add to Cart': ShoppingCart,
  'Checkout Start': CreditCard,
  Purchase: TrendingUp,
};

const funnelGradientEnd: Record<number, string> = {
  0: '#818cf8',
  1: '#7c6cf1',
  2: '#8b5cf6',
  3: '#a855f7',
  4: '#7c3aed',
};

const priorityColor: Record<string, string> = {
  High: 'bg-red-100 text-red-700',
  Medium: 'bg-yellow-100 text-yellow-700',
  Low: 'bg-blue-100 text-blue-700',
};

const statusColor: Record<string, string> = {
  'In Progress': 'bg-indigo-100 text-indigo-700',
  Planned: 'bg-surface-100 text-surface-700',
  Backlog: 'bg-surface-50 text-surface-500',
};

const speedStatusColor: Record<string, string> = {
  good: 'text-green-600',
  'needs-improvement': 'text-yellow-600',
  poor: 'text-red-600',
};

const speedStatusBg: Record<string, string> = {
  good: 'bg-green-100',
  'needs-improvement': 'bg-yellow-100',
  poor: 'bg-red-100',
};

const speedStatusLabel: Record<string, string> = {
  good: 'Good',
  'needs-improvement': 'Needs Work',
  poor: 'Poor',
};

/* -------------------------------------------------------------------------- */
/*                                COMPONENT                                   */
/* -------------------------------------------------------------------------- */

export default function Conversion() {
  const [selectedCountry, setSelectedCountry] = useState<string>('all');

  // ---- Live API calls ----

  const {
    data: overviewData,
    loading: overviewLoading,
    error: overviewError,
    refetch: refetchOverview,
  } = useApiQuery<DashboardOverviewResponse>('/v1/dashboard/overview');

  const {
    data: campaignsData,
    loading: campaignsLoading,
    error: campaignsError,
    refetch: refetchCampaigns,
  } = useApiQuery<CampaignsResponse>('/v1/campaigns');

  const {
    mutate: runConversionAgent,
    loading: agentRunning,
    error: agentError,
  } = useApiMutation<AgentExecutionResponse>('/v1/agents/conversion/run', { method: 'POST' });

  // ---- Agent execution handler ----

  const [agentResult, setAgentResult] = useState<AgentExecutionResponse | null>(null);

  const handleRunAgent = async () => {
    try {
      const result = await runConversionAgent({ action: 'optimize' });
      setAgentResult(result);
      refetchOverview();
      refetchCampaigns();
    } catch {
      // Error is captured in agentError state
    }
  };

  // ---- Derive data from API responses ----

  const kpis = overviewData?.kpis;
  const funnelSteps = overviewData?.funnel?.steps ?? [];
  const dropOffs = overviewData?.funnel?.dropOffs ?? [];
  const countryFunnelData = overviewData?.countryFunnel ?? [];
  const heatmapInsights = overviewData?.heatmapInsights ?? [];
  const pageSpeedMetrics = overviewData?.pageSpeed?.metrics ?? [];
  const lighthouse = overviewData?.pageSpeed?.lighthouse;
  const abTestResults = overviewData?.abTests ?? [];
  const conversionTrendData = overviewData?.conversionTrend ?? [];
  const aiInsight = overviewData?.aiInsight;

  const uxRecommendations: UxRecommendation[] = agentResult?.recommendations ?? [];
  const improvementMatrix: ImprovementItem[] =
    agentResult?.improvementMatrix ?? campaignsData?.improvementMatrix ?? [];
  const aiSummary =
    agentResult?.aiSummary ?? campaignsData?.aiSummary ?? '';

  // ---- Filter country funnel data ----

  const filteredCountryFunnel = useMemo(() => {
    if (selectedCountry === 'all') return countryFunnelData;
    return countryFunnelData.filter((row) => row.country === selectedCountry);
  }, [countryFunnelData, selectedCountry]);

  // ---- Derive unique countries for the dropdown ----

  const countryOptions = useMemo(() => {
    const codes = new Set(countryFunnelData.map((r) => r.country));
    return Array.from(codes);
  }, [countryFunnelData]);

  // ---- Compute A/B test summary counts ----

  const runningTests = abTestResults.filter((t) => t.status === 'running').length;
  const completedTests = abTestResults.filter((t) => t.status === 'completed').length;

  // ---- Loading gate ----

  const isLoading = overviewLoading || campaignsLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Conversion Optimization"
        subtitle="Funnel Analysis, UX Recommendations & Checkout Optimization"
        icon={<MousePointerClick className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-3">
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="text-sm border border-surface-200 rounded-lg px-3 py-1.5 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Countries</option>
              {countryOptions.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
            <button
              onClick={handleRunAgent}
              disabled={agentRunning}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors"
            >
              {agentRunning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {agentRunning ? 'Analyzing...' : 'Run Optimization'}
            </button>
            <button
              onClick={() => {
                refetchOverview();
                refetchCampaigns();
              }}
              className="inline-flex items-center gap-1 px-2 py-1.5 text-sm text-surface-600 hover:text-surface-800 border border-surface-200 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        }
      />

      {/* Agent error */}
      {agentError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          Agent error: {agentError.message}
        </div>
      )}

      {/* KPI Row */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <KPISkeleton key={i} />
          ))}
        </div>
      ) : overviewError ? (
        <ApiErrorDisplay error={overviewError} onRetry={refetchOverview} message="Failed to load KPIs" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Conversion Rate"
            value={kpis?.conversionRate?.value ?? '-'}
            change={kpis?.conversionRate?.change ?? 0}
            trend={kpis?.conversionRate?.trend ?? 'stable'}
            suffix="%"
          />
          <KPICard
            label="Cart Abandonment"
            value={kpis?.cartAbandonment?.value ?? '-'}
            change={kpis?.cartAbandonment?.change ?? 0}
            trend={kpis?.cartAbandonment?.trend ?? 'stable'}
            suffix="%"
          />
          <KPICard
            label="Avg Order Value"
            value={kpis?.avgOrderValue?.value ?? '-'}
            change={kpis?.avgOrderValue?.change ?? 0}
            trend={kpis?.avgOrderValue?.trend ?? 'stable'}
            prefix="$"
          />
          <KPICard
            label="Checkout Completion"
            value={kpis?.checkoutCompletion?.value ?? '-'}
            change={kpis?.checkoutCompletion?.change ?? 0}
            trend={kpis?.checkoutCompletion?.trend ?? 'stable'}
            suffix="%"
          />
        </div>
      )}

      {/* Conversion Funnel Visualization */}
      <Card
        title="Conversion Funnel"
        subtitle="Visitor journey from landing to purchase"
        actions={<TrendingUp className="w-4 h-4 text-surface-400" />}
      >
        {overviewLoading ? (
          <CardSkeleton lines={5} />
        ) : overviewError ? (
          <ApiErrorDisplay error={overviewError} onRetry={refetchOverview} />
        ) : funnelSteps.length === 0 ? (
          <EmptyState
            title="No funnel data"
            description="Funnel data will appear once campaigns start generating traffic."
          />
        ) : (
          <div className="space-y-1">
            {funnelSteps.map((step, index) => {
              const Icon = funnelIcons[step.label] ?? Eye;
              return (
                <div key={step.label}>
                  {/* Funnel bar */}
                  <div className="flex items-center gap-4">
                    <div className="w-32 sm:w-40 flex items-center gap-2 shrink-0">
                      <Icon className="w-4 h-4 text-surface-500" />
                      <span className="text-sm font-medium text-surface-700 truncate">{step.label}</span>
                    </div>
                    <div className="flex-1 flex items-center gap-3">
                      <div className="flex-1 relative">
                        <div
                          className="h-10 rounded-lg transition-all duration-500 flex items-center justify-end pr-3"
                          style={{
                            width: `${step.pct}%`,
                            background: `linear-gradient(90deg, #6366f1 0%, ${funnelGradientEnd[index] ?? '#7c3aed'} 100%)`,
                            minWidth: '80px',
                          }}
                        >
                          <span className="text-white text-sm font-semibold">{step.pct}%</span>
                        </div>
                      </div>
                      <span className="text-sm text-surface-500 w-20 text-right shrink-0">
                        {step.visitors.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Drop-off indicator between steps */}
                  {index < funnelSteps.length - 1 && dropOffs[index] && (
                    <div className="flex items-center gap-4 py-1">
                      <div className="w-32 sm:w-40 shrink-0" />
                      <div className="flex items-center gap-2 pl-2">
                        <ArrowDown className="w-3.5 h-3.5 text-red-400" />
                        <span className="text-xs font-medium text-red-500">
                          {dropOffs[index].rate}% drop-off
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Funnel by Country + Conversion Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel Performance by Country */}
        <Card
          title="Funnel Performance by Country"
          subtitle="Conversion rate at each stage (%)"
        >
          {overviewLoading ? (
            <ChartSkeleton height="h-72" />
          ) : overviewError ? (
            <ApiErrorDisplay error={overviewError} onRetry={refetchOverview} />
          ) : filteredCountryFunnel.length === 0 ? (
            <EmptyState
              title="No country data"
              description="Country funnel data is not available yet."
            />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredCountryFunnel} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="country" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" unit="%" />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                    }}
                    formatter={(value: number | undefined, name?: string) => [`${value ?? 0}%`, name ?? '']}
                  />
                  <Bar dataKey="productView" name="Product View" fill="#818cf8" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="addToCart" name="Add to Cart" fill="#6366f1" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="checkout" name="Checkout" fill="#4f46e5" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="purchase" name="Purchase" fill="#4338ca" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Conversion Trend */}
        <Card
          title="Conversion Trend"
          subtitle="Weekly CVR & AOV over last 6 weeks"
        >
          {overviewLoading ? (
            <ChartSkeleton height="h-72" />
          ) : overviewError ? (
            <ApiErrorDisplay error={overviewError} onRetry={refetchOverview} />
          ) : conversionTrendData.length === 0 ? (
            <EmptyState
              title="No trend data"
              description="Conversion trend data will populate over time."
            />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={conversionTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="week" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis yAxisId="cvr" tick={{ fontSize: 12 }} stroke="#9ca3af" unit="%" domain={[2.5, 4.5]} />
                  <YAxis yAxisId="aov" orientation="right" tick={{ fontSize: 12 }} stroke="#9ca3af" unit="$" />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                    }}
                  />
                  <Line
                    yAxisId="cvr"
                    type="monotone"
                    dataKey="cvr"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ fill: '#6366f1', r: 4 }}
                    name="CVR %"
                  />
                  <Line
                    yAxisId="aov"
                    type="monotone"
                    dataKey="aov"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ fill: '#22c55e', r: 4 }}
                    name="AOV $"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Heatmap Insights + Page Speed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Heatmap Insights */}
        <Card
          title="Heatmap Insights"
          subtitle="User behavior analysis from session recordings"
          actions={<Eye className="w-4 h-4 text-surface-400" />}
        >
          {overviewLoading ? (
            <CardSkeleton lines={4} />
          ) : overviewError ? (
            <ApiErrorDisplay error={overviewError} onRetry={refetchOverview} />
          ) : heatmapInsights.length === 0 ? (
            <EmptyState
              title="No heatmap data"
              description="Heatmap insights will appear after session data is collected."
            />
          ) : (
            <>
              <div className="space-y-4">
                {heatmapInsights.map((item) => (
                  <div
                    key={item.area}
                    className="flex items-center gap-4 p-3 rounded-lg bg-surface-50 border border-surface-100"
                  >
                    <div className={`w-12 h-12 rounded-lg ${item.color} bg-opacity-15 flex items-center justify-center shrink-0`}>
                      <span className="text-sm font-bold text-surface-800">{item.metric}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-surface-800">{item.insight}</p>
                      <p className="text-xs text-surface-500 mt-0.5">
                        {item.area} - {item.type} analysis
                      </p>
                    </div>
                    <div className="shrink-0">
                      <div
                        className={`w-3 h-3 rounded-full ${item.color}`}
                        title={`Heat intensity: ${item.type}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {aiInsight && (
                <div className="mt-4 p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                  <div className="flex items-start gap-2">
                    <Lightbulb className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-indigo-700">
                      <span className="font-semibold">AI Insight:</span> {aiInsight}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>

        {/* Page Speed Metrics */}
        <Card
          title="Page Speed Metrics"
          subtitle="Core Web Vitals - last 28 days"
          actions={<AlertCircle className="w-4 h-4 text-surface-400" />}
        >
          {overviewLoading ? (
            <CardSkeleton lines={4} />
          ) : overviewError ? (
            <ApiErrorDisplay error={overviewError} onRetry={refetchOverview} />
          ) : pageSpeedMetrics.length === 0 ? (
            <EmptyState
              title="No speed data"
              description="Page speed metrics are not available."
            />
          ) : (
            <>
              <div className="space-y-6">
                {pageSpeedMetrics.map((item) => (
                  <div key={item.metric}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-sm font-semibold text-surface-800">{item.metric}</span>
                        <span className="text-xs text-surface-500 ml-2">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-bold ${speedStatusColor[item.status] ?? 'text-surface-600'}`}>
                          {item.value}{item.unit}
                        </span>
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${speedStatusBg[item.status] ?? 'bg-surface-100'} ${speedStatusColor[item.status] ?? 'text-surface-600'}`}
                        >
                          {speedStatusLabel[item.status] ?? item.status}
                        </span>
                      </div>
                    </div>
                    <ProgressBar
                      value={item.value}
                      max={item.target * 1.5}
                      color={item.status === 'good' ? 'success' : item.status === 'needs-improvement' ? 'warning' : 'danger'}
                      size="sm"
                    />
                    <p className="text-xs text-surface-400 mt-1">Target: {item.target}{item.unit}</p>
                  </div>
                ))}
              </div>

              {lighthouse && (
                <div className="mt-6 pt-4 border-t border-surface-100">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-lg font-bold text-surface-900">{lighthouse.performance}</p>
                      <p className="text-xs text-surface-500">Performance</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-surface-900">{lighthouse.accessibility}</p>
                      <p className="text-xs text-surface-500">Accessibility</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-surface-900">{lighthouse.bestPractices}</p>
                      <p className="text-xs text-surface-500">Best Practices</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {/* UX Recommendations */}
      <Card
        title="UX Recommendations"
        subtitle="AI-prioritized improvements for conversion optimization"
        actions={
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-surface-400" />
            {agentRunning && <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />}
          </div>
        }
      >
        {agentRunning ? (
          <CardSkeleton lines={4} />
        ) : uxRecommendations.length === 0 ? (
          <EmptyState
            title="No recommendations yet"
            description="Click 'Run Optimization' to generate AI-powered UX recommendations."
            action={
              <button
                onClick={handleRunAgent}
                disabled={agentRunning}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors"
              >
                <Play className="w-4 h-4" />
                Run Optimization
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {uxRecommendations.map((rec) => (
              <div
                key={rec.id}
                className="flex items-start gap-4 p-4 rounded-lg border border-surface-100 hover:border-surface-200 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-surface-100 text-surface-600 font-bold text-sm shrink-0">
                  {rec.id}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityColor[rec.priority] ?? 'bg-surface-100 text-surface-600'}`}>
                      {rec.priority}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[rec.status] ?? 'bg-surface-50 text-surface-500'}`}>
                      {rec.status}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-surface-800 mt-1">{rec.description}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-xs text-surface-500">
                      Impact: <span className="font-semibold text-green-600">{rec.impact}</span>
                    </span>
                    <span className="text-xs text-surface-500">
                      Effort: <span className="font-semibold text-surface-700">{rec.effort}</span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Checkout Optimization + A/B Test Results */}
      <Card
        title="Checkout Optimization - A/B Test Results"
        subtitle="Active and completed experiments"
        actions={
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">
              {runningTests} Running
            </span>
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-100 text-surface-600 font-medium">
              {completedTests} Completed
            </span>
          </div>
        }
      >
        {overviewLoading ? (
          <CardSkeleton lines={5} />
        ) : overviewError ? (
          <ApiErrorDisplay error={overviewError} onRetry={refetchOverview} />
        ) : abTestResults.length === 0 ? (
          <EmptyState
            title="No A/B tests"
            description="No checkout A/B tests are currently running."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="text-left py-3 px-2 font-semibold text-surface-600">Test Name</th>
                  <th className="text-left py-3 px-2 font-semibold text-surface-600">Status</th>
                  <th className="text-left py-3 px-2 font-semibold text-surface-600">Control</th>
                  <th className="text-left py-3 px-2 font-semibold text-surface-600">Variant</th>
                  <th className="text-right py-3 px-2 font-semibold text-surface-600">Confidence</th>
                  <th className="text-right py-3 px-2 font-semibold text-surface-600">Lift</th>
                  <th className="text-right py-3 px-2 font-semibold text-surface-600">Samples</th>
                </tr>
              </thead>
              <tbody>
                {abTestResults.map((test) => {
                  const lift = test.controlCvr > 0
                    ? (((test.variantCvr - test.controlCvr) / test.controlCvr) * 100).toFixed(1)
                    : '0.0';
                  return (
                    <tr key={test.id} className="border-b border-surface-50 hover:bg-surface-50/50">
                      <td className="py-3 px-2">
                        <span className="font-medium text-surface-800">{test.name}</span>
                        <span className="block text-xs text-surface-500">{test.daysRunning} days running</span>
                      </td>
                      <td className="py-3 px-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            test.status === 'running'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-surface-100 text-surface-600'
                          }`}
                        >
                          {test.status === 'running' ? 'Running' : 'Completed'}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <span className="text-surface-700">{test.control}</span>
                        <span className="block text-xs text-surface-500">{test.controlCvr}% CVR</span>
                      </td>
                      <td className="py-3 px-2">
                        <span className="text-surface-700">{test.variant}</span>
                        <span className="block text-xs font-medium text-green-600">{test.variantCvr}% CVR</span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <span
                          className={`font-semibold ${
                            test.confidence >= 95 ? 'text-green-600' : test.confidence >= 85 ? 'text-yellow-600' : 'text-surface-600'
                          }`}
                        >
                          {test.confidence}%
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <span className="font-semibold text-green-600">+{lift}%</span>
                      </td>
                      <td className="py-3 px-2 text-right text-surface-600">
                        {test.sampleSize.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* AI Improvement Priority Matrix */}
      <Card
        title="AI-Generated Improvement Priority Matrix"
        subtitle="Impact vs effort analysis - higher impact and lower effort initiatives are prioritized"
        actions={<TrendingUp className="w-4 h-4 text-surface-400" />}
      >
        {campaignsLoading || agentRunning ? (
          <ChartSkeleton height="h-72" />
        ) : campaignsError ? (
          <ApiErrorDisplay error={campaignsError} onRetry={refetchCampaigns} />
        ) : improvementMatrix.length === 0 ? (
          <EmptyState
            title="No improvement data"
            description="Run the Conversion Optimization agent to generate the priority matrix."
            action={
              <button
                onClick={handleRunAgent}
                disabled={agentRunning}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors"
              >
                <Play className="w-4 h-4" />
                Run Optimization
              </button>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Chart */}
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={improvementMatrix}
                    layout="vertical"
                    margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 12 }} stroke="#9ca3af" domain={[0, 100]} />
                    <YAxis
                      type="category"
                      dataKey="initiative"
                      tick={{ fontSize: 11 }}
                      stroke="#9ca3af"
                      width={140}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                      }}
                      formatter={(value: number | undefined, name?: string) => [`${value ?? 0}/100`, name ?? '']}
                    />
                    <Bar dataKey="impact" name="Impact" fill="#6366f1" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="effort" name="Effort" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Priority List */}
              <div className="space-y-3">
                <div className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-2">
                  Ranked by AI Priority Score
                </div>
                {improvementMatrix.map((item) => {
                  const score = Math.round((item.impact * 0.7 + (100 - item.effort) * 0.3));
                  return (
                    <div
                      key={item.initiative}
                      className="flex items-center gap-3 p-3 rounded-lg bg-surface-50 border border-surface-100"
                    >
                      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs shrink-0">
                        {item.priority}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-surface-800 truncate">{item.initiative}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-surface-500">
                            Impact: <span className="font-semibold text-indigo-600">{item.impact}</span>
                          </span>
                          <span className="text-xs text-surface-500">
                            Effort: <span className="font-semibold text-amber-600">{item.effort}</span>
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-bold text-surface-900">{score}</span>
                        <p className="text-xs text-surface-400">Score</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AI Summary */}
            {aiSummary && (
              <div className="mt-6 p-4 rounded-lg bg-indigo-50 border border-indigo-100">
                <div className="flex items-start gap-3">
                  <Lightbulb className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-indigo-800 mb-1">AI Recommendation Summary</p>
                    <p className="text-sm text-indigo-700">{aiSummary}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
