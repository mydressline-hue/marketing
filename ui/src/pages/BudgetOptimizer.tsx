import { useState } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  PauseCircle,
  PlayCircle,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import KPICard from '../components/shared/KPICard';
import StatusBadge from '../components/shared/StatusBadge';
import ProgressBar from '../components/shared/ProgressBar';
import { useApiQuery, useApiMutation } from '../hooks/useApi';
import { TableSkeleton, ChartSkeleton, KPIRowSkeleton } from '../components/shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../components/shared/ErrorBoundary';
import EmptyState from '../components/shared/EmptyState';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChannelAllocation {
  id: string;
  channel: string;
  allocated: number;
  spent: number;
  remaining: number;
  roas: number;
  recommendation: 'increase' | 'maintain' | 'decrease' | 'pause';
  aiNote: string;
  color: string;
}

interface BudgetKPIs {
  totalBudget: number;
  totalAllocated: number;
  totalSpent: number;
  projectedRoi: number;
  budgetChange: number;
  allocatedChange: number;
  spentChange: number;
  roiChange: number;
}

interface CountryBudget {
  country: string;
  allocated: number;
  spent: number;
  flag: string;
}

interface AIRecommendation {
  id: number;
  action: 'increase' | 'maintain' | 'decrease' | 'pause';
  message: string;
  impact: string;
  confidence: number;
}

interface RiskGuardrail {
  rule: string;
  threshold: string;
  status: 'active' | 'inactive';
  triggered: boolean;
}

interface BudgetForecastEntry {
  month: string;
  projected: number;
  actual: number | null;
}

interface BudgetData {
  kpis: BudgetKPIs;
  allocations: ChannelAllocation[];
  countries: CountryBudget[];
  recommendations: AIRecommendation[];
  guardrails: RiskGuardrail[];
  forecast: BudgetForecastEntry[];
}

interface AgentResult {
  success: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const CHANNEL_COLORS: Record<string, string> = {
  'Google Ads': '#6366f1',
  'Meta Ads': '#22c55e',
  'TikTok Ads': '#f59e0b',
  'Bing Ads': '#3b82f6',
  'Snapchat Ads': '#ec4899',
  'LinkedIn Ads': '#8b5cf6',
};

const DEFAULT_COLOR = '#94a3b8';

const RECO_STYLES: Record<string, { bg: string; text: string; icon: typeof TrendingUp }> = {
  increase: { bg: 'bg-success-50', text: 'text-success-700', icon: TrendingUp },
  maintain: { bg: 'bg-primary-50', text: 'text-primary-700', icon: CheckCircle },
  decrease: { bg: 'bg-warning-50', text: 'text-warning-700', icon: TrendingDown },
  pause: { bg: 'bg-danger-50', text: 'text-danger-700', icon: PauseCircle },
};

const formatCurrency = (val: number) =>
  val >= 1_000_000
    ? `$${(val / 1_000_000).toFixed(1)}M`
    : val >= 1_000
      ? `$${(val / 1_000).toFixed(1)}K`
      : `$${val.toFixed(0)}`;

const formatCurrencyFull = (val: number) =>
  `$${val.toLocaleString()}`;

const CustomPieLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
}) => {
  const RADIAN = Math.PI / 180;
  const angle = midAngle ?? 0;
  const ir = innerRadius ?? 0;
  const or = outerRadius ?? 0;
  const cxVal = cx ?? 0;
  const cyVal = cy ?? 0;
  const pct = percent ?? 0;
  const radius = ir + (or - ir) * 0.5;
  const x = cxVal + radius * Math.cos(-angle * RADIAN);
  const y = cyVal + radius * Math.sin(-angle * RADIAN);

  if (pct < 0.06) return null;

  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
      {`${(pct * 100).toFixed(0)}%`}
    </text>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BudgetOptimizer() {
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);

  // ---- API queries -------------------------------------------------------
  const {
    data: budgetData,
    loading: budgetLoading,
    error: budgetError,
    refetch: refetchBudget,
  } = useApiQuery<BudgetData>('/v1/budget');

  // ---- Agent execution (Optimize / Reallocation) -------------------------
  const {
    mutate: runOptimizeAgent,
    loading: optimizing,
  } = useApiMutation<AgentResult>('/v1/agents/budget-optimizer/run', { method: 'POST' });

  // ---- Apply single recommendation ---------------------------------------
  const {
    mutate: applyRecommendation,
    loading: applyingRec,
  } = useApiMutation<AgentResult>('/v1/budget/optimize', { method: 'POST' });

  // ---- Derived data (safe even when null) --------------------------------
  const allocations = budgetData?.allocations ?? [];
  const countries = budgetData?.countries ?? [];
  const recommendations = budgetData?.recommendations ?? [];
  const guardrails = budgetData?.guardrails ?? [];
  const forecast = budgetData?.forecast ?? [];
  const kpis = budgetData?.kpis ?? null;

  const totalAllocated = allocations.reduce((sum, c) => sum + c.allocated, 0);
  const totalSpent = allocations.reduce((sum, c) => sum + c.spent, 0);
  const avgRoas =
    allocations.length > 0
      ? allocations.reduce((sum, c) => sum + c.roas, 0) / allocations.length
      : 0;

  const pieData = allocations.map((c) => ({
    name: c.channel,
    value: c.allocated,
    color: c.color || CHANNEL_COLORS[c.channel] || DEFAULT_COLOR,
  }));

  // ---- Handlers ----------------------------------------------------------
  const handleRunReallocation = async () => {
    await runOptimizeAgent({});
    refetchBudget();
  };

  const handleApplyAll = async () => {
    await applyRecommendation({ applyAll: true });
    refetchBudget();
  };

  const handleApplyOne = async (recId: number) => {
    await applyRecommendation({ recommendationId: recId });
    refetchBudget();
  };

  // ---- Top-level error state ---------------------------------------------
  if (budgetError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Budget Optimizer"
          subtitle="Dynamic Allocation & Risk-Managed Spend Optimization"
          icon={<DollarSign className="w-5 h-5" />}
        />
        <ApiErrorDisplay error={budgetError} onRetry={refetchBudget} />
      </div>
    );
  }

  // ---- Render ------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Budget Optimizer"
        subtitle="Dynamic Allocation & Risk-Managed Spend Optimization"
        icon={<DollarSign className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-surface-500">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              Optimizer active
            </span>
            <button
              onClick={handleRunReallocation}
              disabled={optimizing}
              className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {optimizing ? 'Optimizing...' : 'Run Reallocation'}
            </button>
          </div>
        }
      />

      {/* KPI Row */}
      {budgetLoading ? (
        <KPIRowSkeleton count={4} />
      ) : kpis ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Total Budget"
            value={formatCurrency(kpis.totalBudget).replace('$', '')}
            change={kpis.budgetChange}
            trend={kpis.budgetChange > 0 ? 'up' : kpis.budgetChange < 0 ? 'down' : 'stable'}
            prefix="$"
          />
          <KPICard
            label="Allocated"
            value={formatCurrency(kpis.totalAllocated).replace('$', '')}
            change={kpis.allocatedChange}
            trend={kpis.allocatedChange > 0 ? 'up' : kpis.allocatedChange < 0 ? 'down' : 'stable'}
            prefix="$"
          />
          <KPICard
            label="Spent"
            value={formatCurrency(kpis.totalSpent).replace('$', '')}
            change={kpis.spentChange}
            trend={kpis.spentChange > 0 ? 'up' : kpis.spentChange < 0 ? 'down' : 'stable'}
            prefix="$"
          />
          <KPICard
            label="Projected ROI"
            value={`${kpis.projectedRoi.toFixed(1)}x`}
            change={kpis.roiChange}
            trend={kpis.roiChange > 0 ? 'up' : kpis.roiChange < 0 ? 'down' : 'stable'}
          />
        </div>
      ) : (
        <KPIRowSkeleton count={4} />
      )}

      {/* Budget Allocation Pie + Channel Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pie Chart */}
        <Card
          title="Budget Allocation by Channel"
          subtitle="Current distribution"
          actions={<DollarSign className="w-4 h-4 text-surface-400" />}
        >
          {budgetLoading ? (
            <ChartSkeleton height="h-72" />
          ) : allocations.length === 0 ? (
            <EmptyState
              title="No allocations"
              message="No budget allocations have been configured yet."
              icon={<DollarSign className="w-6 h-6 text-surface-400" />}
            />
          ) : (
            <>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      labelLine={false}
                      label={CustomPieLabel}
                    >
                      {pieData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color}
                          stroke={entry.color}
                          strokeWidth={1}
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setSelectedChannel(entry.name)}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number | undefined) => formatCurrencyFull(value ?? 0)}
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Legend */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                {pieData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-2 text-xs">
                    <span
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-surface-600 truncate">{entry.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* Channel Allocation Table */}
        <Card
          title="Channel Allocation Details"
          subtitle="Performance & AI recommendations"
          className="lg:col-span-2"
          noPadding
        >
          {budgetLoading ? (
            <TableSkeleton rows={6} columns={6} />
          ) : allocations.length === 0 ? (
            <EmptyState
              title="No channel data"
              message="Budget allocations will appear here once configured."
              icon={<DollarSign className="w-6 h-6 text-surface-400" />}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-100">
                    <th className="text-left font-medium text-surface-500 px-5 py-3">Channel</th>
                    <th className="text-right font-medium text-surface-500 px-3 py-3">Allocated</th>
                    <th className="text-right font-medium text-surface-500 px-3 py-3">Spent</th>
                    <th className="text-right font-medium text-surface-500 px-3 py-3">Remaining</th>
                    <th className="text-right font-medium text-surface-500 px-3 py-3">ROAS</th>
                    <th className="text-left font-medium text-surface-500 px-3 py-3">AI Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((ch) => {
                    const recoStyle = RECO_STYLES[ch.recommendation] || RECO_STYLES.maintain;
                    const RecoIcon = recoStyle.icon;
                    const color = ch.color || CHANNEL_COLORS[ch.channel] || DEFAULT_COLOR;
                    return (
                      <tr
                        key={ch.id || ch.channel}
                        className={`border-b border-surface-50 hover:bg-surface-50 transition-colors ${
                          selectedChannel === ch.channel ? 'bg-primary-50/50' : ''
                        }`}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <span className="font-medium text-surface-900">{ch.channel}</span>
                          </div>
                        </td>
                        <td className="text-right px-3 py-3 font-medium text-surface-700">
                          {formatCurrency(ch.allocated)}
                        </td>
                        <td className="text-right px-3 py-3 text-surface-600">
                          {formatCurrency(ch.spent)}
                        </td>
                        <td className="text-right px-3 py-3 text-surface-600">
                          {formatCurrency(ch.remaining)}
                        </td>
                        <td className="text-right px-3 py-3">
                          <span
                            className={`font-semibold ${
                              ch.roas >= 4.0
                                ? 'text-success-600'
                                : ch.roas >= 3.0
                                  ? 'text-primary-600'
                                  : ch.roas >= 2.0
                                    ? 'text-warning-600'
                                    : 'text-danger-600'
                            }`}
                          >
                            {ch.roas.toFixed(1)}x
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${recoStyle.bg} ${recoStyle.text}`}
                            >
                              <RecoIcon className="w-3 h-3" />
                              {ch.recommendation}
                            </span>
                            <ArrowRight className="w-3 h-3 text-surface-300" />
                            <span className="text-xs text-surface-500 hidden xl:inline">{ch.aiNote}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-50/50">
                    <td className="px-5 py-3 font-semibold text-surface-900">Total</td>
                    <td className="text-right px-3 py-3 font-semibold text-surface-900">
                      {formatCurrency(totalAllocated)}
                    </td>
                    <td className="text-right px-3 py-3 font-semibold text-surface-700">
                      {formatCurrency(totalSpent)}
                    </td>
                    <td className="text-right px-3 py-3 font-semibold text-surface-700">
                      {formatCurrency(totalAllocated - totalSpent)}
                    </td>
                    <td className="text-right px-3 py-3 font-semibold text-primary-600">
                      {avgRoas.toFixed(1)}x
                    </td>
                    <td className="px-3 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Country Budget Utilization */}
      <Card
        title="Budget Utilization by Country"
        subtitle="Top markets - spend progress against allocation"
      >
        {budgetLoading ? (
          <ChartSkeleton height="h-48" />
        ) : countries.length === 0 ? (
          <EmptyState
            title="No country data"
            message="Country-level budget utilization will appear here."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-5">
            {countries.map((c) => {
              const pct = Math.round((c.spent / c.allocated) * 100);
              const color: 'primary' | 'success' | 'warning' | 'danger' =
                pct >= 90
                  ? 'danger'
                  : pct >= 75
                    ? 'warning'
                    : pct >= 50
                      ? 'primary'
                      : 'success';
              return (
                <div key={c.country}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-surface-700">
                      {c.flag} {c.country}
                    </span>
                    <span className="text-xs text-surface-500">
                      {formatCurrency(c.spent)} / {formatCurrency(c.allocated)}
                    </span>
                  </div>
                  <ProgressBar
                    value={c.spent}
                    max={c.allocated}
                    showValue
                    color={color}
                    size="md"
                  />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* AI Reallocation Suggestions + Risk Management */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Reallocation Suggestions */}
        <Card
          title="AI Reallocation Suggestions"
          subtitle="Optimization recommendations based on real-time performance"
          actions={
            <button
              onClick={handleApplyAll}
              disabled={applyingRec || recommendations.length === 0}
              className="px-2.5 py-1 text-xs font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {applyingRec ? 'Applying...' : 'Apply All'}
            </button>
          }
        >
          {budgetLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-lg border border-surface-200 p-3 h-20 bg-surface-50" />
              ))}
            </div>
          ) : recommendations.length === 0 ? (
            <EmptyState
              title="No recommendations"
              message="AI recommendations will appear after the optimization agent runs."
              icon={<TrendingUp className="w-6 h-6 text-surface-400" />}
            />
          ) : (
            <div className="space-y-3">
              {recommendations.map((rec) => {
                const style = RECO_STYLES[rec.action] || RECO_STYLES.maintain;
                const Icon = style.icon;
                return (
                  <div
                    key={rec.id}
                    className={`flex items-start gap-3 rounded-lg border p-3 ${
                      rec.action === 'increase'
                        ? 'border-success-200 bg-success-50/50'
                        : rec.action === 'pause'
                          ? 'border-danger-200 bg-danger-50/50'
                          : rec.action === 'decrease'
                            ? 'border-warning-200 bg-warning-50/50'
                            : 'border-primary-200 bg-primary-50/50'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${style.bg}`}
                    >
                      <Icon className={`w-4 h-4 ${style.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-surface-800">{rec.message}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-surface-500">{rec.impact}</span>
                        <span className="text-xs font-medium text-primary-600">
                          {rec.confidence}% confidence
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleApplyOne(rec.id)}
                        disabled={applyingRec}
                        className="p-1.5 rounded-md hover:bg-white/60 text-success-600 transition-colors disabled:opacity-50"
                        title="Apply"
                      >
                        <PlayCircle className="w-4 h-4" />
                      </button>
                      <button
                        className="p-1.5 rounded-md hover:bg-white/60 text-surface-400 transition-colors"
                        title="Dismiss"
                      >
                        <PauseCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Risk Management Rules */}
        <Card
          title="Risk Management Rules"
          subtitle="Active guardrails protecting spend efficiency"
          actions={
            guardrails.length > 0 ? (
              <span className="flex items-center gap-1 text-xs font-medium text-success-600 bg-success-50 px-2 py-0.5 rounded-full">
                <CheckCircle className="w-3 h-3" />
                {guardrails.filter((g) => g.status === 'active').length} active
              </span>
            ) : null
          }
        >
          {budgetLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-lg border border-surface-200 px-4 py-3 h-16 bg-surface-50" />
              ))}
            </div>
          ) : guardrails.length === 0 ? (
            <EmptyState
              title="No guardrails configured"
              message="Risk management rules will appear once set up."
              icon={<AlertTriangle className="w-6 h-6 text-surface-400" />}
            />
          ) : (
            <div className="space-y-3">
              {guardrails.map((rule, index) => (
                <div
                  key={index}
                  className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
                    rule.triggered
                      ? 'border-warning-200 bg-warning-50/50'
                      : 'border-surface-200 bg-surface-50/30'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {rule.triggered ? (
                      <AlertTriangle className="w-4 h-4 text-warning-500" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-success-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-800">{rule.rule}</p>
                    <p className="text-xs text-surface-500 mt-0.5">{rule.threshold}</p>
                  </div>
                  <div className="shrink-0">
                    {rule.triggered ? (
                      <StatusBadge status="warning" size="sm" />
                    ) : (
                      <StatusBadge status="active" size="sm" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Budget Forecast Chart */}
      <Card
        title="Budget Forecast"
        subtitle="Monthly projected spend vs actual - 6 month window"
        actions={<TrendingUp className="w-4 h-4 text-surface-400" />}
      >
        {budgetLoading ? (
          <ChartSkeleton height="h-80" />
        ) : forecast.length === 0 ? (
          <EmptyState
            title="No forecast data"
            message="Budget forecasting data will appear once sufficient history is available."
            icon={<TrendingUp className="w-6 h-6 text-surface-400" />}
          />
        ) : (
          <>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={forecast}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis
                    tickFormatter={(val: number) => formatCurrency(val)}
                    tick={{ fontSize: 12 }}
                    stroke="#9ca3af"
                  />
                  <Tooltip
                    formatter={(value: string | number | undefined) =>
                      value != null ? formatCurrencyFull(Number(value)) : 'N/A'
                    }
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Bar
                    dataKey="projected"
                    name="Projected Spend"
                    fill="#6366f1"
                    radius={[4, 4, 0, 0]}
                    opacity={0.7}
                  />
                  <Bar
                    dataKey="actual"
                    name="Actual Spend"
                    fill="#22c55e"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-surface-100">
              <div className="flex items-center gap-2 text-sm text-surface-600">
                <CheckCircle className="w-4 h-4 text-success-500" />
                <span>
                  Budget pacing is on track at{' '}
                  <span className="font-semibold text-surface-900">
                    {forecast.length > 0 && forecast[forecast.length - 2]?.actual && forecast[forecast.length - 2]?.projected
                      ? `${((forecast[forecast.length - 2].actual! / forecast[forecast.length - 2].projected) * 100).toFixed(1)}%`
                      : '--'}
                  </span>{' '}
                  accuracy
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-surface-600">
                <TrendingUp className="w-4 h-4 text-primary-500" />
                <span>
                  Next projection:{' '}
                  <span className="font-semibold text-surface-900">
                    {forecast.length > 0
                      ? formatCurrency(forecast[forecast.length - 1].projected)
                      : '--'}
                  </span>
                </span>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
