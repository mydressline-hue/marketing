import { useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  Target,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  BarChart2,
  Activity,
  Play,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  ComposedChart,
} from 'recharts';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import KPICard from '../components/shared/KPICard';
import ConfidenceScore from '../components/shared/ConfidenceScore';
import { useApiQuery, useApiMutation } from '../hooks/useApi';
import { ChartSkeleton, CardSkeleton, KPIRowSkeleton, TableSkeleton } from '../components/shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../components/shared/ErrorBoundary';
import EmptyState from '../components/shared/EmptyState';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RevenueProjectionPoint {
  month: string;
  conservative: number;
  projected: number;
  aggressive: number;
  type: 'historical' | 'forecast';
}

interface BreakEvenPoint {
  day: number;
  cumulativeRevenue: number;
  cumulativeCost: number;
}

interface LtvCacPoint {
  month: string;
  ltv: number;
  cac: number;
  ratio: number;
}

interface CountryRevenue {
  country: string;
  revenue: number;
  projected: number;
}

interface Scenario {
  id: string;
  label: string;
  description: string;
  revenue: string;
  growth: string;
  confidence: number;
  color: string;
  bg: string;
  border: string;
}

interface RiskFactor {
  rank: number;
  risk: string;
  impact: string;
  probability: string;
}

interface ForecastData {
  kpis: {
    projectedRevenue: string;
    projectedRevenueChange: number;
    ltvCacRatio: string;
    ltvCacChange: number;
    breakEvenDay: string;
    breakEvenChange: number;
    growthRate: string;
    growthRateChange: number;
  };
  revenueProjectionData: RevenueProjectionPoint[];
  breakEvenData: BreakEvenPoint[];
  ltvCacTrendData: LtvCacPoint[];
  ltvMetrics: {
    currentLtv: string;
    ltvTarget: string;
    ltvProgress: number;
    currentCac: string;
    cacTarget: string;
    cacProgress: number;
    paybackPeriod: string;
    paybackChange: string;
    ltvCacRatio: string;
    ltvCacPrevious: string;
  };
  countryRevenueData: CountryRevenue[];
  scenarios: Scenario[];
  riskFactors: RiskFactor[];
}

interface ProjectionCard {
  period: string;
  revenue: string;
  change: string;
  up: boolean;
  newMarkets: number;
  campaigns: number;
  roas: string;
}

interface ProjectionsData {
  projections: ProjectionCard[];
}

interface ForecastAgentResult {
  status: string;
  message: string;
  predictions: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (val: number) =>
  val >= 1_000_000
    ? `$${(val / 1_000_000).toFixed(1)}M`
    : val >= 1_000
      ? `$${(val / 1_000).toFixed(0)}K`
      : `$${val.toFixed(0)}`;

const impactColor = (impact: string) => {
  if (impact === 'High') return 'text-red-600 bg-red-50 dark:bg-red-500/10';
  if (impact === 'Medium') return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-500/10';
  return 'text-green-600 bg-green-50 dark:bg-green-500/10';
};

// ---------------------------------------------------------------------------
// Custom tooltip for the revenue projection chart
// ---------------------------------------------------------------------------

interface TooltipEntry {
  color: string;
  name: string;
  value: number;
  payload?: RevenueProjectionPoint;
}

interface ProjectionTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}

const ProjectionTooltip = ({ active, payload, label }: ProjectionTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-surface-900 dark:text-surface-100 mb-1">{label}</p>
      {payload.map((entry: TooltipEntry, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-surface-600 dark:text-surface-300">{entry.name}:</span>
          <span className="font-medium text-surface-900 dark:text-surface-100">{formatCurrency(entry.value)}</span>
        </div>
      ))}
      {payload[0]?.payload?.type === 'forecast' && (
        <p className="text-xs text-surface-400 mt-1 italic">Forecast period</p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RevenueForecast() {
  const [activeScenario, setActiveScenario] = useState('base');

  // ---- API queries ---------------------------------------------------------
  const forecast = useApiQuery<ForecastData>('/v1/advanced-ai/simulation/forecast');
  const projections = useApiQuery<ProjectionsData>('/v1/advanced-ai/commander/projections');

  // ---- Mutations -----------------------------------------------------------
  const forecastAgent = useApiMutation<ForecastAgentResult>('/v1/agents/revenue-forecast/run', { method: 'POST' });

  // ---- Derived data --------------------------------------------------------
  const data = forecast.data;
  const projectionCards = projections.data?.projections ?? [];

  const handleRunForecast = async () => {
    await forecastAgent.mutate({});
    forecast.refetch();
    projections.refetch();
  };

  // Determine break-even day for annotation
  const breakEvenPoint = data?.breakEvenData?.find(
    (d) => d.cumulativeRevenue >= d.cumulativeCost && d.day > 0,
  );
  const breakEvenDay = breakEvenPoint?.day ?? 0;
  const breakEvenRevenue = breakEvenPoint
    ? formatCurrency(breakEvenPoint.cumulativeRevenue)
    : '--';

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Revenue Forecasting"
        subtitle="Predictive Modeling, LTV/CAC Analysis & Scenario Simulations"
        icon={<TrendingUp className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-surface-500 dark:text-surface-400">
              <Calendar className="w-4 h-4" />
              Last updated: Today
            </span>
            <button
              onClick={handleRunForecast}
              disabled={forecastAgent.loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 ${forecastAgent.loading ? 'animate-pulse' : ''}`} />
              {forecastAgent.loading ? 'Running Forecast...' : 'Run Forecast'}
            </button>
          </div>
        }
      />

      {/* KPI Row */}
      {forecast.loading ? (
        <KPIRowSkeleton count={4} />
      ) : forecast.error ? (
        <ApiErrorDisplay error={forecast.error} onRetry={forecast.refetch} />
      ) : data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Projected Revenue"
            value={data.kpis.projectedRevenue}
            change={data.kpis.projectedRevenueChange}
            trend="up"
            prefix="$"
          />
          <KPICard
            label="LTV/CAC Ratio"
            value={data.kpis.ltvCacRatio}
            change={data.kpis.ltvCacChange}
            trend="up"
          />
          <KPICard
            label="Break-Even"
            value={data.kpis.breakEvenDay}
            change={data.kpis.breakEvenChange}
            trend="up"
          />
          <KPICard
            label="Growth Rate"
            value={data.kpis.growthRate}
            change={data.kpis.growthRateChange}
            trend="up"
          />
        </div>
      ) : null}

      {/* Revenue Projection Chart */}
      {forecast.loading ? (
        <ChartSkeleton height="h-80" />
      ) : forecast.error ? (
        <ApiErrorDisplay error={forecast.error} onRetry={forecast.refetch} />
      ) : data && data.revenueProjectionData.length > 0 ? (
        <Card
          title="Revenue Projection"
          subtitle="12-month outlook: historical (solid) vs forecast (dashed)"
          actions={<BarChart2 className="w-4 h-4 text-surface-400" />}
        >
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.revenueProjectionData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="conservativeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.08} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="projectedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="aggressiveGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.08} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <Tooltip content={<ProjectionTooltip />} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="conservative"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  strokeDasharray={((_d: unknown, index: number) => (index >= 6 ? '6 4' : '0')) as unknown as string}
                  fill="url(#conservativeGrad)"
                  name="Conservative"
                  dot={(props: { cx?: number; cy?: number; index?: number }) => {
                    const { cx, cy, index } = props;
                    if (index === 5) {
                      return (
                        <circle
                          key={`cons-dot-${index}`}
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill="#3b82f6"
                          stroke="#fff"
                          strokeWidth={2}
                        />
                      );
                    }
                    return <circle key={`cons-dot-${index}`} cx={cx} cy={cy} r={0} fill="none" />;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="projected"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  fill="url(#projectedGrad)"
                  name="Projected"
                  dot={(props: { cx?: number; cy?: number; index?: number }) => {
                    const { cx, cy, index } = props;
                    if (index === 5) {
                      return (
                        <circle
                          key={`proj-dot-${index}`}
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill="#6366f1"
                          stroke="#fff"
                          strokeWidth={2}
                        />
                      );
                    }
                    return <circle key={`proj-dot-${index}`} cx={cx} cy={cy} r={0} fill="none" />;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="aggressive"
                  stroke="#a855f7"
                  strokeWidth={2}
                  fill="url(#aggressiveGrad)"
                  name="Aggressive"
                  dot={(props: { cx?: number; cy?: number; index?: number }) => {
                    const { cx, cy, index } = props;
                    if (index === 5) {
                      return (
                        <circle
                          key={`agg-dot-${index}`}
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill="#a855f7"
                          stroke="#fff"
                          strokeWidth={2}
                        />
                      );
                    }
                    return <circle key={`agg-dot-${index}`} cx={cx} cy={cy} r={0} fill="none" />;
                  }}
                />
                {/* Forecast region indicator */}
                {data.revenueProjectionData.map((_entry, index) => {
                  if (index === 6) {
                    return (
                      <text
                        key="forecast-label"
                        x="65%"
                        y="8%"
                        fill="#9ca3af"
                        fontSize={11}
                        textAnchor="middle"
                      >
                        Forecast Period
                      </text>
                    );
                  }
                  return null;
                })}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-6 mt-3 pt-3 border-t border-surface-100 dark:border-surface-700 text-xs text-surface-500 dark:text-surface-400">
            <span className="flex items-center gap-1.5">
              <span className="w-6 h-0.5 bg-surface-400 inline-block" /> Historical
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-6 h-0.5 bg-surface-400 inline-block border-dashed border-t border-surface-400" style={{ borderStyle: 'dashed' }} /> Forecast
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" /> Transition point
            </span>
          </div>
        </Card>
      ) : data ? (
        <EmptyState title="No projection data" description="Revenue projection data is not yet available." />
      ) : null}

      {/* LTV/CAC + Break-Even Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LTV/CAC Modeling */}
        {forecast.loading ? (
          <ChartSkeleton />
        ) : forecast.error ? (
          <ApiErrorDisplay error={forecast.error} onRetry={forecast.refetch} />
        ) : data ? (
          <Card
            title="LTV/CAC Modeling"
            subtitle="Unit economics & payback analysis"
            actions={<DollarSign className="w-4 h-4 text-surface-400" />}
          >
            {/* Key metrics */}
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div className="bg-surface-50 dark:bg-surface-800 rounded-lg p-3">
                <p className="text-xs text-surface-500 dark:text-surface-400 mb-0.5">Current LTV</p>
                <p className="text-xl font-bold text-surface-900 dark:text-surface-100">{data.ltvMetrics.currentLtv}</p>
                <p className="text-xs text-surface-400">Target: {data.ltvMetrics.ltvTarget}</p>
                <div className="w-full bg-surface-200 rounded-full h-1.5 mt-2">
                  <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${data.ltvMetrics.ltvProgress}%` }} />
                </div>
              </div>
              <div className="bg-surface-50 dark:bg-surface-800 rounded-lg p-3">
                <p className="text-xs text-surface-500 dark:text-surface-400 mb-0.5">Current CAC</p>
                <p className="text-xl font-bold text-surface-900 dark:text-surface-100">{data.ltvMetrics.currentCac}</p>
                <p className="text-xs text-surface-400">Target: {data.ltvMetrics.cacTarget}</p>
                <div className="w-full bg-surface-200 rounded-full h-1.5 mt-2">
                  <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${data.ltvMetrics.cacProgress}%` }} />
                </div>
              </div>
              <div className="bg-surface-50 dark:bg-surface-800 rounded-lg p-3">
                <p className="text-xs text-surface-500 dark:text-surface-400 mb-0.5">Payback Period</p>
                <p className="text-xl font-bold text-surface-900 dark:text-surface-100">{data.ltvMetrics.paybackPeriod}</p>
                <p className="text-xs text-green-600 flex items-center gap-0.5">
                  <ArrowDownRight className="w-3 h-3" /> {data.ltvMetrics.paybackChange}
                </p>
              </div>
              <div className="bg-surface-50 dark:bg-surface-800 rounded-lg p-3">
                <p className="text-xs text-surface-500 dark:text-surface-400 mb-0.5">LTV:CAC Ratio</p>
                <p className="text-xl font-bold text-surface-900 dark:text-surface-100">{data.ltvMetrics.ltvCacRatio}</p>
                <p className="text-xs text-green-600 flex items-center gap-0.5">
                  <ArrowUpRight className="w-3 h-3" /> Up from {data.ltvMetrics.ltvCacPrevious}
                </p>
              </div>
            </div>

            {/* Monthly improvement trend */}
            {data.ltvCacTrendData.length > 0 ? (
              <>
                <p className="text-xs font-medium text-surface-500 dark:text-surface-400 mb-2">Monthly Improvement Trend</p>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.ltvCacTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                      <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v) => `$${v}`} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v) => `${v}x`} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid #e5e7eb',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                        }}
                      />
                      <Bar yAxisId="left" dataKey="ltv" fill="#6366f1" radius={[3, 3, 0, 0]} name="LTV" barSize={20} />
                      <Bar yAxisId="left" dataKey="cac" fill="#f59e0b" radius={[3, 3, 0, 0]} name="CAC" barSize={20} />
                      <Line yAxisId="right" type="monotone" dataKey="ratio" stroke="#22c55e" strokeWidth={2} dot={{ r: 3, fill: '#22c55e' }} name="Ratio" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : (
              <EmptyState title="No trend data" description="LTV/CAC trend data is not yet available." />
            )}
          </Card>
        ) : null}

        {/* Break-Even Analysis */}
        {forecast.loading ? (
          <ChartSkeleton />
        ) : forecast.error ? (
          <ApiErrorDisplay error={forecast.error} onRetry={forecast.refetch} />
        ) : data ? (
          <Card
            title="Break-Even Analysis"
            subtitle="Cumulative revenue vs cumulative cost over time"
            actions={<Target className="w-4 h-4 text-surface-400" />}
          >
            {data.breakEvenData.length === 0 ? (
              <EmptyState title="No break-even data" description="Break-even analysis data is not yet available." />
            ) : (
              <>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.breakEvenData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 12 }}
                        stroke="#9ca3af"
                        tickFormatter={(v) => `Day ${v}`}
                      />
                      <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 12 }} stroke="#9ca3af" />
                      <Tooltip
                        formatter={(value: number | undefined, name?: string) => [
                          formatCurrency(value ?? 0),
                          name === 'cumulativeRevenue' ? 'Cumulative Revenue' : 'Cumulative Cost',
                        ]}
                        labelFormatter={(label) => `Day ${label}`}
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid #e5e7eb',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                        }}
                      />
                      <Legend
                        formatter={(value) =>
                          value === 'cumulativeRevenue' ? 'Cumulative Revenue' : 'Cumulative Cost'
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="cumulativeRevenue"
                        stroke="#6366f1"
                        strokeWidth={2.5}
                        dot={false}
                        name="cumulativeRevenue"
                      />
                      <Line
                        type="monotone"
                        dataKey="cumulativeCost"
                        stroke="#ef4444"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        dot={false}
                        name="cumulativeCost"
                      />
                      {/* Break-even indicator annotation (via reference dot) */}
                      <Line
                        type="monotone"
                        dataKey="cumulativeRevenue"
                        stroke="none"
                        dot={(props: { cx?: number; cy?: number; payload?: BreakEvenPoint }) => {
                          const { cx, cy, payload } = props;
                          if (payload?.day === breakEvenDay) {
                            return (
                              <g key="breakeven">
                                <circle cx={cx} cy={cy} r={6} fill="#22c55e" stroke="#fff" strokeWidth={2} />
                                <text x={(cx ?? 0) + 10} y={(cy ?? 0) - 10} fill="#22c55e" fontSize={11} fontWeight={600}>
                                  Break-even
                                </text>
                              </g>
                            );
                          }
                          return <circle key={`be-${payload?.day}`} cx={cx} cy={cy} r={0} fill="none" />;
                        }}
                        legendType="none"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-surface-100 dark:border-surface-700">
                  <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
                  <span className="text-sm text-surface-600 dark:text-surface-300">
                    Break-even reached at <span className="font-semibold text-surface-900 dark:text-surface-100">Day {breakEvenDay}</span> with
                    cumulative revenue of <span className="font-semibold text-surface-900 dark:text-surface-100">{breakEvenRevenue}</span>
                  </span>
                </div>
              </>
            )}
          </Card>
        ) : null}
      </div>

      {/* Scenario Simulation Panel */}
      {forecast.loading ? (
        <ChartSkeleton />
      ) : forecast.error ? (
        <ApiErrorDisplay error={forecast.error} onRetry={forecast.refetch} />
      ) : data && data.scenarios.length > 0 ? (
        <Card
          title="Scenario Simulation"
          subtitle="Compare growth trajectories and associated confidence levels"
          actions={<Activity className="w-4 h-4 text-surface-400" />}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.scenarios.map((scenario) => (
              <button
                key={scenario.id}
                onClick={() => setActiveScenario(scenario.id)}
                className={`text-left rounded-xl border-2 p-5 transition-all ${
                  activeScenario === scenario.id
                    ? `${scenario.border} ${scenario.bg} shadow-md`
                    : 'border-surface-200 bg-white dark:bg-surface-800 hover:border-surface-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className={`font-semibold ${activeScenario === scenario.id ? scenario.color : 'text-surface-900 dark:text-surface-100'}`}>
                    {scenario.label}
                  </h4>
                  <ConfidenceScore score={scenario.confidence} size="sm" />
                </div>
                <p className="text-2xl font-bold text-surface-900 dark:text-surface-100 mb-1">{scenario.revenue}</p>
                <p className="text-sm text-surface-500 dark:text-surface-400 mb-3">{scenario.description}</p>
                <div className="flex items-center gap-1 text-sm font-medium">
                  {scenario.growth.startsWith('+') ? (
                    <ArrowUpRight className="w-4 h-4 text-green-600" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4 text-red-600" />
                  )}
                  <span className={scenario.growth.startsWith('+') ? 'text-green-600' : 'text-red-600'}>
                    {scenario.growth} growth
                  </span>
                </div>
                {activeScenario === scenario.id && (
                  <div className="mt-3 pt-3 border-t border-surface-200 dark:border-surface-700">
                    <div className="flex items-center gap-1.5 text-xs text-surface-500 dark:text-surface-400">
                      <Target className="w-3 h-3" />
                      Currently selected scenario
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Country Revenue Projection + 30/60/90 Day Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Country Revenue Projection BarChart */}
        {forecast.loading ? (
          <div className="lg:col-span-2">
            <ChartSkeleton />
          </div>
        ) : forecast.error ? (
          <div className="lg:col-span-2">
            <ApiErrorDisplay error={forecast.error} onRetry={forecast.refetch} />
          </div>
        ) : data && data.countryRevenueData.length > 0 ? (
          <Card
            title="Country Revenue Projections"
            subtitle="Top markets - Current vs Projected"
            className="lg:col-span-2"
            actions={<BarChart2 className="w-4 h-4 text-surface-400" />}
          >
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.countryRevenueData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <YAxis type="category" dataKey="country" tick={{ fontSize: 11 }} stroke="#9ca3af" width={100} />
                  <Tooltip
                    formatter={(value: number | undefined, name?: string) => [
                      formatCurrency(value ?? 0),
                      name === 'revenue' ? 'Current Revenue' : 'Projected Revenue',
                    ]}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                    }}
                  />
                  <Legend
                    formatter={(value) =>
                      value === 'revenue' ? 'Current Revenue' : 'Projected Revenue'
                    }
                  />
                  <Bar dataKey="revenue" fill="#6366f1" radius={[0, 3, 3, 0]} name="revenue" barSize={14} />
                  <Bar dataKey="projected" fill="#a855f7" radius={[0, 3, 3, 0]} name="projected" barSize={14} opacity={0.7} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        ) : (
          <div className="lg:col-span-2">
            <EmptyState title="No country data" description="Country revenue projection data is not yet available." />
          </div>
        )}

        {/* 30/60/90 Day Projection Cards */}
        {projections.loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <CardSkeleton key={i} lines={4} />
            ))}
          </div>
        ) : projections.error ? (
          <ApiErrorDisplay error={projections.error} onRetry={projections.refetch} />
        ) : projectionCards.length === 0 ? (
          <EmptyState title="No projections" description="30/60/90-day projections are not yet available." />
        ) : (
          <div className="space-y-4">
            {projectionCards.map((card) => (
              <div
                key={card.period}
                className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-surface-900 dark:text-surface-100">{card.period} Outlook</h4>
                  <span className={`flex items-center gap-1 text-xs font-medium ${card.up ? 'text-green-600 bg-green-50 dark:bg-green-500/10' : 'text-red-600 bg-red-50 dark:bg-red-500/10'} px-2 py-0.5 rounded-full`}>
                    {card.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {card.change}
                  </span>
                </div>
                <p className="text-2xl font-bold text-surface-900 dark:text-surface-100 mb-3">{card.revenue}</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-surface-500 dark:text-surface-400">New Markets</span>
                    <span className="font-medium text-surface-700 dark:text-surface-200">+{card.newMarkets}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-surface-500 dark:text-surface-400">Active Campaigns</span>
                    <span className="font-medium text-surface-700 dark:text-surface-200">{card.campaigns}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-surface-500 dark:text-surface-400">Projected ROAS</span>
                    <span className="font-medium text-surface-700 dark:text-surface-200">{card.roas}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Risk Factors */}
      {forecast.loading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : forecast.error ? (
        <ApiErrorDisplay error={forecast.error} onRetry={forecast.refetch} />
      ) : data && data.riskFactors.length > 0 ? (
        <Card
          title="Risk Factors"
          subtitle={`Top ${data.riskFactors.length} downside risks impacting revenue forecast`}
          actions={
            <span className="flex items-center gap-1 text-xs font-medium text-yellow-600 bg-yellow-50 dark:bg-yellow-500/10 px-2 py-1 rounded-full">
              <Activity className="w-3 h-3" />
              Monitored
            </span>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-surface-100 dark:border-surface-700">
                  <th className="pb-3 pr-4 text-surface-500 dark:text-surface-400 font-medium w-12">#</th>
                  <th className="pb-3 pr-4 text-surface-500 dark:text-surface-400 font-medium">Risk Description</th>
                  <th className="pb-3 pr-4 text-surface-500 dark:text-surface-400 font-medium w-24">Impact</th>
                  <th className="pb-3 text-surface-500 dark:text-surface-400 font-medium w-28">Probability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
                {data.riskFactors.map((risk) => (
                  <tr key={risk.rank} className="hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors">
                    <td className="py-3 pr-4">
                      <span className="w-6 h-6 rounded-full bg-surface-100 dark:bg-surface-700 flex items-center justify-center text-xs font-semibold text-surface-600 dark:text-surface-300">
                        {risk.rank}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-surface-700 dark:text-surface-200">{risk.risk}</td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${impactColor(risk.impact)}`}>
                        {risk.impact}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-surface-100 dark:bg-surface-700 rounded-full h-1.5">
                          <div
                            className="bg-yellow-500 h-1.5 rounded-full"
                            style={{ width: risk.probability }}
                          />
                        </div>
                        <span className="text-xs text-surface-600 dark:text-surface-300 font-medium">{risk.probability}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
