import { useState } from 'react';
import {
  Eye,
  TrendingUp,
  TrendingDown,
  Target,
  Search,
  AlertCircle,
  BarChart2,
  Zap,
  Play,
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
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import KPICard from '../components/shared/KPICard';
import StatusBadge from '../components/shared/StatusBadge';
import { useApiQuery, useApiMutation } from '../hooks/useApi';
import { TableSkeleton, ChartSkeleton, CardSkeleton } from '../components/shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../components/shared/ErrorBoundary';
import EmptyState from '../components/shared/EmptyState';

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

interface Competitor {
  name: string;
  estAdSpend: string;
  topChannels: string[];
  marketShare: number;
  trend: 'growing' | 'declining' | 'stable';
  threatLevel: 'critical' | 'warning' | 'active';
}

interface TimelineEvent {
  id: number;
  competitor: string;
  type: 'campaign' | 'price_change' | 'product';
  description: string;
  date: string;
  daysAgo: number;
}

interface MarketShareEntry {
  name: string;
  share: number;
}

interface RadarEntry {
  metric: string;
  ourBrand: number;
  globalReach: number;
  adScale: number;
}

interface GapOpportunity {
  id: number;
  opportunity: string;
  impact: 'high' | 'medium' | 'low';
  market: string;
  detail: string;
}

interface SocialMetric {
  competitor: string;
  platform: string;
  postsPerWeek: number;
  avgEngagement: number;
  followerGrowth: number;
  topContentType: string;
}

interface PostFrequencyEntry {
  name: string;
  globalReach: number;
  adScale: number;
  ourBrand: number;
  crossBorder: number;
}

interface TrendAlert {
  id: number;
  trend: string;
  category: string;
  relevance: 'high' | 'medium' | 'low';
  description: string;
  detectedAt: string;
}

interface CompetitorResponse {
  competitors: Competitor[];
  marketShareData: MarketShareEntry[];
  activityTimeline: TimelineEvent[];
  radarData: RadarEntry[];
  messagingGaps: GapOpportunity[];
  socialMonitoring: SocialMetric[];
  postFrequencyData: PostFrequencyEntry[];
  kpis: {
    competitorsTracked: number;
    competitorsTrackedChange: number;
    marketShare: string;
    marketShareChange: number;
    shareOfVoice: string;
    shareOfVoiceChange: number;
    threatAlerts: number;
    threatAlertsChange: number;
  };
}

interface TrendsResponse {
  trendAlerts: TrendAlert[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const trendIcon = (trend: 'growing' | 'declining' | 'stable') => {
  if (trend === 'growing') return <TrendingUp className="w-4 h-4 text-green-600" />;
  if (trend === 'declining') return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <span className="text-xs text-surface-500 font-medium">--</span>;
};

const trendLabel = (trend: 'growing' | 'declining' | 'stable') => {
  const colors: Record<string, string> = {
    growing: 'text-green-600',
    declining: 'text-red-500',
    stable: 'text-surface-500',
  };
  return (
    <span className={`text-xs font-medium capitalize ${colors[trend]}`}>
      {trend}
    </span>
  );
};

const channelPillColor = (channel: string) => {
  const colors: Record<string, string> = {
    Google: 'bg-blue-50 text-blue-700 border-blue-200',
    Meta: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    TikTok: 'bg-pink-50 text-pink-700 border-pink-200',
    LinkedIn: 'bg-sky-50 text-sky-700 border-sky-200',
    Bing: 'bg-teal-50 text-teal-700 border-teal-200',
    Snapchat: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    YouTube: 'bg-red-50 text-red-700 border-red-200',
  };
  return colors[channel] || 'bg-surface-100 text-surface-600 border-surface-200';
};

const timelineTypeStyles: Record<string, { bg: string; icon: string; label: string }> = {
  campaign: { bg: 'bg-blue-100 text-blue-700', icon: 'bg-blue-500', label: 'New Campaign' },
  price_change: { bg: 'bg-amber-100 text-amber-700', icon: 'bg-amber-500', label: 'Price Change' },
  product: { bg: 'bg-purple-100 text-purple-700', icon: 'bg-purple-500', label: 'Product Release' },
};

const impactColors: Record<string, string> = {
  high: 'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  low: 'bg-surface-100 text-surface-600 border-surface-200',
};

const relevanceColors: Record<string, string> = {
  high: 'border-l-red-500 bg-red-50/50',
  medium: 'border-l-amber-500 bg-amber-50/50',
  low: 'border-l-blue-500 bg-blue-50/50',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CompetitiveIntel() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTrend, setSelectedTrend] = useState<string | null>(null);

  // ------ API calls ------
  const {
    data: competitorData,
    loading: competitorLoading,
    error: competitorError,
    refetch: refetchCompetitors,
  } = useApiQuery<CompetitorResponse>('/v1/agents/competitive-intel/competitors');

  const {
    data: trendsData,
    loading: trendsLoading,
    error: trendsError,
    refetch: refetchTrends,
  } = useApiQuery<TrendsResponse>('/v1/agents/competitive-intel/trends');

  const {
    mutate: runAgent,
    loading: agentRunning,
  } = useApiMutation<{ status: string }>('/v1/agents/competitive-intel/run', { method: 'POST' });

  // ------ Derived data ------
  const competitors = competitorData?.competitors ?? [];
  const marketShareData = competitorData?.marketShareData ?? [];
  const activityTimeline = competitorData?.activityTimeline ?? [];
  const radarData = competitorData?.radarData ?? [];
  const messagingGaps = competitorData?.messagingGaps ?? [];
  const socialMonitoring = competitorData?.socialMonitoring ?? [];
  const postFrequencyData = competitorData?.postFrequencyData ?? [];
  const kpis = competitorData?.kpis;
  const trendAlerts = trendsData?.trendAlerts ?? [];

  const filteredCompetitors = competitors.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // ------ Handlers ------
  const handleRunAgent = async () => {
    await runAgent();
    refetchCompetitors();
    refetchTrends();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Competitive Intelligence"
        subtitle="Competitor Monitoring, Trend Detection & Gap Analysis"
        icon={<Eye className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunAgent}
              disabled={agentRunning}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              {agentRunning ? 'Running...' : 'Run Agent'}
            </button>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                placeholder="Search competitors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 w-56"
              />
            </div>
          </div>
        }
      />

      {/* KPI Row */}
      {competitorLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-surface-200 p-5">
              <CardSkeleton lines={2} />
            </div>
          ))}
        </div>
      ) : competitorError ? (
        <ApiErrorDisplay error={competitorError} onRetry={refetchCompetitors} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Competitors Tracked"
            value={kpis?.competitorsTracked ?? 0}
            change={kpis?.competitorsTrackedChange ?? 0}
            trend="up"
          />
          <KPICard
            label="Market Share"
            value={kpis?.marketShare ?? '0'}
            change={kpis?.marketShareChange ?? 0}
            trend="up"
            suffix="%"
          />
          <KPICard
            label="Share of Voice"
            value={kpis?.shareOfVoice ?? '0'}
            change={kpis?.shareOfVoiceChange ?? 0}
            trend="up"
            suffix="%"
          />
          <KPICard
            label="Threat Alerts"
            value={kpis?.threatAlerts ?? 0}
            change={kpis?.threatAlertsChange ?? 0}
            trend="down"
          />
        </div>
      )}

      {/* Competitor Overview Table */}
      <Card
        title="Competitor Overview"
        subtitle="Top competitors by estimated market presence"
        actions={<Target className="w-4 h-4 text-surface-400" />}
      >
        {competitorLoading ? (
          <TableSkeleton rows={5} columns={6} />
        ) : competitorError ? (
          <ApiErrorDisplay error={competitorError} onRetry={refetchCompetitors} />
        ) : filteredCompetitors.length === 0 ? (
          <EmptyState
            title="No competitors found"
            message={searchQuery ? `No competitors match "${searchQuery}".` : 'No competitor data available yet.'}
            icon={<Target className="w-6 h-6 text-surface-400" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100">
                  <th className="text-left py-3 px-3 font-semibold text-surface-600">Name</th>
                  <th className="text-left py-3 px-3 font-semibold text-surface-600">Est. Ad Spend</th>
                  <th className="text-left py-3 px-3 font-semibold text-surface-600">Top Channels</th>
                  <th className="text-right py-3 px-3 font-semibold text-surface-600">Market Share</th>
                  <th className="text-center py-3 px-3 font-semibold text-surface-600">Trend</th>
                  <th className="text-center py-3 px-3 font-semibold text-surface-600">Threat Level</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompetitors.map((c) => (
                  <tr key={c.name} className="border-b border-surface-50 hover:bg-surface-50/50 transition-colors">
                    <td className="py-3 px-3 font-medium text-surface-900">{c.name}</td>
                    <td className="py-3 px-3 text-surface-600">{c.estAdSpend}</td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1.5">
                        {c.topChannels.map((ch) => (
                          <span
                            key={ch}
                            className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${channelPillColor(ch)}`}
                          >
                            {ch}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-surface-900">{c.marketShare}%</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {trendIcon(c.trend)}
                        {trendLabel(c.trend)}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <StatusBadge status={c.threatLevel} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Market Share Chart + Activity Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Market Share Comparison */}
        <Card
          title="Market Share Comparison"
          subtitle="Estimated share of addressable market"
          actions={<BarChart2 className="w-4 h-4 text-surface-400" />}
        >
          {competitorLoading ? (
            <ChartSkeleton height="h-80" />
          ) : competitorError ? (
            <ApiErrorDisplay error={competitorError} onRetry={refetchCompetitors} />
          ) : marketShareData.length === 0 ? (
            <EmptyState title="No market share data" message="Market share data is not available yet." />
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={marketShareData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} stroke="#9ca3af" tickFormatter={(v) => `${v}%`} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} stroke="#9ca3af" width={100} />
                  <Tooltip
                    formatter={(value: number | undefined) => [`${value ?? 0}%`, 'Market Share']}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                    }}
                  />
                  <Bar
                    dataKey="share"
                    radius={[0, 4, 4, 0]}
                    fill="#6366f1"
                    label={false}
                  >
                    {marketShareData.map((entry, index) => (
                      <rect
                        key={`cell-${index}`}
                        fill={entry.name === 'Our Brand' ? '#22c55e' : '#6366f1'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Activity Timeline */}
        <Card
          title="Competitor Activity Timeline"
          subtitle="Last 7 days"
          actions={<Zap className="w-4 h-4 text-surface-400" />}
        >
          {competitorLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <CardSkeleton key={i} lines={2} />
              ))}
            </div>
          ) : competitorError ? (
            <ApiErrorDisplay error={competitorError} onRetry={refetchCompetitors} />
          ) : activityTimeline.length === 0 ? (
            <EmptyState title="No recent activity" message="No competitor activity detected in the last 7 days." />
          ) : (
            <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
              {activityTimeline.map((event) => {
                const style = timelineTypeStyles[event.type] || timelineTypeStyles.campaign;
                return (
                  <div key={event.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full ${style.icon} mt-1.5 shrink-0`} />
                      <div className="w-px flex-1 bg-surface-200" />
                    </div>
                    <div className="pb-4 flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-medium text-sm text-surface-900">{event.competitor}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${style.bg}`}>
                          {style.label}
                        </span>
                        <span className="text-xs text-surface-400 ml-auto shrink-0">{event.date}</span>
                      </div>
                      <p className="text-sm text-surface-600 leading-relaxed">{event.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Radar Chart + Messaging Gaps */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar Chart */}
        <Card
          title="Competitive Positioning"
          subtitle="Our brand vs top 2 competitors"
          actions={<Target className="w-4 h-4 text-surface-400" />}
        >
          {competitorLoading ? (
            <ChartSkeleton height="h-80" />
          ) : competitorError ? (
            <ApiErrorDisplay error={competitorError} onRetry={refetchCompetitors} />
          ) : radarData.length === 0 ? (
            <EmptyState title="No positioning data" message="Competitive positioning data is not available yet." />
          ) : (
            <>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                    <PolarGrid stroke="#e5e7eb" />
                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: '#6b7280' }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} stroke="#d1d5db" />
                    <Radar
                      name="Our Brand"
                      dataKey="ourBrand"
                      stroke="#22c55e"
                      fill="#22c55e"
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                    <Radar
                      name="GlobalReach AI"
                      dataKey="globalReach"
                      stroke="#6366f1"
                      fill="#6366f1"
                      fillOpacity={0.1}
                      strokeWidth={2}
                    />
                    <Radar
                      name="AdScale Intl"
                      dataKey="adScale"
                      stroke="#f59e0b"
                      fill="#f59e0b"
                      fillOpacity={0.1}
                      strokeWidth={2}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              {/* Legend */}
              <div className="flex items-center justify-center gap-6 mt-2">
                <div className="flex items-center gap-2 text-xs font-medium text-surface-600">
                  <span className="w-3 h-3 rounded-full bg-green-500" /> Our Brand
                </div>
                <div className="flex items-center gap-2 text-xs font-medium text-surface-600">
                  <span className="w-3 h-3 rounded-full bg-indigo-500" /> GlobalReach AI
                </div>
                <div className="flex items-center gap-2 text-xs font-medium text-surface-600">
                  <span className="w-3 h-3 rounded-full bg-amber-500" /> AdScale Intl
                </div>
              </div>
            </>
          )}
        </Card>

        {/* Messaging Gap Analysis */}
        <Card
          title="Messaging Gap Analysis"
          subtitle="Opportunities where competitors are underserving the market"
          actions={<AlertCircle className="w-4 h-4 text-surface-400" />}
        >
          {competitorLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-surface-200 p-4">
                  <CardSkeleton lines={3} />
                </div>
              ))}
            </div>
          ) : competitorError ? (
            <ApiErrorDisplay error={competitorError} onRetry={refetchCompetitors} />
          ) : messagingGaps.length === 0 ? (
            <EmptyState title="No gaps identified" message="No messaging gap opportunities have been detected." />
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
              {messagingGaps.map((gap) => (
                <div
                  key={gap.id}
                  className="rounded-lg border border-surface-200 p-4 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h4 className="text-sm font-semibold text-surface-900 leading-snug">
                      {gap.opportunity}
                    </h4>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 capitalize ${impactColors[gap.impact]}`}
                    >
                      {gap.impact} impact
                    </span>
                  </div>
                  <p className="text-xs text-surface-500 mb-2 leading-relaxed">{gap.detail}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-surface-400">Market:</span>
                    <span className="text-xs font-semibold text-surface-700">{gap.market}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Social Content Monitoring */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Social Monitoring Table */}
        <Card
          title="Social Content Monitoring"
          subtitle="Competitor post frequency & engagement"
          className="lg:col-span-2"
          actions={<Eye className="w-4 h-4 text-surface-400" />}
        >
          {competitorLoading ? (
            <TableSkeleton rows={6} columns={6} />
          ) : competitorError ? (
            <ApiErrorDisplay error={competitorError} onRetry={refetchCompetitors} />
          ) : socialMonitoring.length === 0 ? (
            <EmptyState title="No social data" message="Social monitoring data is not available yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-100">
                    <th className="text-left py-2.5 px-3 font-semibold text-surface-600">Competitor</th>
                    <th className="text-left py-2.5 px-3 font-semibold text-surface-600">Platform</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-surface-600">Posts/Week</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-surface-600">Avg Engagement</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-surface-600">Follower Growth</th>
                    <th className="text-left py-2.5 px-3 font-semibold text-surface-600">Top Content</th>
                  </tr>
                </thead>
                <tbody>
                  {socialMonitoring.map((row) => (
                    <tr
                      key={`${row.competitor}-${row.platform}`}
                      className={`border-b border-surface-50 transition-colors ${
                        row.competitor === 'Our Brand'
                          ? 'bg-green-50/40'
                          : 'hover:bg-surface-50/50'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-medium text-surface-900">
                        {row.competitor}
                        {row.competitor === 'Our Brand' && (
                          <span className="ml-1.5 text-xs text-green-600 font-normal">(you)</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-surface-600">{row.platform}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-surface-900">{row.postsPerWeek}</td>
                      <td className="py-2.5 px-3 text-right text-surface-700">{row.avgEngagement}%</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={`font-medium ${row.followerGrowth > 10 ? 'text-green-600' : 'text-surface-700'}`}>
                          +{row.followerGrowth}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-surface-600">{row.topContentType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Post Frequency Chart */}
        <Card
          title="Weekly Post Frequency"
          subtitle="Posts per day (last week)"
          actions={<BarChart2 className="w-4 h-4 text-surface-400" />}
        >
          {competitorLoading ? (
            <ChartSkeleton height="h-64" />
          ) : competitorError ? (
            <ApiErrorDisplay error={competitorError} onRetry={refetchCompetitors} />
          ) : postFrequencyData.length === 0 ? (
            <EmptyState title="No frequency data" message="Post frequency data is not available yet." />
          ) : (
            <>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={postFrequencyData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                        fontSize: '12px',
                      }}
                    />
                    <Line type="monotone" dataKey="ourBrand" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Our Brand" />
                    <Line type="monotone" dataKey="globalReach" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} name="GlobalReach AI" />
                    <Line type="monotone" dataKey="adScale" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="AdScale Intl" />
                    <Line type="monotone" dataKey="crossBorder" stroke="#ec4899" strokeWidth={2} dot={{ r: 3 }} name="CrossBorder Labs" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {/* Compact Legend */}
              <div className="grid grid-cols-2 gap-1.5 mt-3">
                <div className="flex items-center gap-1.5 text-xs text-surface-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Our Brand
                </div>
                <div className="flex items-center gap-1.5 text-xs text-surface-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> GlobalReach
                </div>
                <div className="flex items-center gap-1.5 text-xs text-surface-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> AdScale
                </div>
                <div className="flex items-center gap-1.5 text-xs text-surface-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-pink-500" /> CrossBorder
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Trend Detection Alerts */}
      <Card
        title="Trend Detection Alerts"
        subtitle="Emerging market trends identified by AI monitoring"
        actions={
          trendsLoading ? null : (
            <span className="flex items-center gap-1.5 text-xs font-medium text-primary-700 bg-primary-50 px-2.5 py-1 rounded-full">
              <Zap className="w-3 h-3" />
              {trendAlerts.length} trends detected
            </span>
          )
        }
      >
        {trendsLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-surface-200 p-4">
                <CardSkeleton lines={3} />
              </div>
            ))}
          </div>
        ) : trendsError ? (
          <ApiErrorDisplay error={trendsError} onRetry={refetchTrends} />
        ) : trendAlerts.length === 0 ? (
          <EmptyState
            title="No trends detected"
            message="No emerging market trends have been identified yet."
            icon={<Zap className="w-6 h-6 text-surface-400" />}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {trendAlerts.map((alert) => (
              <div
                key={alert.id}
                onClick={() =>
                  setSelectedTrend(selectedTrend === String(alert.id) ? null : String(alert.id))
                }
                className={`rounded-lg border-l-4 p-4 cursor-pointer transition-all ${relevanceColors[alert.relevance]} ${
                  selectedTrend === String(alert.id)
                    ? 'ring-2 ring-primary-500/20'
                    : 'hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle
                      className={`w-4 h-4 shrink-0 ${
                        alert.relevance === 'high' ? 'text-red-500' : 'text-amber-500'
                      }`}
                    />
                    <h4 className="text-sm font-semibold text-surface-900 leading-snug">
                      {alert.trend}
                    </h4>
                  </div>
                  <span className="text-xs text-surface-400 shrink-0">{alert.detectedAt}</span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-surface-500 bg-surface-100 px-2 py-0.5 rounded-full">
                    {alert.category}
                  </span>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${impactColors[alert.relevance]}`}
                  >
                    {alert.relevance} relevance
                  </span>
                </div>
                {selectedTrend === String(alert.id) && (
                  <p className="text-sm text-surface-600 leading-relaxed mt-2 pt-2 border-t border-surface-200/60">
                    {alert.description}
                  </p>
                )}
                {selectedTrend !== String(alert.id) && (
                  <p className="text-xs text-surface-400 mt-1">Click to expand details</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
