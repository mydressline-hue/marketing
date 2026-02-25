import { useState } from 'react';
import {
  MousePointerClick,
  ArrowDown,
  Eye,
  ShoppingCart,
  CreditCard,
  TrendingUp,
  AlertCircle,
  Lightbulb,
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

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const funnelSteps = [
  { label: 'Landing Page', visitors: 50000, pct: 100, icon: Eye },
  { label: 'Product View', visitors: 31000, pct: 62, icon: MousePointerClick },
  { label: 'Add to Cart', visitors: 14000, pct: 28, icon: ShoppingCart },
  { label: 'Checkout Start', visitors: 9000, pct: 18, icon: CreditCard },
  { label: 'Purchase', visitors: 6000, pct: 12, icon: TrendingUp },
];

const dropOffs = [
  { from: 'Landing Page', to: 'Product View', rate: 38 },
  { from: 'Product View', to: 'Add to Cart', rate: 55 },
  { from: 'Add to Cart', to: 'Checkout Start', rate: 36 },
  { from: 'Checkout Start', to: 'Purchase', rate: 33 },
];

const countryFunnelData = [
  { country: 'US', landing: 100, productView: 65, addToCart: 32, checkout: 22, purchase: 15 },
  { country: 'UK', landing: 100, productView: 60, addToCart: 27, checkout: 17, purchase: 11 },
  { country: 'DE', landing: 100, productView: 58, addToCart: 25, checkout: 15, purchase: 10 },
  { country: 'FR', landing: 100, productView: 55, addToCart: 22, checkout: 13, purchase: 8 },
  { country: 'CA', landing: 100, productView: 63, addToCart: 30, checkout: 20, purchase: 13 },
  { country: 'AU', landing: 100, productView: 61, addToCart: 29, checkout: 19, purchase: 12 },
];

const heatmapInsights = [
  {
    area: 'Hero CTA',
    insight: 'Hero CTA receives 45% of clicks',
    metric: '45%',
    type: 'clicks',
    color: 'bg-red-500',
  },
  {
    area: 'Product Images',
    insight: 'Product images get 8.2s average attention',
    metric: '8.2s',
    type: 'attention',
    color: 'bg-orange-500',
  },
  {
    area: 'Price Section',
    insight: 'Price section has 23% scroll-past rate',
    metric: '23%',
    type: 'scroll-past',
    color: 'bg-yellow-500',
  },
  {
    area: 'Reviews Section',
    insight: 'Reviews section drives 34% of conversions',
    metric: '34%',
    type: 'conversions',
    color: 'bg-green-500',
  },
];

const uxRecommendations = [
  {
    id: 1,
    priority: 'High' as const,
    title: 'Simplify checkout to 2 steps',
    description: 'Simplify checkout to 2 steps - projected +15% completion',
    impact: '+15% completion',
    effort: 'Medium',
    status: 'In Progress',
  },
  {
    id: 2,
    priority: 'High' as const,
    title: 'Add trust badges near price',
    description: 'Add trust badges near price - projected +8% conversion',
    impact: '+8% conversion',
    effort: 'Low',
    status: 'Planned',
  },
  {
    id: 3,
    priority: 'Medium' as const,
    title: 'Optimize mobile product gallery',
    description: 'Optimize mobile product gallery - 40% of traffic, 2.1% CVR vs 4.8% desktop',
    impact: '+2.7% mobile CVR',
    effort: 'High',
    status: 'Planned',
  },
  {
    id: 4,
    priority: 'Low' as const,
    title: 'Add urgency indicators',
    description: 'Add urgency indicators for low-stock items',
    impact: '+5% conversion',
    effort: 'Low',
    status: 'Backlog',
  },
];

const pageSpeedMetrics = [
  { metric: 'LCP', label: 'Largest Contentful Paint', value: 2.1, unit: 's', target: 2.5, status: 'good' as const },
  { metric: 'FID', label: 'First Input Delay', value: 45, unit: 'ms', target: 100, status: 'good' as const },
  { metric: 'CLS', label: 'Cumulative Layout Shift', value: 0.08, unit: '', target: 0.1, status: 'needs-improvement' as const },
];

const abTestResults = [
  {
    id: 1,
    name: 'One-Page Checkout vs Multi-Step',
    status: 'running' as const,
    variant: 'One-Page',
    control: 'Multi-Step',
    variantCvr: 4.2,
    controlCvr: 3.8,
    confidence: 87,
    daysRunning: 14,
    sampleSize: 12400,
  },
  {
    id: 2,
    name: 'Express Pay Button Placement',
    status: 'completed' as const,
    variant: 'Above Fold',
    control: 'Below Cart',
    variantCvr: 5.1,
    controlCvr: 3.9,
    confidence: 96,
    daysRunning: 21,
    sampleSize: 18200,
  },
  {
    id: 3,
    name: 'Guest Checkout Default',
    status: 'running' as const,
    variant: 'Guest Default',
    control: 'Login Required',
    variantCvr: 4.5,
    controlCvr: 3.2,
    confidence: 92,
    daysRunning: 10,
    sampleSize: 8600,
  },
];

const improvementMatrix = [
  { initiative: 'Simplified checkout flow', impact: 95, effort: 60, priority: 1, category: 'Checkout' },
  { initiative: 'Trust badge integration', impact: 70, effort: 20, priority: 2, category: 'Trust' },
  { initiative: 'Mobile gallery overhaul', impact: 85, effort: 80, priority: 3, category: 'Mobile' },
  { initiative: 'Dynamic urgency labels', impact: 50, effort: 25, priority: 4, category: 'Urgency' },
  { initiative: 'Social proof widgets', impact: 65, effort: 35, priority: 5, category: 'Trust' },
  { initiative: 'Exit-intent offer popup', impact: 55, effort: 30, priority: 6, category: 'Retention' },
  { initiative: 'Payment method expansion', impact: 75, effort: 50, priority: 7, category: 'Checkout' },
  { initiative: 'Personalized product recs', impact: 80, effort: 70, priority: 8, category: 'Personalization' },
];

const conversionTrendData = [
  { week: 'W1', cvr: 3.2, aov: 82, cartAbandonment: 38 },
  { week: 'W2', cvr: 3.4, aov: 84, cartAbandonment: 36 },
  { week: 'W3', cvr: 3.5, aov: 83, cartAbandonment: 35 },
  { week: 'W4', cvr: 3.6, aov: 85, cartAbandonment: 34 },
  { week: 'W5', cvr: 3.7, aov: 86, cartAbandonment: 33 },
  { week: 'W6', cvr: 3.8, aov: 87, cartAbandonment: 32 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Conversion() {
  const [selectedCountry, setSelectedCountry] = useState<string>('all');

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Conversion Optimization"
        subtitle="Funnel Analysis, UX Recommendations & Checkout Optimization"
        icon={<MousePointerClick className="w-5 h-5" />}
        actions={
          <select
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
            className="text-sm border border-surface-200 rounded-lg px-3 py-1.5 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All Countries</option>
            <option value="US">United States</option>
            <option value="UK">United Kingdom</option>
            <option value="DE">Germany</option>
            <option value="FR">France</option>
            <option value="CA">Canada</option>
            <option value="AU">Australia</option>
          </select>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Conversion Rate" value="3.8" change={12.3} trend="up" suffix="%" />
        <KPICard label="Cart Abandonment" value="32" change={-8.5} trend="down" suffix="%" />
        <KPICard label="Avg Order Value" value={87} change={5.2} trend="up" prefix="$" />
        <KPICard label="Checkout Completion" value="68" change={6.1} trend="up" suffix="%" />
      </div>

      {/* Conversion Funnel Visualization */}
      <Card
        title="Conversion Funnel"
        subtitle="Visitor journey from landing to purchase"
        actions={<TrendingUp className="w-4 h-4 text-surface-400" />}
      >
        <div className="space-y-1">
          {funnelSteps.map((step, index) => {
            const Icon = step.icon;
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
                          background: `linear-gradient(90deg, #6366f1 0%, ${
                            index === 0 ? '#818cf8' : index === 1 ? '#7c6cf1' : index === 2 ? '#8b5cf6' : index === 3 ? '#a855f7' : '#7c3aed'
                          } 100%)`,
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
                {index < funnelSteps.length - 1 && (
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
      </Card>

      {/* Funnel by Country + Conversion Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel Performance by Country */}
        <Card
          title="Funnel Performance by Country"
          subtitle="Conversion rate at each stage (%)"
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={countryFunnelData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="country" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" unit="%" />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                  }}
                  formatter={(value: number, name: string) => [`${value}%`, name]}
                />
                <Bar dataKey="productView" name="Product View" fill="#818cf8" radius={[2, 2, 0, 0]} />
                <Bar dataKey="addToCart" name="Add to Cart" fill="#6366f1" radius={[2, 2, 0, 0]} />
                <Bar dataKey="checkout" name="Checkout" fill="#4f46e5" radius={[2, 2, 0, 0]} />
                <Bar dataKey="purchase" name="Purchase" fill="#4338ca" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Conversion Trend */}
        <Card
          title="Conversion Trend"
          subtitle="Weekly CVR & AOV over last 6 weeks"
        >
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
          <div className="mt-4 p-3 rounded-lg bg-indigo-50 border border-indigo-100">
            <div className="flex items-start gap-2">
              <Lightbulb className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
              <p className="text-xs text-indigo-700">
                <span className="font-semibold">AI Insight:</span> Users who engage with reviews are
                2.4x more likely to convert. Consider moving the reviews section higher on the product page.
              </p>
            </div>
          </div>
        </Card>

        {/* Page Speed Metrics */}
        <Card
          title="Page Speed Metrics"
          subtitle="Core Web Vitals - last 28 days"
          actions={<AlertCircle className="w-4 h-4 text-surface-400" />}
        >
          <div className="space-y-6">
            {pageSpeedMetrics.map((item) => (
              <div key={item.metric}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-sm font-semibold text-surface-800">{item.metric}</span>
                    <span className="text-xs text-surface-500 ml-2">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-lg font-bold ${speedStatusColor[item.status]}`}>
                      {item.value}{item.unit}
                    </span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${speedStatusBg[item.status]} ${speedStatusColor[item.status]}`}
                    >
                      {speedStatusLabel[item.status]}
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

          <div className="mt-6 pt-4 border-t border-surface-100">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-lg font-bold text-surface-900">92</p>
                <p className="text-xs text-surface-500">Performance</p>
              </div>
              <div>
                <p className="text-lg font-bold text-surface-900">88</p>
                <p className="text-xs text-surface-500">Accessibility</p>
              </div>
              <div>
                <p className="text-lg font-bold text-surface-900">95</p>
                <p className="text-xs text-surface-500">Best Practices</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* UX Recommendations */}
      <Card
        title="UX Recommendations"
        subtitle="AI-prioritized improvements for conversion optimization"
        actions={<Lightbulb className="w-4 h-4 text-surface-400" />}
      >
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
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityColor[rec.priority]}`}>
                    {rec.priority}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[rec.status]}`}>
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
      </Card>

      {/* Checkout Optimization + A/B Test Results */}
      <Card
        title="Checkout Optimization - A/B Test Results"
        subtitle="Active and completed experiments"
        actions={
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">
              2 Running
            </span>
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-100 text-surface-600 font-medium">
              1 Completed
            </span>
          </div>
        }
      >
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
                const lift = (((test.variantCvr - test.controlCvr) / test.controlCvr) * 100).toFixed(1);
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
      </Card>

      {/* AI Improvement Priority Matrix */}
      <Card
        title="AI-Generated Improvement Priority Matrix"
        subtitle="Impact vs effort analysis - higher impact and lower effort initiatives are prioritized"
        actions={<TrendingUp className="w-4 h-4 text-surface-400" />}
      >
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
                  formatter={(value: number, name: string) => [`${value}/100`, name]}
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
        <div className="mt-6 p-4 rounded-lg bg-indigo-50 border border-indigo-100">
          <div className="flex items-start gap-3">
            <Lightbulb className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-indigo-800 mb-1">AI Recommendation Summary</p>
              <p className="text-sm text-indigo-700">
                Focus on <span className="font-semibold">checkout simplification</span> and{' '}
                <span className="font-semibold">trust badge integration</span> first -- these two
                initiatives offer the highest impact-to-effort ratio and are projected to increase
                overall conversion rate from 3.8% to 4.6% within 30 days. Mobile gallery optimization
                should follow as the third priority given the significant mobile CVR gap.
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
