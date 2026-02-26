import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Users,
  Filter,
  Download,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
} from 'recharts';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import KPICard from '../components/shared/KPICard';
import { useApiQuery, useApiMutation } from '../hooks/useApi';
import { KPISkeleton, ChartSkeleton, TableSkeleton } from '../components/shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../components/shared/ErrorBoundary';

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

interface SpendSummary {
  total_spend: number;
  total_revenue: number;
  roas: number;
  cpc: number;
  ctr: number;
  daily: Array<{ date: string; revenue: number; spend: number }>;
}

interface CampaignRecord {
  id: string;
  name: string;
  platform: string;
  country: string;
  status: string;
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number;
  cpc: number;
  ctr: number;
}

interface DashboardOverview {
  cac: { value: number; change: number; trend: 'up' | 'down' | 'stable' };
  ltv: { value: number; change: number; trend: 'up' | 'down' | 'stable' };
  roas: { value: number; change: number; trend: 'up' | 'down' | 'stable' };
  mer: { value: number; change: number; trend: 'up' | 'down' | 'stable' };
  funnel: Array<{ label: string; value: number; formatted: string }>;
  channel_attribution: Array<{ name: string; value: number; revenue: string }>;
  country_performance: Array<{ country: string; revenue: number; spend: number; roas: number }>;
  ltv_cac_trend: Array<{ month: string; ltvCacRatio: number; ltv: number; cac: number }>;
  attribution_models: Array<{
    model: string;
    google: number;
    meta: number;
    tiktok: number;
    bing: number;
    snap: number;
    totalConversions: number;
    roas: number;
  }>;
}

interface AgentExecutionResult {
  insight: string;
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Date range options
// ---------------------------------------------------------------------------

const DATE_RANGES = ['7d', '30d', '90d', 'Custom'] as const;
type DateRange = (typeof DATE_RANGES)[number];

// ---------------------------------------------------------------------------
// Chart color palette
// ---------------------------------------------------------------------------

const PIE_COLORS = ['#4285F4', '#0668E1', '#6366f1', '#00809D', '#f59e0b'];

const COUNTRY_BAR_COLOR = '#6366f1';

// ---------------------------------------------------------------------------
// Auto-refresh interval (30 seconds)
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL = 30_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (val: number) =>
  val >= 1_000_000
    ? `$${(val / 1_000_000).toFixed(1)}M`
    : val >= 1_000
      ? `$${(val / 1_000).toFixed(0)}K`
      : `$${val.toFixed(0)}`;

const funnelConversionRate = (from: number, to: number) =>
  ((to / from) * 100).toFixed(1);

// ---------------------------------------------------------------------------
// Custom tooltip for dual-axis chart
// ---------------------------------------------------------------------------

function RevenueSpendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-surface-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-surface-800 mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom pie chart label
// ---------------------------------------------------------------------------

function renderPieLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
  name,
}: any) {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 1.4;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="#374151"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      fontSize={12}
      fontWeight={500}
    >
      {name} {(percent * 100).toFixed(0)}%
    </text>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Analytics() {
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  // -----------------------------------------------------------------------
  // API queries with 30-second auto-refresh
  // -----------------------------------------------------------------------

  const spendQuery = useApiQuery<SpendSummary>('/v1/campaigns/spend/summary', {
    refreshInterval: REFRESH_INTERVAL,
  });

  const campaignsQuery = useApiQuery<CampaignRecord[]>('/v1/campaigns', {
    refreshInterval: REFRESH_INTERVAL,
  });

  const overviewQuery = useApiQuery<DashboardOverview>('/v1/dashboard/overview', {
    refreshInterval: REFRESH_INTERVAL,
  });

  // Agent mutation for on-demand analytics execution
  const agentMutation = useApiMutation<AgentExecutionResult>('/v1/agents/7/execute');

  // -----------------------------------------------------------------------
  // Derived data with safe fallbacks
  // -----------------------------------------------------------------------

  const overview = overviewQuery.data;
  const spend = spendQuery.data;

  // KPI values
  const cacValue = overview?.cac?.value ?? 0;
  const cacChange = overview?.cac?.change ?? 0;
  const cacTrend = overview?.cac?.trend ?? 'stable';

  const ltvValue = overview?.ltv?.value ?? 0;
  const ltvChange = overview?.ltv?.change ?? 0;
  const ltvTrend = overview?.ltv?.trend ?? 'stable';

  const roasValue = overview?.roas?.value ?? 0;
  const roasChange = overview?.roas?.change ?? 0;
  const roasTrend = overview?.roas?.trend ?? 'stable';

  const merValue = overview?.mer?.value ?? 0;
  const merChange = overview?.mer?.change ?? 0;
  const merTrend = overview?.mer?.trend ?? 'stable';

  // Chart data
  const revenueSpendData = spend?.daily ?? [];
  const channelAttributionData = overview?.channel_attribution ?? [];
  const funnelSteps = overview?.funnel ?? [];
  const countryPerformanceData = overview?.country_performance ?? [];
  const ltvCacTrendData = overview?.ltv_cac_trend ?? [];
  const attributionModels = overview?.attribution_models ?? [];

  // Funnel summary stats (derived)
  const funnelImpressions = funnelSteps[0]?.value ?? 0;
  const funnelClicks = funnelSteps[1]?.value ?? 0;
  const funnelAddToCart = funnelSteps[2]?.value ?? 0;
  const funnelCheckout = funnelSteps[3]?.value ?? 0;
  const funnelPurchase = funnelSteps[4]?.value ?? 0;

  const ctr = funnelImpressions > 0 ? ((funnelClicks / funnelImpressions) * 100).toFixed(1) : '0.0';
  const cartRate = funnelClicks > 0 ? ((funnelAddToCart / funnelClicks) * 100).toFixed(1) : '0.0';
  const checkoutRate = funnelAddToCart > 0 ? ((funnelCheckout / funnelAddToCart) * 100).toFixed(1) : '0.0';
  const purchaseRate = funnelCheckout > 0 ? ((funnelPurchase / funnelCheckout) * 100).toFixed(1) : '0.0';

  // LTV/CAC callout values from the latest trend entry
  const latestTrend = ltvCacTrendData[ltvCacTrendData.length - 1];
  const currentLtv = latestTrend?.ltv ?? ltvValue;
  const currentCac = latestTrend?.cac ?? cacValue;
  const currentRatio = latestTrend?.ltvCacRatio ?? (currentCac > 0 ? +(currentLtv / currentCac).toFixed(1) : 0);
  const paybackDays = currentLtv > 0 ? Math.round((currentCac / currentLtv) * 365) : 0;

  // AI Insight from agent execution
  const aiInsight = agentMutation.data?.insight;

  // -----------------------------------------------------------------------
  // Manual refresh all queries
  // -----------------------------------------------------------------------

  const handleRefreshAll = useCallback(() => {
    spendQuery.refetch();
    campaignsQuery.refetch();
    overviewQuery.refetch();
  }, [spendQuery, campaignsQuery, overviewQuery]);

  // Run Performance Analytics agent on mount
  useEffect(() => {
    agentMutation.mutate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------------------
  // Loading & error states
  // -----------------------------------------------------------------------

  const isInitialLoading = overviewQuery.loading && !overviewQuery.data;
  const hasOverviewError = !!overviewQuery.error && !overviewQuery.data;
  const hasSpendError = !!spendQuery.error && !spendQuery.data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Performance Analytics"
        subtitle="Unified Dashboard - CAC, LTV, ROAS, MER & Attribution"
        icon={<BarChart3 className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-surface-600 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${overviewQuery.loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-surface-600 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors">
              <Filter className="w-3.5 h-3.5" />
              Filters
            </button>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-surface-600 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors">
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          </div>
        }
      />

      {/* Date Range Picker */}
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-surface-400" />
        <div className="inline-flex items-center bg-white border border-surface-200 rounded-lg p-0.5">
          {DATE_RANGES.map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                dateRange === range
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-surface-600 hover:text-surface-900 hover:bg-surface-50'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
        {dateRange === 'Custom' && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              className="px-2.5 py-1.5 text-sm border border-surface-200 rounded-lg bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              defaultValue="2026-01-01"
            />
            <span className="text-surface-400 text-sm">to</span>
            <input
              type="date"
              className="px-2.5 py-1.5 text-sm border border-surface-200 rounded-lg bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              defaultValue="2026-01-30"
            />
          </div>
        )}
      </div>

      {/* KPI Row */}
      {isInitialLoading ? (
        <KPISkeleton />
      ) : hasOverviewError ? (
        <ApiErrorDisplay error={overviewQuery.error!} onRetry={overviewQuery.refetch} compact />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Customer Acquisition Cost"
            value={cacValue.toFixed(2)}
            change={cacChange}
            trend={cacTrend}
            prefix="$"
          />
          <KPICard
            label="Lifetime Value"
            value={ltvValue.toString()}
            change={ltvChange}
            trend={ltvTrend}
            prefix="$"
          />
          <KPICard
            label="Return on Ad Spend"
            value={`${roasValue}x`}
            change={roasChange}
            trend={roasTrend}
          />
          <KPICard
            label="Marketing Efficiency Ratio"
            value={`${merValue}x`}
            change={merChange}
            trend={merTrend}
          />
        </div>
      )}

      {/* Revenue & Spend + Channel Attribution Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue & Spend Dual-Axis Area Chart */}
        <Card
          title="Revenue & Ad Spend"
          subtitle="Daily trend - Last 30 days"
          className="lg:col-span-2"
          actions={<TrendingUp className="w-4 h-4 text-surface-400" />}
        >
          {spendQuery.loading && !spendQuery.data ? (
            <ChartSkeleton />
          ) : hasSpendError ? (
            <ApiErrorDisplay error={spendQuery.error!} onRetry={spendQuery.refetch} />
          ) : (
            <>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={revenueSpendData}
                    margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      stroke="#9ca3af"
                      interval={4}
                    />
                    <YAxis
                      yAxisId="revenue"
                      tickFormatter={formatCurrency}
                      tick={{ fontSize: 11 }}
                      stroke="#6366f1"
                      orientation="left"
                    />
                    <YAxis
                      yAxisId="spend"
                      tickFormatter={formatCurrency}
                      tick={{ fontSize: 11 }}
                      stroke="#f59e0b"
                      orientation="right"
                    />
                    <Tooltip content={<RevenueSpendTooltip />} />
                    <Area
                      yAxisId="revenue"
                      type="monotone"
                      dataKey="revenue"
                      stroke="#6366f1"
                      strokeWidth={2}
                      fill="url(#revenueGrad)"
                      name="Revenue"
                    />
                    <Area
                      yAxisId="spend"
                      type="monotone"
                      dataKey="spend"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      fill="url(#spendGrad)"
                      name="Ad Spend"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-6 mt-3 text-xs text-surface-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-indigo-500 rounded" />
                  Revenue (Left Axis)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-amber-500 rounded" />
                  Ad Spend (Right Axis)
                </span>
              </div>
            </>
          )}
        </Card>

        {/* Channel Attribution Pie Chart */}
        <Card
          title="Channel Attribution"
          subtitle="Revenue share by channel"
          actions={<DollarSign className="w-4 h-4 text-surface-400" />}
        >
          {isInitialLoading ? (
            <ChartSkeleton />
          ) : hasOverviewError ? (
            <ApiErrorDisplay error={overviewQuery.error!} onRetry={overviewQuery.refetch} compact />
          ) : (
            <>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={channelAttributionData}
                      cx="50%"
                      cy="45%"
                      outerRadius={90}
                      innerRadius={45}
                      dataKey="value"
                      label={renderPieLabel}
                      labelLine={false}
                      strokeWidth={2}
                      stroke="#fff"
                    >
                      {channelAttributionData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        `${value}%`,
                        name,
                      ]}
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                        fontSize: '13px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-2">
                {channelAttributionData.map((channel, idx) => (
                  <div
                    key={channel.name}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{
                          backgroundColor: PIE_COLORS[idx % PIE_COLORS.length],
                        }}
                      />
                      <span className="text-surface-700 font-medium">
                        {channel.name}
                      </span>
                    </span>
                    <span className="text-surface-500">{channel.revenue}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Funnel Visualization */}
      <Card
        title="Conversion Funnel"
        subtitle="Full-funnel performance across all channels"
        actions={<Users className="w-4 h-4 text-surface-400" />}
      >
        {isInitialLoading ? (
          <ChartSkeleton height="h-48" />
        ) : hasOverviewError ? (
          <ApiErrorDisplay error={overviewQuery.error!} onRetry={overviewQuery.refetch} />
        ) : (
          <>
            <div className="flex flex-col md:flex-row items-stretch justify-between gap-0 py-4">
              {funnelSteps.map((step, idx) => {
                const widthPercent = 100 - idx * 15;
                const isLast = idx === funnelSteps.length - 1;
                return (
                  <div key={step.label} className="flex items-center flex-1">
                    <div className="flex flex-col items-center w-full">
                      {/* Funnel bar */}
                      <div
                        className="relative rounded-lg flex flex-col items-center justify-center py-5 px-3 transition-all"
                        style={{
                          width: `${widthPercent}%`,
                          minWidth: '100px',
                          background: `linear-gradient(135deg, ${
                            idx === 0
                              ? '#818cf8'
                              : idx === 1
                                ? '#6366f1'
                                : idx === 2
                                  ? '#4f46e5'
                                  : idx === 3
                                    ? '#4338ca'
                                    : '#3730a3'
                          }, ${
                            idx === 0
                              ? '#a5b4fc'
                              : idx === 1
                                ? '#818cf8'
                                : idx === 2
                                  ? '#6366f1'
                                  : idx === 3
                                    ? '#4f46e5'
                                    : '#4338ca'
                          })`,
                        }}
                      >
                        <p className="text-white text-xs font-medium opacity-90">
                          {step.label}
                        </p>
                        <p className="text-white text-xl font-bold mt-1">
                          {step.formatted}
                        </p>
                      </div>

                      {/* Overall conversion from top */}
                      <p className="text-xs text-surface-400 mt-2">
                        {idx === 0
                          ? '100%'
                          : `${((step.value / funnelSteps[0].value) * 100).toFixed(1)}% of total`}
                      </p>
                    </div>

                    {/* Conversion arrow between steps */}
                    {!isLast && (
                      <div className="flex flex-col items-center mx-1 shrink-0">
                        <svg
                          className="w-6 h-6 text-surface-300"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                        <span className="text-xs font-semibold text-indigo-600 whitespace-nowrap">
                          {funnelConversionRate(
                            step.value,
                            funnelSteps[idx + 1].value,
                          )}
                          %
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Funnel summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-surface-100">
              <div className="text-center">
                <p className="text-xs text-surface-500 font-medium">
                  Click-Through Rate
                </p>
                <p className="text-lg font-bold text-surface-900 mt-0.5">{ctr}%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-surface-500 font-medium">
                  Cart Rate
                </p>
                <p className="text-lg font-bold text-surface-900 mt-0.5">{cartRate}%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-surface-500 font-medium">
                  Checkout Rate
                </p>
                <p className="text-lg font-bold text-surface-900 mt-0.5">{checkoutRate}%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-surface-500 font-medium">
                  Purchase Rate
                </p>
                <p className="text-lg font-bold text-surface-900 mt-0.5">{purchaseRate}%</p>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Country Performance + LTV/CAC Trend Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Country Performance Bar Chart */}
        <Card
          title="Country Performance"
          subtitle="Top 6 countries by revenue"
          actions={<BarChart3 className="w-4 h-4 text-surface-400" />}
        >
          {isInitialLoading ? (
            <ChartSkeleton />
          ) : hasOverviewError ? (
            <ApiErrorDisplay error={overviewQuery.error!} onRetry={overviewQuery.refetch} />
          ) : (
            <>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={countryPerformanceData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#e5e7eb"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tickFormatter={formatCurrency}
                      tick={{ fontSize: 11 }}
                      stroke="#9ca3af"
                    />
                    <YAxis
                      type="category"
                      dataKey="country"
                      tick={{ fontSize: 12 }}
                      stroke="#9ca3af"
                      width={110}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        formatCurrency(value),
                        name,
                      ]}
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                      }}
                    />
                    <Bar
                      dataKey="revenue"
                      fill={COUNTRY_BAR_COLOR}
                      radius={[0, 4, 4, 0]}
                      name="Revenue"
                      barSize={24}
                    />
                    <Bar
                      dataKey="spend"
                      fill="#f59e0b"
                      radius={[0, 4, 4, 0]}
                      name="Spend"
                      barSize={24}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* ROAS by country */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-4 pt-4 border-t border-surface-100">
                {countryPerformanceData.map((c) => (
                  <div key={c.country} className="text-center">
                    <p className="text-xs text-surface-500 truncate">
                      {c.country.split(' ')[0]}
                    </p>
                    <p className="text-sm font-bold text-surface-900">
                      {c.roas}x ROAS
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* LTV/CAC Ratio Trend Line Chart */}
        <Card
          title="LTV / CAC Ratio Trend"
          subtitle="6-month trend with breakdowns"
          actions={<TrendingUp className="w-4 h-4 text-surface-400" />}
        >
          {isInitialLoading ? (
            <ChartSkeleton />
          ) : hasOverviewError ? (
            <ApiErrorDisplay error={overviewQuery.error!} onRetry={overviewQuery.refetch} />
          ) : (
            <>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={ltvCacTrendData}
                    margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 12 }}
                      stroke="#9ca3af"
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      stroke="#9ca3af"
                      domain={[4, 9]}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                      }}
                      formatter={(value: number, name: string) => {
                        if (name === 'LTV/CAC Ratio') return [`${value}x`, name];
                        if (name === 'LTV') return [`$${value}`, name];
                        if (name === 'CAC') return [`$${value}`, name];
                        return [value, name];
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: '12px' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="ltvCacRatio"
                      stroke="#6366f1"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 6 }}
                      name="LTV/CAC Ratio"
                    />
                    <Line
                      type="monotone"
                      dataKey="ltv"
                      stroke="#22c55e"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      name="LTV"
                      yAxisId={0}
                      hide
                    />
                    <Line
                      type="monotone"
                      dataKey="cac"
                      stroke="#ef4444"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      name="CAC"
                      yAxisId={0}
                      hide
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {/* Current LTV and CAC callout */}
              <div className="flex items-center justify-around mt-4 pt-4 border-t border-surface-100">
                <div className="text-center">
                  <p className="text-xs text-surface-500">Current LTV</p>
                  <p className="text-lg font-bold text-green-600">${currentLtv}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-surface-500">Current CAC</p>
                  <p className="text-lg font-bold text-red-500">${currentCac}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-surface-500">LTV:CAC Ratio</p>
                  <p className="text-lg font-bold text-indigo-600">{currentRatio}x</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-surface-500">Payback Period</p>
                  <p className="text-lg font-bold text-surface-900">{paybackDays} days</p>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Attribution Model Comparison Table */}
      <Card
        title="Cross-Channel Attribution Model Comparison"
        subtitle="How each model distributes credit across channels"
        actions={
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-surface-600 bg-surface-50 border border-surface-200 rounded-lg hover:bg-surface-100 transition-colors">
            <Download className="w-3 h-3" />
            Export CSV
          </button>
        }
      >
        {isInitialLoading ? (
          <TableSkeleton rows={4} cols={8} />
        ) : hasOverviewError ? (
          <ApiErrorDisplay error={overviewQuery.error!} onRetry={overviewQuery.refetch} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200">
                    <th className="text-left py-3 px-4 font-semibold text-surface-700">
                      Attribution Model
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-surface-700">
                      <span className="inline-flex items-center gap-1">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: '#4285F4' }}
                        />
                        Google
                      </span>
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-surface-700">
                      <span className="inline-flex items-center gap-1">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: '#0668E1' }}
                        />
                        Meta
                      </span>
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-surface-700">
                      <span className="inline-flex items-center gap-1">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: '#6366f1' }}
                        />
                        TikTok
                      </span>
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-surface-700">
                      <span className="inline-flex items-center gap-1">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: '#00809D' }}
                        />
                        Bing
                      </span>
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-surface-700">
                      <span className="inline-flex items-center gap-1">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: '#f59e0b' }}
                        />
                        Snap
                      </span>
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-surface-700">
                      Conversions
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-surface-700">
                      Blended ROAS
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {attributionModels.map((row) => {
                    const isRecommended = row.model === 'Time Decay';
                    return (
                      <tr
                        key={row.model}
                        className={`border-b border-surface-100 transition-colors hover:bg-surface-50 ${
                          isRecommended ? 'bg-indigo-50/50' : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-medium text-surface-800">
                          <span className="flex items-center gap-2">
                            {row.model}
                            {isRecommended && (
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-indigo-100 text-indigo-700 rounded">
                                Recommended
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="text-right py-3 px-4 text-surface-600 tabular-nums">
                          {row.google}%
                        </td>
                        <td className="text-right py-3 px-4 text-surface-600 tabular-nums">
                          {row.meta}%
                        </td>
                        <td className="text-right py-3 px-4 text-surface-600 tabular-nums">
                          {row.tiktok}%
                        </td>
                        <td className="text-right py-3 px-4 text-surface-600 tabular-nums">
                          {row.bing}%
                        </td>
                        <td className="text-right py-3 px-4 text-surface-600 tabular-nums">
                          {row.snap}%
                        </td>
                        <td className="text-right py-3 px-4 font-medium text-surface-800 tabular-nums">
                          {row.totalConversions.toLocaleString()}
                        </td>
                        <td className="text-right py-3 px-4 tabular-nums">
                          <span
                            className={`font-bold ${
                              row.roas >= 4.2
                                ? 'text-green-600'
                                : row.roas >= 4.0
                                  ? 'text-indigo-600'
                                  : 'text-surface-700'
                            }`}
                          >
                            {row.roas}x
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Attribution insight */}
            <div className="mt-4 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
              <p className="text-sm text-indigo-800">
                <span className="font-semibold">AI Insight:</span>{' '}
                {aiInsight
                  ? aiInsight
                  : agentMutation.loading
                    ? 'Analyzing attribution data...'
                    : 'The Time Decay model most accurately reflects the customer journey for your vertical. Meta\u0027s contribution increases by 3.8pp under Position Based attribution, suggesting strong top-of-funnel influence that Last Click undervalues.'}
              </p>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
