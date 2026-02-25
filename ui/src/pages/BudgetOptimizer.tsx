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
  Treemap,
} from 'recharts';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import KPICard from '../components/shared/KPICard';
import StatusBadge from '../components/shared/StatusBadge';
import ProgressBar from '../components/shared/ProgressBar';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const channelAllocations = [
  {
    channel: 'Google Ads',
    allocated: 135000,
    spent: 102400,
    remaining: 32600,
    roas: 5.8,
    recommendation: 'increase' as const,
    aiNote: 'Strong ROAS trend, scale by 15%',
    color: '#6366f1',
  },
  {
    channel: 'Meta Ads',
    allocated: 110000,
    spent: 87200,
    remaining: 22800,
    roas: 4.1,
    recommendation: 'maintain' as const,
    aiNote: 'Stable performance, maintain current allocation',
    color: '#22c55e',
  },
  {
    channel: 'TikTok Ads',
    allocated: 75000,
    spent: 54800,
    remaining: 20200,
    roas: 4.9,
    recommendation: 'increase' as const,
    aiNote: 'Emerging high performer, scale +20%',
    color: '#f59e0b',
  },
  {
    channel: 'Bing Ads',
    allocated: 50000,
    spent: 36100,
    remaining: 13900,
    roas: 3.6,
    recommendation: 'maintain' as const,
    aiNote: 'Steady CPA, maintain current pacing',
    color: '#3b82f6',
  },
  {
    channel: 'Snapchat Ads',
    allocated: 30000,
    spent: 18500,
    remaining: 11500,
    roas: 1.8,
    recommendation: 'pause' as const,
    aiNote: 'Below target ROAS for 7 days',
    color: '#ec4899',
  },
  {
    channel: 'LinkedIn Ads',
    allocated: 25000,
    spent: 13000,
    remaining: 12000,
    roas: 3.2,
    recommendation: 'decrease' as const,
    aiNote: 'Diminishing returns detected, reduce by 10%',
    color: '#8b5cf6',
  },
];

const pieData = channelAllocations.map((c) => ({
  name: c.channel,
  value: c.allocated,
  color: c.color,
}));

const countryBudgets = [
  { country: 'United States', allocated: 165000, spent: 128400, flag: '\u{1F1FA}\u{1F1F8}' },
  { country: 'United Kingdom', allocated: 82000, spent: 61500, flag: '\u{1F1EC}\u{1F1E7}' },
  { country: 'Germany', allocated: 68000, spent: 48900, flag: '\u{1F1E9}\u{1F1EA}' },
  { country: 'Japan', allocated: 45000, spent: 32200, flag: '\u{1F1EF}\u{1F1F5}' },
  { country: 'Canada', allocated: 38000, spent: 25800, flag: '\u{1F1E8}\u{1F1E6}' },
  { country: 'Australia', allocated: 27000, spent: 15200, flag: '\u{1F1E6}\u{1F1FA}' },
];

const aiRecommendations = [
  {
    id: 1,
    action: 'increase' as const,
    message: 'Increase Google US by 15% - ROAS 5.8x consistently high',
    impact: '+$20.3K projected revenue',
    confidence: 94,
  },
  {
    id: 2,
    action: 'pause' as const,
    message: 'Pause Snapchat DE - below target ROAS for 7 days',
    impact: 'Save $4.2K/week in wasted spend',
    confidence: 91,
  },
  {
    id: 3,
    action: 'increase' as const,
    message: 'Scale TikTok UK +20% - emerging high performer',
    impact: '+$15.8K projected revenue',
    confidence: 87,
  },
  {
    id: 4,
    action: 'decrease' as const,
    message: 'Reduce Meta JP -10% - diminishing returns detected',
    impact: 'Reallocate $3.5K to higher ROAS channels',
    confidence: 82,
  },
];

const riskGuardrails = [
  {
    rule: 'Daily spend cap per channel',
    threshold: '$5,000/day max',
    status: 'active' as const,
    triggered: false,
  },
  {
    rule: 'ROAS floor threshold',
    threshold: 'Pause if ROAS < 2.0x for 5 days',
    status: 'active' as const,
    triggered: true,
  },
  {
    rule: 'Budget pacing guard',
    threshold: 'Alert if >110% of daily pacing',
    status: 'active' as const,
    triggered: false,
  },
  {
    rule: 'Country spend diversification',
    threshold: 'No single country > 40% of total',
    status: 'active' as const,
    triggered: false,
  },
  {
    rule: 'Anomaly detection circuit breaker',
    threshold: 'Pause on >3 std dev spend spike',
    status: 'active' as const,
    triggered: false,
  },
  {
    rule: 'Weekly reallocation limit',
    threshold: 'Max 25% shift between channels/week',
    status: 'active' as const,
    triggered: false,
  },
];

const budgetForecast = [
  { month: 'Sep', projected: 72000, actual: 68500 },
  { month: 'Oct', projected: 78000, actual: 75200 },
  { month: 'Nov', projected: 85000, actual: 82400 },
  { month: 'Dec', projected: 92000, actual: 86100 },
  { month: 'Jan', projected: 88000, actual: 84300 },
  { month: 'Feb', projected: 95000, actual: null },
];

const RECO_STYLES: Record<string, { bg: string; text: string; icon: typeof TrendingUp }> = {
  increase: { bg: 'bg-success-50', text: 'text-success-700', icon: TrendingUp },
  maintain: { bg: 'bg-primary-50', text: 'text-primary-700', icon: CheckCircle },
  decrease: { bg: 'bg-warning-50', text: 'text-warning-700', icon: TrendingDown },
  pause: { bg: 'bg-danger-50', text: 'text-danger-700', icon: PauseCircle },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
}) => {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (percent < 0.06) return null;

  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BudgetOptimizer() {
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);

  const totalBudget = 500000;
  const totalAllocated = channelAllocations.reduce((sum, c) => sum + c.allocated, 0);
  const totalSpent = channelAllocations.reduce((sum, c) => sum + c.spent, 0);

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
            <button className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors">
              Run Reallocation
            </button>
          </div>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Total Budget"
          value="500K"
          change={0}
          trend="stable"
          prefix="$"
        />
        <KPICard
          label="Allocated"
          value="425K"
          change={8.5}
          trend="up"
          prefix="$"
        />
        <KPICard
          label="Spent"
          value="312K"
          change={12.3}
          trend="up"
          prefix="$"
        />
        <KPICard
          label="Projected ROI"
          value="5.2x"
          change={18.6}
          trend="up"
        />
      </div>

      {/* Budget Allocation Pie + Channel Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pie Chart */}
        <Card
          title="Budget Allocation by Channel"
          subtitle="Current distribution"
          actions={<DollarSign className="w-4 h-4 text-surface-400" />}
        >
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
                  formatter={(value: number) => formatCurrencyFull(value)}
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
        </Card>

        {/* Channel Allocation Table */}
        <Card
          title="Channel Allocation Details"
          subtitle="Performance & AI recommendations"
          className="lg:col-span-2"
          noPadding
        >
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
                {channelAllocations.map((ch) => {
                  const recoStyle = RECO_STYLES[ch.recommendation];
                  const RecoIcon = recoStyle.icon;
                  return (
                    <tr
                      key={ch.channel}
                      className={`border-b border-surface-50 hover:bg-surface-50 transition-colors ${
                        selectedChannel === ch.channel ? 'bg-primary-50/50' : ''
                      }`}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: ch.color }}
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
                  <td className="text-right px-3 py-3 font-semibold text-primary-600">4.3x</td>
                  <td className="px-3 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      </div>

      {/* Country Budget Utilization */}
      <Card
        title="Budget Utilization by Country"
        subtitle="Top 6 markets - spend progress against allocation"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-5">
          {countryBudgets.map((c) => {
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
      </Card>

      {/* AI Reallocation Suggestions + Risk Management */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Reallocation Suggestions */}
        <Card
          title="AI Reallocation Suggestions"
          subtitle="Optimization recommendations based on real-time performance"
          actions={
            <button className="px-2.5 py-1 text-xs font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors">
              Apply All
            </button>
          }
        >
          <div className="space-y-3">
            {aiRecommendations.map((rec) => {
              const style = RECO_STYLES[rec.action];
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
                    <button className="p-1.5 rounded-md hover:bg-white/60 text-success-600 transition-colors" title="Apply">
                      <PlayCircle className="w-4 h-4" />
                    </button>
                    <button className="p-1.5 rounded-md hover:bg-white/60 text-surface-400 transition-colors" title="Dismiss">
                      <PauseCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Risk Management Rules */}
        <Card
          title="Risk Management Rules"
          subtitle="Active guardrails protecting spend efficiency"
          actions={
            <span className="flex items-center gap-1 text-xs font-medium text-success-600 bg-success-50 px-2 py-0.5 rounded-full">
              <CheckCircle className="w-3 h-3" />
              {riskGuardrails.length} active
            </span>
          }
        >
          <div className="space-y-3">
            {riskGuardrails.map((rule, index) => (
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
        </Card>
      </div>

      {/* Budget Forecast Chart */}
      <Card
        title="Budget Forecast"
        subtitle="Monthly projected spend vs actual - 6 month window"
        actions={<TrendingUp className="w-4 h-4 text-surface-400" />}
      >
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={budgetForecast}
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
                formatter={(value: number | null) =>
                  value !== null ? formatCurrencyFull(value) : 'N/A'
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
            <span>Budget pacing is on track at <span className="font-semibold text-surface-900">96.2%</span> accuracy</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-surface-600">
            <TrendingUp className="w-4 h-4 text-primary-500" />
            <span>Feb projection: <span className="font-semibold text-surface-900">{formatCurrency(95000)}</span></span>
          </div>
        </div>
      </Card>
    </div>
  );
}
