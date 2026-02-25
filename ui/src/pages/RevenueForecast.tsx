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

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const revenueProjectionData = [
  { month: 'Mar 25', conservative: 1800000, projected: 2100000, aggressive: 2500000, type: 'historical' },
  { month: 'Apr 25', conservative: 1900000, projected: 2200000, aggressive: 2650000, type: 'historical' },
  { month: 'May 25', conservative: 1950000, projected: 2350000, aggressive: 2800000, type: 'historical' },
  { month: 'Jun 25', conservative: 2050000, projected: 2500000, aggressive: 3000000, type: 'historical' },
  { month: 'Jul 25', conservative: 2100000, projected: 2600000, aggressive: 3150000, type: 'historical' },
  { month: 'Aug 25', conservative: 2150000, projected: 2700000, aggressive: 3300000, type: 'historical' },
  { month: 'Sep 25', conservative: 2200000, projected: 2800000, aggressive: 3500000, type: 'forecast' },
  { month: 'Oct 25', conservative: 2280000, projected: 2920000, aggressive: 3700000, type: 'forecast' },
  { month: 'Nov 25', conservative: 2350000, projected: 3050000, aggressive: 3950000, type: 'forecast' },
  { month: 'Dec 25', conservative: 2400000, projected: 3100000, aggressive: 4100000, type: 'forecast' },
  { month: 'Jan 26', conservative: 2500000, projected: 3200000, aggressive: 4400000, type: 'forecast' },
  { month: 'Feb 26', conservative: 2600000, projected: 3400000, aggressive: 4800000, type: 'forecast' },
];

const breakEvenData = [
  { day: 0, cumulativeRevenue: 0, cumulativeCost: 120000 },
  { day: 7, cumulativeRevenue: 18000, cumulativeCost: 135000 },
  { day: 14, cumulativeRevenue: 52000, cumulativeCost: 148000 },
  { day: 21, cumulativeRevenue: 98000, cumulativeCost: 160000 },
  { day: 28, cumulativeRevenue: 148000, cumulativeCost: 170000 },
  { day: 35, cumulativeRevenue: 195000, cumulativeCost: 180000 },
  { day: 42, cumulativeRevenue: 220000, cumulativeCost: 220000 },
  { day: 49, cumulativeRevenue: 270000, cumulativeCost: 228000 },
  { day: 56, cumulativeRevenue: 325000, cumulativeCost: 235000 },
  { day: 63, cumulativeRevenue: 388000, cumulativeCost: 242000 },
  { day: 70, cumulativeRevenue: 460000, cumulativeCost: 248000 },
  { day: 77, cumulativeRevenue: 540000, cumulativeCost: 254000 },
  { day: 84, cumulativeRevenue: 630000, cumulativeCost: 260000 },
  { day: 90, cumulativeRevenue: 710000, cumulativeCost: 265000 },
];

const ltvCacTrendData = [
  { month: 'Sep', ltv: 152, cac: 28.5, ratio: 5.3 },
  { month: 'Oct', ltv: 158, cac: 27.8, ratio: 5.7 },
  { month: 'Nov', ltv: 165, cac: 26.9, ratio: 6.1 },
  { month: 'Dec', ltv: 172, cac: 26.2, ratio: 6.6 },
  { month: 'Jan', ltv: 180, cac: 25.3, ratio: 7.1 },
  { month: 'Feb', ltv: 186, cac: 24.5, ratio: 7.6 },
];

const countryRevenueData = [
  { country: 'United States', revenue: 920000, projected: 1150000 },
  { country: 'United Kingdom', revenue: 480000, projected: 620000 },
  { country: 'Germany', revenue: 410000, projected: 540000 },
  { country: 'Canada', revenue: 320000, projected: 410000 },
  { country: 'Australia', revenue: 260000, projected: 340000 },
  { country: 'France', revenue: 210000, projected: 280000 },
];

const scenarios = [
  {
    id: 'conservative',
    label: 'Conservative',
    description: '-20% growth rate applied across all channels',
    revenue: '$2.1M',
    growth: '-20%',
    confidence: 85,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  {
    id: 'base',
    label: 'Base Case',
    description: 'Current trajectory maintained with AI optimizations',
    revenue: '$3.2M',
    growth: '+28%',
    confidence: 72,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
  },
  {
    id: 'aggressive',
    label: 'Aggressive',
    description: '+40% growth from market expansion & budget increase',
    revenue: '$4.8M',
    growth: '+40%',
    confidence: 55,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
  },
];

const projectionCards = [
  {
    period: '30-Day',
    revenue: '$2.85M',
    change: '+8.2%',
    up: true,
    newMarkets: 1,
    campaigns: 38,
    roas: '4.6x',
  },
  {
    period: '60-Day',
    revenue: '$3.05M',
    change: '+15.4%',
    up: true,
    newMarkets: 2,
    campaigns: 45,
    roas: '4.9x',
  },
  {
    period: '90-Day',
    revenue: '$3.40M',
    change: '+28.3%',
    up: true,
    newMarkets: 3,
    campaigns: 52,
    roas: '5.2x',
  },
];

const riskFactors = [
  {
    rank: 1,
    risk: 'Currency fluctuation in GBP/EUR reducing effective revenue by up to 8%',
    impact: 'High',
    probability: '35%',
  },
  {
    rank: 2,
    risk: 'Google Ads policy changes may restrict targeting in 3 active markets',
    impact: 'High',
    probability: '25%',
  },
  {
    rank: 3,
    risk: 'Seasonal demand drop in Q2 across European markets',
    impact: 'Medium',
    probability: '60%',
  },
  {
    rank: 4,
    risk: 'Increased competitor ad spend in US market driving up CPCs by 15-20%',
    impact: 'Medium',
    probability: '45%',
  },
  {
    rank: 5,
    risk: 'Supply chain delays impacting product availability for AU/CA campaigns',
    impact: 'Low',
    probability: '20%',
  },
];

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
  if (impact === 'High') return 'text-red-600 bg-red-50';
  if (impact === 'Medium') return 'text-yellow-600 bg-yellow-50';
  return 'text-green-600 bg-green-50';
};

// ---------------------------------------------------------------------------
// Custom tooltip for the revenue projection chart
// ---------------------------------------------------------------------------

const ProjectionTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-surface-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-surface-900 mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-surface-600">{entry.name}:</span>
          <span className="font-medium text-surface-900">{formatCurrency(entry.value)}</span>
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

  // Split data into historical and forecast for dashed line styling
  const historicalData = revenueProjectionData.filter((d) => d.type === 'historical');
  const forecastData = revenueProjectionData.filter((d) => d.type === 'forecast');
  // Overlap point for seamless transition
  const transitionPoint = historicalData[historicalData.length - 1];
  const forecastWithOverlap = [transitionPoint, ...forecastData];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Revenue Forecasting"
        subtitle="Predictive Modeling, LTV/CAC Analysis & Scenario Simulations"
        icon={<TrendingUp className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-surface-500">
              <Calendar className="w-4 h-4" />
              Last updated: Today
            </span>
          </div>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Projected Revenue"
          value="3.2M"
          change={28}
          trend="up"
          prefix="$"
        />
        <KPICard
          label="LTV/CAC Ratio"
          value="7.6x"
          change={14.2}
          trend="up"
        />
        <KPICard
          label="Break-Even"
          value="Day 42"
          change={12}
          trend="up"
        />
        <KPICard
          label="Growth Rate"
          value="+28%"
          change={5.3}
          trend="up"
        />
      </div>

      {/* Revenue Projection Chart */}
      <Card
        title="Revenue Projection"
        subtitle="12-month outlook: historical (solid) vs forecast (dashed)"
        actions={<BarChart2 className="w-4 h-4 text-surface-400" />}
      >
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueProjectionData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
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
                strokeDasharray={((_d: any, index: number) => (index >= 6 ? '6 4' : '0')) as any}
                fill="url(#conservativeGrad)"
                name="Conservative"
                dot={(props: any) => {
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
                dot={(props: any) => {
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
                dot={(props: any) => {
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
              {revenueProjectionData.map((entry, index) => {
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
        <div className="flex items-center gap-6 mt-3 pt-3 border-t border-surface-100 text-xs text-surface-500">
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

      {/* LTV/CAC + Break-Even Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LTV/CAC Modeling */}
        <Card
          title="LTV/CAC Modeling"
          subtitle="Unit economics & payback analysis"
          actions={<DollarSign className="w-4 h-4 text-surface-400" />}
        >
          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="bg-surface-50 rounded-lg p-3">
              <p className="text-xs text-surface-500 mb-0.5">Current LTV</p>
              <p className="text-xl font-bold text-surface-900">$186</p>
              <p className="text-xs text-surface-400">Target: $220</p>
              <div className="w-full bg-surface-200 rounded-full h-1.5 mt-2">
                <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: '84.5%' }} />
              </div>
            </div>
            <div className="bg-surface-50 rounded-lg p-3">
              <p className="text-xs text-surface-500 mb-0.5">Current CAC</p>
              <p className="text-xl font-bold text-surface-900">$24.50</p>
              <p className="text-xs text-surface-400">Target: $20.00</p>
              <div className="w-full bg-surface-200 rounded-full h-1.5 mt-2">
                <div className="bg-green-500 h-1.5 rounded-full" style={{ width: '81.6%' }} />
              </div>
            </div>
            <div className="bg-surface-50 rounded-lg p-3">
              <p className="text-xs text-surface-500 mb-0.5">Payback Period</p>
              <p className="text-xl font-bold text-surface-900">42 days</p>
              <p className="text-xs text-green-600 flex items-center gap-0.5">
                <ArrowDownRight className="w-3 h-3" /> Down 6 days
              </p>
            </div>
            <div className="bg-surface-50 rounded-lg p-3">
              <p className="text-xs text-surface-500 mb-0.5">LTV:CAC Ratio</p>
              <p className="text-xl font-bold text-surface-900">7.6x</p>
              <p className="text-xs text-green-600 flex items-center gap-0.5">
                <ArrowUpRight className="w-3 h-3" /> Up from 5.3x
              </p>
            </div>
          </div>

          {/* Monthly improvement trend */}
          <p className="text-xs font-medium text-surface-500 mb-2">Monthly Improvement Trend</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={ltvCacTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
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
        </Card>

        {/* Break-Even Analysis */}
        <Card
          title="Break-Even Analysis"
          subtitle="Cumulative revenue vs cumulative cost over time"
          actions={<Target className="w-4 h-4 text-surface-400" />}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={breakEvenData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                  tickFormatter={(v) => `Day ${v}`}
                />
                <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    formatCurrency(value),
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
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    if (payload.day === 42) {
                      return (
                        <g key="breakeven">
                          <circle cx={cx} cy={cy} r={6} fill="#22c55e" stroke="#fff" strokeWidth={2} />
                          <text x={cx + 10} y={cy - 10} fill="#22c55e" fontSize={11} fontWeight={600}>
                            Break-even
                          </text>
                        </g>
                      );
                    }
                    return <circle key={`be-${payload.day}`} cx={cx} cy={cy} r={0} fill="none" />;
                  }}
                  legendType="none"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-surface-100">
            <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
            <span className="text-sm text-surface-600">
              Break-even reached at <span className="font-semibold text-surface-900">Day 42</span> with
              cumulative revenue of <span className="font-semibold text-surface-900">$220K</span>
            </span>
          </div>
        </Card>
      </div>

      {/* Scenario Simulation Panel */}
      <Card
        title="Scenario Simulation"
        subtitle="Compare growth trajectories and associated confidence levels"
        actions={<Activity className="w-4 h-4 text-surface-400" />}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {scenarios.map((scenario) => (
            <button
              key={scenario.id}
              onClick={() => setActiveScenario(scenario.id)}
              className={`text-left rounded-xl border-2 p-5 transition-all ${
                activeScenario === scenario.id
                  ? `${scenario.border} ${scenario.bg} shadow-md`
                  : 'border-surface-200 bg-white hover:border-surface-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className={`font-semibold ${activeScenario === scenario.id ? scenario.color : 'text-surface-900'}`}>
                  {scenario.label}
                </h4>
                <ConfidenceScore score={scenario.confidence} size="sm" />
              </div>
              <p className="text-2xl font-bold text-surface-900 mb-1">{scenario.revenue}</p>
              <p className="text-sm text-surface-500 mb-3">{scenario.description}</p>
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
                <div className="mt-3 pt-3 border-t border-surface-200">
                  <div className="flex items-center gap-1.5 text-xs text-surface-500">
                    <Target className="w-3 h-3" />
                    Currently selected scenario
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>
      </Card>

      {/* Country Revenue Projection + 30/60/90 Day Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Country Revenue Projection BarChart */}
        <Card
          title="Country Revenue Projections"
          subtitle="Top 6 markets - Current vs Projected"
          className="lg:col-span-2"
          actions={<BarChart2 className="w-4 h-4 text-surface-400" />}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={countryRevenueData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis type="category" dataKey="country" tick={{ fontSize: 11 }} stroke="#9ca3af" width={100} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    formatCurrency(value),
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

        {/* 30/60/90 Day Projection Cards */}
        <div className="space-y-4">
          {projectionCards.map((card) => (
            <div
              key={card.period}
              className="bg-white rounded-xl border border-surface-200 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-surface-900">{card.period} Outlook</h4>
                <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                  <ArrowUpRight className="w-3 h-3" />
                  {card.change}
                </span>
              </div>
              <p className="text-2xl font-bold text-surface-900 mb-3">{card.revenue}</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-surface-500">New Markets</span>
                  <span className="font-medium text-surface-700">+{card.newMarkets}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-surface-500">Active Campaigns</span>
                  <span className="font-medium text-surface-700">{card.campaigns}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-surface-500">Projected ROAS</span>
                  <span className="font-medium text-surface-700">{card.roas}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Risk Factors */}
      <Card
        title="Risk Factors"
        subtitle="Top 5 downside risks impacting revenue forecast"
        actions={
          <span className="flex items-center gap-1 text-xs font-medium text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full">
            <Activity className="w-3 h-3" />
            Monitored
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-surface-100">
                <th className="pb-3 pr-4 text-surface-500 font-medium w-12">#</th>
                <th className="pb-3 pr-4 text-surface-500 font-medium">Risk Description</th>
                <th className="pb-3 pr-4 text-surface-500 font-medium w-24">Impact</th>
                <th className="pb-3 text-surface-500 font-medium w-28">Probability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {riskFactors.map((risk) => (
                <tr key={risk.rank} className="hover:bg-surface-50 transition-colors">
                  <td className="py-3 pr-4">
                    <span className="w-6 h-6 rounded-full bg-surface-100 flex items-center justify-center text-xs font-semibold text-surface-600">
                      {risk.rank}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-surface-700">{risk.risk}</td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${impactColor(risk.impact)}`}>
                      {risk.impact}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-surface-100 rounded-full h-1.5">
                        <div
                          className="bg-yellow-500 h-1.5 rounded-full"
                          style={{ width: risk.probability }}
                        />
                      </div>
                      <span className="text-xs text-surface-600 font-medium">{risk.probability}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
