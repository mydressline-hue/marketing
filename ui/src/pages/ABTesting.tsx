import { useState, useMemo } from 'react';
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
import { useApiQuery, useApiMutation } from '../hooks/useApi';
import { CardSkeleton } from '../components/shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../components/shared/ErrorBoundary';
import EmptyState from '../components/shared/EmptyState';

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

interface ABTestListResponse {
  tests: ABTestItem[];
  summary: {
    activeTests: number;
    activeTestsChange: number;
    completed: number;
    completedChange: number;
    avgImprovement: string;
    avgImprovementChange: number;
    statisticalConfidence: string;
    statisticalConfidenceChange: number;
  };
  improvementTrend: { month: string; improvement: number }[];
}

interface ABTestDetailResponse {
  test: ABTestItem;
  variantComparison: {
    name: string;
    conversionRate: number;
    visitors: number;
    conversions: number;
  }[];
}

interface AIAnalysisResponse {
  recommendations: {
    id: string;
    title: string;
    reason: string;
    expectedImpact: string;
    priority: 'high' | 'medium' | 'low';
  }[];
}

interface CreateTestResponse {
  test: ABTestItem;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const typeFilterTabs = ['All', 'Creative', 'Landing Page', 'Pricing', 'Offer'] as const;

const typeLabels: Record<string, string> = {
  creative: 'Creative',
  landing_page: 'Landing Page',
  pricing: 'Pricing',
  offer: 'Offer',
};

const typeBadgeColors: Record<string, string> = {
  creative: 'bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300',
  landing_page: 'bg-sky-100 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300',
  pricing: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
  offer: 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
};

const priorityColors: Record<string, string> = {
  high: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30',
  medium: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
  low: 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300 border-green-200 dark:border-green-500/30',
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
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [showNewTestPanel, setShowNewTestPanel] = useState(false);

  // New test form state
  const [newTestName, setNewTestName] = useState('');
  const [newTestType, setNewTestType] = useState<string>('creative');
  const [newTestVariants, setNewTestVariants] = useState('Control, Variant A');
  const [newTestMetric, setNewTestMetric] = useState('conversion_rate');
  const [newTestTrafficSplit, setNewTestTrafficSplit] = useState(50);

  // -------------------------------------------------------------------------
  // API: List all A/B tests + summary KPIs + improvement trend
  // -------------------------------------------------------------------------
  const {
    data: testsResponse,
    loading: testsLoading,
    error: testsError,
    refetch: refetchTests,
  } = useApiQuery<ABTestListResponse>('/v1/agents/ab-testing/tests');

  const tests = useMemo(() => testsResponse?.tests ?? [], [testsResponse]);
  const summary = testsResponse?.summary;
  const improvementTrend = testsResponse?.improvementTrend ?? [];

  // -------------------------------------------------------------------------
  // Derived: select the first test if none is selected yet
  // -------------------------------------------------------------------------
  const effectiveSelectedId = selectedTestId ?? tests[0]?.id ?? null;

  // -------------------------------------------------------------------------
  // API: Selected test detail (variant comparison data)
  // -------------------------------------------------------------------------
  const {
    data: detailResponse,
    loading: detailLoading,
    error: detailError,
    refetch: refetchDetail,
  } = useApiQuery<ABTestDetailResponse>(
    `/v1/agents/ab-testing/tests/${effectiveSelectedId ?? ''}`,
    { enabled: !!effectiveSelectedId },
  );

  // -------------------------------------------------------------------------
  // API: AI statistical analysis / recommendations
  // -------------------------------------------------------------------------
  const {
    data: analysisResponse,
    loading: analysisLoading,
    error: analysisError,
    refetch: refetchAnalysis,
  } = useApiQuery<AIAnalysisResponse>('/v1/agents/ab-testing/decisions');

  const aiRecommendations = analysisResponse?.recommendations ?? [];

  // -------------------------------------------------------------------------
  // API: Create new test
  // -------------------------------------------------------------------------
  const {
    mutate: createTest,
    loading: createLoading,
    error: createError,
  } = useApiMutation<CreateTestResponse>('/v1/agents/ab-testing/tests', { method: 'POST' });

  // -------------------------------------------------------------------------
  // Filtering
  // -------------------------------------------------------------------------
  const filteredTests = useMemo(
    () =>
      activeFilter === 'All'
        ? tests
        : tests.filter((t) => typeLabels[t.type] === activeFilter),
    [tests, activeFilter],
  );

  // -------------------------------------------------------------------------
  // Selected test & variant comparison chart data
  // -------------------------------------------------------------------------
  const selectedTest = detailResponse?.test ?? tests.find((t) => t.id === effectiveSelectedId) ?? null;

  const variantComparisonData = useMemo(() => {
    if (detailResponse?.variantComparison) return detailResponse.variantComparison;
    if (!selectedTest) return [];
    return selectedTest.variants.map((v) => ({
      name: v.name.length > 20 ? v.name.substring(0, 20) + '...' : v.name,
      conversionRate: v.conversionRate,
      visitors: v.visitors,
      conversions: v.conversions,
    }));
  }, [detailResponse, selectedTest]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  const handleCreateTest = async () => {
    const variantNames = newTestVariants
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    const trafficSplit = variantNames.map((_, i) =>
      i === 0 ? newTestTrafficSplit : Math.round((100 - newTestTrafficSplit) / (variantNames.length - 1)),
    );

    const result = await createTest({
      name: newTestName,
      type: newTestType,
      variants: variantNames,
      successMetric: newTestMetric,
      trafficSplit,
    });

    if (result) {
      // Reset form & refresh list
      setNewTestName('');
      setNewTestType('creative');
      setNewTestVariants('Control, Variant A');
      setNewTestMetric('conversion_rate');
      setNewTestTrafficSplit(50);
      setShowNewTestPanel(false);
      refetchTests();
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
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
      {testsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} lines={1} />
          ))}
        </div>
      ) : testsError ? (
        <ApiErrorDisplay error={testsError} onRetry={refetchTests} />
      ) : summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Active Tests"
            value={summary.activeTests}
            change={summary.activeTestsChange}
            trend="up"
          />
          <KPICard
            label="Completed"
            value={summary.completed}
            change={summary.completedChange}
            trend="up"
          />
          <KPICard
            label="Avg Improvement"
            value={summary.avgImprovement}
            change={summary.avgImprovementChange}
            trend="up"
          />
          <KPICard
            label="Statistical Confidence"
            value={summary.statisticalConfidence}
            change={summary.statisticalConfidenceChange}
            trend="up"
          />
        </div>
      ) : null}

      {/* New Test Creation Panel */}
      {showNewTestPanel && (
        <Card
          title="Create New A/B Test"
          subtitle="Configure and launch a new experiment"
          actions={
            <button
              onClick={() => setShowNewTestPanel(false)}
              className="text-sm text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
            >
              Cancel
            </button>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Test Name */}
            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-200 mb-1.5">
                Test Name
              </label>
              <input
                type="text"
                value={newTestName}
                onChange={(e) => setNewTestName(e.target.value)}
                placeholder="e.g., Homepage Hero Redesign"
                className="w-full px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg text-sm bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            {/* Test Type */}
            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-200 mb-1.5">
                Test Type
              </label>
              <select
                value={newTestType}
                onChange={(e) => setNewTestType(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100"
              >
                <option value="creative">Creative</option>
                <option value="landing_page">Landing Page</option>
                <option value="pricing">Pricing</option>
                <option value="offer">Offer</option>
              </select>
            </div>

            {/* Success Metric */}
            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-200 mb-1.5">
                Success Metric
              </label>
              <select
                value={newTestMetric}
                onChange={(e) => setNewTestMetric(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100"
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
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-200 mb-1.5">
                Variants (comma-separated)
              </label>
              <input
                type="text"
                value={newTestVariants}
                onChange={(e) => setNewTestVariants(e.target.value)}
                placeholder="Control, Variant A, Variant B"
                className="w-full px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg text-sm bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            {/* Traffic Split */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-200 mb-1.5">
                Traffic Split: Control {newTestTrafficSplit}% / Variants {100 - newTestTrafficSplit}%
              </label>
              <input
                type="range"
                min={10}
                max={90}
                value={newTestTrafficSplit}
                onChange={(e) => setNewTestTrafficSplit(Number(e.target.value))}
                className="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
              />
              <div className="flex justify-between text-xs text-surface-400 dark:text-surface-500 mt-1">
                <span>10% Control</span>
                <span>Equal Split</span>
                <span>90% Control</span>
              </div>
            </div>
          </div>

          {/* Create error */}
          {createError && (
            <div className="mt-4">
              <ApiErrorDisplay error={createError} />
            </div>
          )}

          {/* Launch Button */}
          <div className="mt-6 pt-4 border-t border-surface-100 dark:border-surface-700 flex items-center justify-between">
            <p className="text-xs text-surface-500 dark:text-surface-400">
              AI will automatically determine sample size and estimated runtime based on your current traffic.
            </p>
            <button
              onClick={handleCreateTest}
              disabled={createLoading || !newTestName.trim()}
              className="inline-flex items-center gap-2 px-5 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4" />
              {createLoading ? 'Launching...' : 'Launch Test'}
            </button>
          </div>
        </Card>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-1 bg-surface-100 dark:bg-surface-700 rounded-lg w-fit">
        {typeFilterTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveFilter(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeFilter === tab
                ? 'bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 shadow-sm'
                : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Active Tests List */}
      {testsLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} lines={4} />
          ))}
        </div>
      ) : testsError ? (
        <ApiErrorDisplay error={testsError} onRetry={refetchTests} />
      ) : filteredTests.length === 0 ? (
        <EmptyState
          icon={<FlaskConical className="w-12 h-12" />}
          title="No tests found"
          description={
            activeFilter === 'All'
              ? 'Create your first A/B test to start optimizing.'
              : `No ${activeFilter.toLowerCase()} tests found. Try a different filter or create a new test.`
          }
          action={
            <button
              onClick={() => setShowNewTestPanel(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              <FlaskConical className="w-4 h-4" />
              New Test
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {filteredTests.map((test) => {
            const maxRate = getMaxConversionRate(test.variants);

            return (
              <Card key={test.id} className={effectiveSelectedId === test.id ? 'ring-2 ring-primary-500/30' : ''}>
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
                        <h3 className="font-semibold text-surface-900 dark:text-surface-100 truncate">{test.name}</h3>
                      </div>
                      <span className={`shrink-0 text-xs font-medium px-2.5 py-0.5 rounded-full ${typeBadgeColors[test.type]}`}>
                        {typeLabels[test.type]}
                      </span>
                      <StatusBadge status={test.status} />
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      {test.status === 'completed' && test.variants.some((v) => v.isWinner) && (
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1 rounded-full">
                          <Trophy className="w-3.5 h-3.5" />
                          Winner Found
                        </span>
                      )}
                      <div className="flex items-center gap-1.5 text-sm text-surface-500 dark:text-surface-400">
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
                              variant.isWinner ? 'font-semibold text-surface-900 dark:text-surface-100' : 'text-surface-600 dark:text-surface-300'
                            }`}
                            title={variant.name}
                          >
                            {variant.name}
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="w-full bg-surface-100 dark:bg-surface-700 rounded-full h-6 relative overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${getBarColor(
                                variant,
                                maxRate,
                                test.status,
                              )}`}
                              style={{
                                width: `${(variant.conversionRate / (maxRate * 1.3)) * 100}%`,
                              }}
                            />
                            <span className="absolute inset-0 flex items-center pl-3 text-xs font-semibold text-surface-800 dark:text-surface-200">
                              {variant.conversionRate}%
                            </span>
                          </div>
                        </div>
                        <div className="w-32 shrink-0 text-right">
                          <span className="text-xs text-surface-500 dark:text-surface-400">
                            {variant.conversions.toLocaleString()} / {variant.visitors.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Test Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-surface-100 dark:border-surface-700">
                    <div className="flex items-center gap-4 text-xs text-surface-500 dark:text-surface-400">
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
                      <span className="text-xs text-surface-400 dark:text-surface-500">
                        Metric: {test.successMetric}
                      </span>
                      <span className="text-xs text-surface-400 dark:text-surface-500">|</span>
                      <span className="text-xs text-surface-400 dark:text-surface-500">
                        Split: {test.trafficSplit.join('/')}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Improvement Trend */}
        {testsLoading ? (
          <CardSkeleton showChart lines={0} />
        ) : testsError ? (
          <ApiErrorDisplay error={testsError} onRetry={refetchTests} />
        ) : (
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
                    formatter={(value: number | undefined) => [`+${value ?? 0}%`, 'Avg Improvement']}
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
        )}

        {/* Variant Comparison */}
        {detailLoading ? (
          <CardSkeleton showChart lines={0} />
        ) : detailError ? (
          <ApiErrorDisplay error={detailError} onRetry={refetchDetail} />
        ) : selectedTest ? (
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
                    formatter={(value: number | undefined, name?: string) => {
                      if (name === 'conversionRate') return [`${value ?? 0}%`, 'Conversion Rate'];
                      return [(value ?? 0).toLocaleString(), name ?? ''];
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
        ) : (
          <CardSkeleton showChart lines={0} />
        )}
      </div>

      {/* AI Recommendations */}
      {analysisLoading ? (
        <CardSkeleton lines={6} />
      ) : analysisError ? (
        <ApiErrorDisplay error={analysisError} onRetry={refetchAnalysis} />
      ) : aiRecommendations.length > 0 ? (
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
                  <h4 className="font-semibold text-sm text-surface-900 dark:text-surface-100">{rec.title}</h4>
                  <span className="shrink-0 text-xs font-medium uppercase tracking-wide opacity-80">
                    {rec.priority}
                  </span>
                </div>
                <p className="text-sm text-surface-600 dark:text-surface-300 mb-3">{rec.reason}</p>
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
      ) : null}

      {/* Test Completion Progress */}
      {testsLoading ? (
        <CardSkeleton lines={3} />
      ) : testsError ? null : (
        (() => {
          const runningTests = tests.filter((t) => t.status === 'running');
          if (runningTests.length === 0) return null;

          return (
            <Card
              title="Active Test Progress"
              subtitle="Sample size completion for running tests"
            >
              <div className="space-y-4">
                {runningTests.map((test) => {
                  const totalVisitors = test.variants.reduce((sum, v) => sum + v.visitors, 0);
                  const targetSample = Math.round(totalVisitors * 1.6);
                  const progress = Math.round((totalVisitors / targetSample) * 100);

                  return (
                    <div key={test.id} className="flex items-center gap-4">
                      <div className="w-56 shrink-0">
                        <span className="text-sm font-medium text-surface-700 dark:text-surface-200">{test.name}</span>
                      </div>
                      <div className="flex-1">
                        <ProgressBar
                          value={progress}
                          color={progress >= 80 ? 'success' : progress >= 50 ? 'primary' : 'warning'}
                          size="md"
                          showValue
                        />
                      </div>
                      <div className="w-36 shrink-0 text-right text-xs text-surface-500 dark:text-surface-400">
                        {totalVisitors.toLocaleString()} / {targetSample.toLocaleString()} visitors
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })()
      )}
    </div>
  );
}
