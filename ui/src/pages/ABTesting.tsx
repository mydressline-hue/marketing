import { useState } from 'react';
import {
  FlaskConical,
  Play,
  Pause,
  Trophy,
  TrendingUp,
  BarChart2,
  CheckCircle2,
  Clock,
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
import StatusBadge from '../components/shared/StatusBadge';
import ConfidenceScore from '../components/shared/ConfidenceScore';
import ProgressBar from '../components/shared/ProgressBar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Variant {
  name: string;
  conversionRate: number;
  visitors: number;
  conversions: number;
  isWinner?: boolean;
}

interface ABTestItem {
  id: string;
  name: string;
  type: 'creative' | 'landing_page' | 'pricing' | 'offer';
  status: 'running' | 'completed' | 'paused';
  variants: Variant[];
  confidence: number;
  improvement: number;
  startDate: string;
  duration: string;
  trafficSplit: number[];
  successMetric: string;
}

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const testData: ABTestItem[] = [
  {
    id: 'ab-001',
    name: 'Hero Banner CTA Color',
    type: 'creative',
    status: 'running',
    variants: [
      { name: 'Control (Blue)', conversionRate: 3.2, visitors: 14520, conversions: 465 },
      { name: 'Variant A (Green)', conversionRate: 4.1, visitors: 14380, conversions: 590 },
      { name: 'Variant B (Orange)', conversionRate: 3.8, visitors: 14410, conversions: 548 },
    ],
    confidence: 89,
    improvement: 28.1,
    startDate: 'Feb 10, 2026',
    duration: '15 days',
    trafficSplit: [34, 33, 33],
    successMetric: 'Click-through Rate',
  },
  {
    id: 'ab-002',
    name: 'Checkout Flow Simplification',
    type: 'landing_page',
    status: 'completed',
    variants: [
      { name: 'Control (3-Step)', conversionRate: 6.8, visitors: 28400, conversions: 1931 },
      { name: 'Variant A (Single Page)', conversionRate: 8.9, visitors: 28350, conversions: 2523, isWinner: true },
    ],
    confidence: 98,
    improvement: 30.9,
    startDate: 'Jan 15, 2026',
    duration: '21 days',
    trafficSplit: [50, 50],
    successMetric: 'Purchase Completion Rate',
  },
  {
    id: 'ab-003',
    name: 'Annual Plan Discount Tier',
    type: 'pricing',
    status: 'running',
    variants: [
      { name: 'Control (20% off)', conversionRate: 12.4, visitors: 9820, conversions: 1218 },
      { name: 'Variant A (25% off)', conversionRate: 14.8, visitors: 9780, conversions: 1447 },
      { name: 'Variant B (30% off)', conversionRate: 15.1, visitors: 9810, conversions: 1481 },
    ],
    confidence: 72,
    improvement: 21.8,
    startDate: 'Feb 18, 2026',
    duration: '7 days',
    trafficSplit: [34, 33, 33],
    successMetric: 'Revenue per Visitor',
  },
  {
    id: 'ab-004',
    name: 'Free Shipping Threshold',
    type: 'offer',
    status: 'completed',
    variants: [
      { name: 'Control ($50 min)', conversionRate: 18.2, visitors: 42100, conversions: 7662 },
      { name: 'Variant A ($35 min)', conversionRate: 22.6, visitors: 42050, conversions: 9503, isWinner: true },
    ],
    confidence: 99,
    improvement: 24.2,
    startDate: 'Dec 28, 2025',
    duration: '28 days',
    trafficSplit: [50, 50],
    successMetric: 'Average Order Value',
  },
  {
    id: 'ab-005',
    name: 'Product Page Video Placement',
    type: 'creative',
    status: 'running',
    variants: [
      { name: 'Control (Below fold)', conversionRate: 5.4, visitors: 11200, conversions: 605 },
      { name: 'Variant A (Above fold)', conversionRate: 6.2, visitors: 11180, conversions: 692 },
    ],
    confidence: 81,
    improvement: 14.8,
    startDate: 'Feb 12, 2026',
    duration: '13 days',
    trafficSplit: [50, 50],
    successMetric: 'Add-to-Cart Rate',
  },
  {
    id: 'ab-006',
    name: 'Email Subject Line Personalization',
    type: 'offer',
    status: 'paused',
    variants: [
      { name: 'Control (Generic)', conversionRate: 2.1, visitors: 52000, conversions: 1092 },
      { name: 'Variant A (First Name)', conversionRate: 2.8, visitors: 31200, conversions: 874 },
      { name: 'Variant B (Product Rec)', conversionRate: 3.0, visitors: 31000, conversions: 930 },
    ],
    confidence: 64,
    improvement: 42.9,
    startDate: 'Feb 5, 2026',
    duration: '20 days (paused)',
    trafficSplit: [40, 30, 30],
    successMetric: 'Open Rate',
  },
];

const improvementTrend = [
  { month: 'Sep', improvement: 4.2 },
  { month: 'Oct', improvement: 7.8 },
  { month: 'Nov', improvement: 10.3 },
  { month: 'Dec', improvement: 12.9 },
  { month: 'Jan', improvement: 15.6 },
  { month: 'Feb', improvement: 18.5 },
];

const aiRecommendations = [
  {
    id: 'rec-1',
    title: 'Test mobile-first checkout layout',
    reason: 'Mobile conversion is 38% lower than desktop. A/B test on simplified mobile checkout could close the gap by an estimated 15-20%.',
    expectedImpact: '+16% mobile CVR',
    priority: 'high' as const,
  },
  {
    id: 'rec-2',
    title: 'Social proof placement experiment',
    reason: 'Pages with review snippets above the fold show 2.3x higher engagement. Testing badge vs. review carousel placement.',
    expectedImpact: '+12% engagement',
    priority: 'high' as const,
  },
  {
    id: 'rec-3',
    title: 'Dynamic pricing by geo-market',
    reason: 'DACH region shows 22% higher willingness-to-pay. Test localized pricing tiers for DE, AT, CH markets.',
    expectedImpact: '+8% ARPU',
    priority: 'medium' as const,
  },
  {
    id: 'rec-4',
    title: 'Exit-intent offer copy variations',
    reason: 'Current exit-intent popup recovers 4.1% of abandoners. Testing urgency-based vs. value-based messaging.',
    expectedImpact: '+25% recovery rate',
    priority: 'medium' as const,
  },
];

const typeFilterTabs = ['All', 'Creative', 'Landing Page', 'Pricing', 'Offer'] as const;

const typeLabels: Record<string, string> = {
  creative: 'Creative',
  landing_page: 'Landing Page',
  pricing: 'Pricing',
  offer: 'Offer',
};

const typeBadgeColors: Record<string, string> = {
  creative: 'bg-violet-100 text-violet-700',
  landing_page: 'bg-sky-100 text-sky-700',
  pricing: 'bg-amber-100 text-amber-700',
  offer: 'bg-emerald-100 text-emerald-700',
};

const priorityColors: Record<string, string> = {
  high: 'bg-red-50 text-red-700 border-red-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-green-50 text-green-700 border-green-200',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getMaxConversionRate = (variants: Variant[]) =>
  Math.max(...variants.map((v) => v.conversionRate));

const getBarColor = (variant: Variant, maxRate: number, testStatus: string) => {
  if (variant.isWinner) return 'bg-success-500';
  if (variant.conversionRate === maxRate && testStatus === 'running') return 'bg-primary-500';
  return 'bg-surface-300';
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ABTesting() {
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const [selectedTestId, setSelectedTestId] = useState<string>('ab-002');
  const [showNewTestPanel, setShowNewTestPanel] = useState(false);

  // New test form state
  const [newTestName, setNewTestName] = useState('');
  const [newTestType, setNewTestType] = useState<string>('creative');
  const [newTestVariants, setNewTestVariants] = useState('Control, Variant A');
  const [newTestMetric, setNewTestMetric] = useState('conversion_rate');
  const [newTestTrafficSplit, setNewTestTrafficSplit] = useState(50);

  const filteredTests =
    activeFilter === 'All'
      ? testData
      : testData.filter(
          (t) => typeLabels[t.type] === activeFilter
        );

  const selectedTest = testData.find((t) => t.id === selectedTestId) || testData[0];

  const variantComparisonData = selectedTest.variants.map((v) => ({
    name: v.name.length > 20 ? v.name.substring(0, 20) + '...' : v.name,
    conversionRate: v.conversionRate,
    visitors: v.visitors,
    conversions: v.conversions,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="A/B Testing Engine"
        subtitle="Statistical Testing & Iterative Optimization"
        icon={<FlaskConical className="w-5 h-5" />}
        actions={
          <button
            onClick={() => setShowNewTestPanel(!showNewTestPanel)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            <FlaskConical className="w-4 h-4" />
            New Test
          </button>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Active Tests"
          value={12}
          change={20}
          trend="up"
        />
        <KPICard
          label="Completed"
          value={34}
          change={13.3}
          trend="up"
        />
        <KPICard
          label="Avg Improvement"
          value="+18.5%"
          change={4.2}
          trend="up"
        />
        <KPICard
          label="Statistical Confidence"
          value="94%"
          change={2.1}
          trend="up"
        />
      </div>

      {/* New Test Creation Panel */}
      {showNewTestPanel && (
        <Card
          title="Create New A/B Test"
          subtitle="Configure and launch a new experiment"
          actions={
            <button
              onClick={() => setShowNewTestPanel(false)}
              className="text-sm text-surface-400 hover:text-surface-600 transition-colors"
            >
              Cancel
            </button>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Test Name */}
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                Test Name
              </label>
              <input
                type="text"
                value={newTestName}
                onChange={(e) => setNewTestName(e.target.value)}
                placeholder="e.g., Homepage Hero Redesign"
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            {/* Test Type */}
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                Test Type
              </label>
              <select
                value={newTestType}
                onChange={(e) => setNewTestType(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
              >
                <option value="creative">Creative</option>
                <option value="landing_page">Landing Page</option>
                <option value="pricing">Pricing</option>
                <option value="offer">Offer</option>
              </select>
            </div>

            {/* Success Metric */}
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                Success Metric
              </label>
              <select
                value={newTestMetric}
                onChange={(e) => setNewTestMetric(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
              >
                <option value="conversion_rate">Conversion Rate</option>
                <option value="click_through_rate">Click-through Rate</option>
                <option value="revenue_per_visitor">Revenue per Visitor</option>
                <option value="average_order_value">Average Order Value</option>
                <option value="bounce_rate">Bounce Rate</option>
                <option value="add_to_cart">Add-to-Cart Rate</option>
              </select>
            </div>

            {/* Variants */}
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                Variants (comma-separated)
              </label>
              <input
                type="text"
                value={newTestVariants}
                onChange={(e) => setNewTestVariants(e.target.value)}
                placeholder="Control, Variant A, Variant B"
                className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            {/* Traffic Split */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                Traffic Split: Control {newTestTrafficSplit}% / Variants {100 - newTestTrafficSplit}%
              </label>
              <input
                type="range"
                min={10}
                max={90}
                value={newTestTrafficSplit}
                onChange={(e) => setNewTestTrafficSplit(Number(e.target.value))}
                className="w-full h-2 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
              />
              <div className="flex justify-between text-xs text-surface-400 mt-1">
                <span>10% Control</span>
                <span>Equal Split</span>
                <span>90% Control</span>
              </div>
            </div>
          </div>

          {/* Launch Button */}
          <div className="mt-6 pt-4 border-t border-surface-100 flex items-center justify-between">
            <p className="text-xs text-surface-500">
              AI will automatically determine sample size and estimated runtime based on your current traffic.
            </p>
            <button className="inline-flex items-center gap-2 px-5 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors">
              <Play className="w-4 h-4" />
              Launch Test
            </button>
          </div>
        </Card>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-1 bg-surface-100 rounded-lg w-fit">
        {typeFilterTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveFilter(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeFilter === tab
                ? 'bg-white text-surface-900 shadow-sm'
                : 'text-surface-500 hover:text-surface-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Active Tests List */}
      <div className="space-y-4">
        {filteredTests.map((test) => {
          const maxRate = getMaxConversionRate(test.variants);

          return (
            <Card key={test.id} className={selectedTestId === test.id ? 'ring-2 ring-primary-500/30' : ''}>
              <div
                className="cursor-pointer"
                onClick={() => setSelectedTestId(test.id)}
              >
                {/* Test Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {test.status === 'running' && <Play className="w-4 h-4 text-success-600 shrink-0" />}
                      {test.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-success-600 shrink-0" />}
                      {test.status === 'paused' && <Pause className="w-4 h-4 text-warning-600 shrink-0" />}
                      <h3 className="font-semibold text-surface-900 truncate">{test.name}</h3>
                    </div>
                    <span className={`shrink-0 text-xs font-medium px-2.5 py-0.5 rounded-full ${typeBadgeColors[test.type]}`}>
                      {typeLabels[test.type]}
                    </span>
                    <StatusBadge status={test.status} />
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    {test.status === 'completed' && test.variants.some((v) => v.isWinner) && (
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
                        <Trophy className="w-3.5 h-3.5" />
                        Winner Found
                      </span>
                    )}
                    <div className="flex items-center gap-1.5 text-sm text-surface-500">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span className="font-semibold text-success-600">+{test.improvement}%</span>
                    </div>
                    <ConfidenceScore score={test.confidence} size="sm" />
                  </div>
                </div>

                {/* Variants with horizontal bars */}
                <div className="space-y-3 mb-4">
                  {test.variants.map((variant) => (
                    <div key={variant.name} className="flex items-center gap-3">
                      <div className="w-44 shrink-0 flex items-center gap-2 min-w-0">
                        {variant.isWinner && (
                          <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        )}
                        <span
                          className={`text-sm truncate ${
                            variant.isWinner ? 'font-semibold text-surface-900' : 'text-surface-600'
                          }`}
                          title={variant.name}
                        >
                          {variant.name}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="w-full bg-surface-100 rounded-full h-6 relative overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${getBarColor(
                              variant,
                              maxRate,
                              test.status
                            )}`}
                            style={{
                              width: `${(variant.conversionRate / (maxRate * 1.3)) * 100}%`,
                            }}
                          />
                          <span className="absolute inset-0 flex items-center pl-3 text-xs font-semibold text-surface-800">
                            {variant.conversionRate}%
                          </span>
                        </div>
                      </div>
                      <div className="w-32 shrink-0 text-right">
                        <span className="text-xs text-surface-500">
                          {variant.conversions.toLocaleString()} / {variant.visitors.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Test Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-surface-100">
                  <div className="flex items-center gap-4 text-xs text-surface-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Started {test.startDate}
                    </span>
                    <span className="flex items-center gap-1">
                      <BarChart2 className="w-3.5 h-3.5" />
                      Running {test.duration}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-surface-400">
                      Metric: {test.successMetric}
                    </span>
                    <span className="text-xs text-surface-400">|</span>
                    <span className="text-xs text-surface-400">
                      Split: {test.trafficSplit.join('/')}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Improvement Trend */}
        <Card
          title="Cumulative Improvement Trend"
          subtitle="Average conversion lift from A/B tests over time"
          actions={<TrendingUp className="w-4 h-4 text-surface-400" />}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={improvementTrend} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                  tickFormatter={(val) => `+${val}%`}
                />
                <Tooltip
                  formatter={(value: number) => [`+${value}%`, 'Avg Improvement']}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="improvement"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  dot={{ fill: '#6366f1', r: 4 }}
                  activeDot={{ r: 6 }}
                  name="Improvement"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Variant Comparison */}
        <Card
          title="Variant Comparison"
          subtitle={`${selectedTest.name} - Conversion Rate by Variant`}
          actions={<BarChart2 className="w-4 h-4 text-surface-400" />}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={variantComparisonData}
                margin={{ top: 5, right: 20, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                  tickFormatter={(val) => `${val}%`}
                />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === 'conversionRate') return [`${value}%`, 'Conversion Rate'];
                    return [value.toLocaleString(), name];
                  }}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                  }}
                />
                <Bar
                  dataKey="conversionRate"
                  fill="#6366f1"
                  radius={[6, 6, 0, 0]}
                  name="conversionRate"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* AI Recommendations */}
      <Card
        title="AI Recommended Next Tests"
        subtitle="Data-driven suggestions based on past test results and current performance gaps"
        actions={
          <span className="flex items-center gap-1.5 text-xs font-medium text-primary-700 bg-primary-50 px-2.5 py-1 rounded-full">
            <FlaskConical className="w-3.5 h-3.5" />
            {aiRecommendations.length} suggestions
          </span>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {aiRecommendations.map((rec) => (
            <div
              key={rec.id}
              className={`rounded-lg border p-4 ${priorityColors[rec.priority]} transition-shadow hover:shadow-md`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h4 className="font-semibold text-sm text-surface-900">{rec.title}</h4>
                <span className="shrink-0 text-xs font-medium uppercase tracking-wide opacity-80">
                  {rec.priority}
                </span>
              </div>
              <p className="text-sm text-surface-600 mb-3">{rec.reason}</p>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-success-700 bg-success-50 px-2 py-0.5 rounded-full">
                  <TrendingUp className="w-3 h-3" />
                  {rec.expectedImpact}
                </span>
                <button className="text-xs font-medium text-primary-600 hover:text-primary-800 transition-colors">
                  Create Test
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Test Completion Progress */}
      <Card
        title="Active Test Progress"
        subtitle="Sample size completion for running tests"
      >
        <div className="space-y-4">
          {testData
            .filter((t) => t.status === 'running')
            .map((test) => {
              const totalVisitors = test.variants.reduce((sum, v) => sum + v.visitors, 0);
              const targetSample = Math.round(totalVisitors * 1.6);
              const progress = Math.round((totalVisitors / targetSample) * 100);

              return (
                <div key={test.id} className="flex items-center gap-4">
                  <div className="w-56 shrink-0">
                    <span className="text-sm font-medium text-surface-700">{test.name}</span>
                  </div>
                  <div className="flex-1">
                    <ProgressBar
                      value={progress}
                      color={progress >= 80 ? 'success' : progress >= 50 ? 'primary' : 'warning'}
                      size="md"
                      showValue
                    />
                  </div>
                  <div className="w-36 shrink-0 text-right text-xs text-surface-500">
                    {totalVisitors.toLocaleString()} / {targetSample.toLocaleString()} visitors
                  </div>
                </div>
              );
            })}
        </div>
      </Card>
    </div>
  );
}
