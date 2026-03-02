import { useState, useMemo } from 'react';
import {
  FileText,
  Plus,
  Search,
  Globe,
  Star,
  ExternalLink,
  Clock,
  CheckCircle,
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
import ProgressBar from '../components/shared/ProgressBar';
import { useApiQuery, useApiMutation } from '../hooks/useApi';
import { TableSkeleton, CardSkeleton } from '../components/shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../components/shared/ErrorBoundary';
import EmptyState from '../components/shared/EmptyState';

// --- Types ---

interface ContentEntry {
  id: string;
  title: string;
  type: 'blog' | 'guide' | 'product';
  language: string;
  country: string;
  seoScore: number;
  status: 'published' | 'draft' | 'scheduled' | 'review' | 'in_progress';
  publishDate: string;
}

interface ContentListResponse {
  items: ContentEntry[];
  total: number;
}

interface KPIItem {
  label: string;
  value: string | number;
  change: number;
  trend: 'up' | 'down' | 'stable';
  prefix?: string;
  suffix?: string;
}

interface ContentStatsResponse {
  kpis: KPIItem[];
  organicTraffic: { month: string; traffic: number }[];
  keywordRankings: { keyword: string; position: number }[];
  pipeline: { stage: string; count: number; color: string }[];
  shopifySync: {
    connected: boolean;
    lastSync: string;
    itemsSynced: number;
    totalItems: number;
    syncErrors: number;
    pendingSync: number;
    recentErrors: { id: string; message: string }[];
  };
}

interface GenerateContentPayload {
  topic: string;
  country: string;
  language: string;
  keywords: string;
  tone: string;
}

// --- Helpers ---

function getSeoColor(score: number): 'success' | 'warning' | 'danger' | 'primary' {
  if (score >= 85) return 'success';
  if (score >= 70) return 'warning';
  return 'danger';
}

function getTypeLabel(type: string) {
  const map: Record<string, string> = {
    blog: 'Blog Post',
    guide: 'Guide',
    product: 'Product',
  };
  return map[type] || type;
}

function getTypeBadgeColor(type: string) {
  const map: Record<string, string> = {
    blog: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300',
    guide: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300',
    product: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300',
  };
  return map[type] || 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300';
}

// --- Fallback defaults ---

const defaultKpis: KPIItem[] = [
  { label: 'Articles Published', value: 0, change: 0, trend: 'stable' },
  { label: 'Avg SEO Score', value: 0, change: 0, trend: 'stable', suffix: '/100' },
  { label: 'Organic Traffic', value: '0%', change: 0, trend: 'stable' },
  { label: 'Shopify Synced', value: 0, change: 0, trend: 'stable' },
];

const defaultPipeline = [
  { stage: 'Research', count: 0, color: 'bg-blue-500' },
  { stage: 'Writing', count: 0, color: 'bg-yellow-500' },
  { stage: 'Review', count: 0, color: 'bg-purple-500' },
  { stage: 'Published', count: 0, color: 'bg-green-500' },
];

// --- Component ---

export default function ContentBlog() {
  const [searchQuery, setSearchQuery] = useState('');
  const [genForm, setGenForm] = useState<GenerateContentPayload>({
    topic: '',
    country: '',
    language: '',
    keywords: '',
    tone: 'professional',
  });

  // --- API Queries ---
  const {
    data: contentData,
    loading: contentLoading,
    error: contentError,
    refetch: refetchContent,
  } = useApiQuery<ContentListResponse>('/v1/content');

  const {
    data: statsData,
    loading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useApiQuery<ContentStatsResponse>('/v1/content?stats=true');

  // --- API Mutations ---
  const {
    mutate: createContent,
    loading: createLoading,
  } = useApiMutation<ContentEntry>('/v1/content', { method: 'POST' });

  const {
    mutate: generateContent,
    loading: generateLoading,
  } = useApiMutation<ContentEntry>('/v1/agents/content-blog/run', { method: 'POST' });

  // --- Derived data ---
  const contentItems = contentData?.items ?? [];
  const totalItems = contentData?.total ?? contentItems.length;
  const kpis = statsData?.kpis ?? defaultKpis;
  const organicTrafficData = statsData?.organicTraffic ?? [];
  const keywordRankings = statsData?.keywordRankings ?? [];
  const pipelineStages = statsData?.pipeline ?? defaultPipeline;
  const shopifySync = statsData?.shopifySync ?? null;

  const filteredContent = useMemo(
    () =>
      contentItems.filter((item) =>
        item.title.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [contentItems, searchQuery]
  );

  // --- Handlers ---

  const handleCreateArticle = async () => {
    const result = await createContent({
      title: 'New Article',
      type: 'blog',
      status: 'draft',
      language: 'English',
      country: 'US',
      seoScore: 0,
    });
    if (result) {
      refetchContent();
      refetchStats();
    }
  };

  const handleGenerate = async () => {
    if (!genForm.topic) return;
    const result = await generateContent(genForm);
    if (result) {
      setGenForm({ topic: '', country: '', language: '', keywords: '', tone: 'professional' });
      refetchContent();
      refetchStats();
    }
  };

  const pipelineTotal = pipelineStages.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="AI Content & Blog Engine"
        subtitle="SEO-Optimized Content Generation & Shopify Publishing"
        icon={<FileText className="w-5 h-5" />}
        actions={
          <button
            onClick={handleCreateArticle}
            disabled={createLoading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {createLoading ? 'Creating...' : 'New Article'}
          </button>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 p-5">
                <CardSkeleton lines={3} />
              </div>
            ))
          : kpis.map((kpi) => <KPICard key={kpi.label} {...kpi} />)}
      </div>

      {/* Content Table */}
      <Card
        title="Content Library"
        subtitle={`${totalItems} items total`}
        actions={
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 dark:text-surface-500" />
            <input
              type="text"
              placeholder="Search content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-sm border border-surface-200 dark:border-surface-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-surface-800 dark:text-surface-100"
            />
          </div>
        }
        noPadding
      >
        {contentLoading ? (
          <TableSkeleton rows={6} columns={8} />
        ) : contentError ? (
          <ApiErrorDisplay error={contentError} onRetry={refetchContent} />
        ) : filteredContent.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-6 h-6 text-surface-400 dark:text-surface-500" />}
            title={searchQuery ? 'No matching content' : 'No content yet'}
            description={
              searchQuery
                ? 'Try adjusting your search query.'
                : 'Create your first article to get started.'
            }
            action={
              !searchQuery ? (
                <button
                  onClick={handleCreateArticle}
                  disabled={createLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  New Article
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 dark:border-surface-700 text-left text-surface-500 dark:text-surface-400">
                  <th className="px-5 py-3 font-medium">Title</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Language</th>
                  <th className="px-5 py-3 font-medium">Country</th>
                  <th className="px-5 py-3 font-medium">SEO Score</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Publish Date</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredContent.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-surface-50 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <span className="font-medium text-surface-900 dark:text-surface-100 line-clamp-1 max-w-xs block">
                        {item.title}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getTypeBadgeColor(
                          item.type
                        )}`}
                      >
                        {getTypeLabel(item.type)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-surface-600 dark:text-surface-300">
                      <div className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-surface-400 dark:text-surface-500" />
                        {item.language}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-surface-600 dark:text-surface-300">{item.country}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <ProgressBar
                          value={item.seoScore}
                          color={getSeoColor(item.seoScore)}
                          size="sm"
                        />
                        <span className="text-xs font-medium text-surface-700 dark:text-surface-200 whitespace-nowrap">
                          {item.seoScore}/100
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-5 py-3 text-surface-600 dark:text-surface-300">
                      {item.publishDate ? (
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-surface-400 dark:text-surface-500" />
                          {item.publishDate}
                        </div>
                      ) : (
                        <span className="text-surface-400 dark:text-surface-500">--</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <button className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 dark:text-surface-400 hover:text-primary-600 transition-colors">
                          <ExternalLink className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 dark:text-surface-400 hover:text-yellow-600 dark:hover:text-yellow-400 transition-colors">
                          <Star className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Organic Traffic LineChart */}
        <Card title="Organic Traffic" subtitle="Last 6 months">
          {statsLoading ? (
            <CardSkeleton lines={6} />
          ) : statsError ? (
            <ApiErrorDisplay error={statsError} onRetry={refetchStats} compact />
          ) : organicTrafficData.length === 0 ? (
            <EmptyState title="No traffic data" description="Traffic data will appear here once available." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={organicTrafficData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-surface-50, #fff)',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      color: 'var(--color-surface-900, #111)',
                    }}
                    formatter={(value: number | undefined) => [(value ?? 0).toLocaleString(), 'Sessions']}
                  />
                  <Line
                    type="monotone"
                    dataKey="traffic"
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    dot={{ fill: '#6366f1', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Keyword Rankings BarChart */}
        <Card title="Keyword Rankings" subtitle="Top 10 keywords by position">
          {statsLoading ? (
            <CardSkeleton lines={6} />
          ) : statsError ? (
            <ApiErrorDisplay error={statsError} onRetry={refetchStats} compact />
          ) : keywordRankings.length === 0 ? (
            <EmptyState title="No keyword data" description="Keyword rankings will appear once content is published." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={keywordRankings} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    type="number"
                    domain={[0, 10]}
                    tick={{ fontSize: 12 }}
                    stroke="#9ca3af"
                    reversed
                    label={{
                      value: 'Position (lower is better)',
                      position: 'bottom',
                      fontSize: 11,
                      fill: '#9ca3af',
                    }}
                  />
                  <YAxis
                    type="category"
                    dataKey="keyword"
                    tick={{ fontSize: 11 }}
                    stroke="#9ca3af"
                    width={140}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-surface-50, #fff)',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      color: 'var(--color-surface-900, #111)',
                    }}
                    formatter={(value: number | undefined) => [`#${value ?? 0}`, 'Position']}
                  />
                  <Bar dataKey="position" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Bottom Row: Pipeline, AI Generator, Shopify Sync */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Content Pipeline */}
        <Card title="Content Pipeline" subtitle="Current workflow stages">
          {statsLoading ? (
            <CardSkeleton lines={5} />
          ) : statsError ? (
            <ApiErrorDisplay error={statsError} onRetry={refetchStats} compact />
          ) : (
            <div className="space-y-4">
              {pipelineStages.map((stage) => (
                <div key={stage.stage} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                    <span className="text-sm font-medium text-surface-700 dark:text-surface-200">{stage.stage}</span>
                  </div>
                  <span className="text-lg font-bold text-surface-900 dark:text-surface-100">{stage.count}</span>
                </div>
              ))}
              <div className="pt-3 mt-3 border-t border-surface-100 dark:border-surface-700">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-surface-500 dark:text-surface-400">Total in pipeline</span>
                  <span className="font-semibold text-surface-900 dark:text-surface-100">{pipelineTotal}</span>
                </div>
                <div className="mt-3 flex gap-1 h-2 rounded-full overflow-hidden">
                  {pipelineStages.map((stage) => {
                    const widthPct = pipelineTotal > 0 ? (stage.count / pipelineTotal) * 100 : 0;
                    return (
                      <div
                        key={stage.stage}
                        className={`${stage.color} transition-all`}
                        style={{ width: `${widthPct}%` }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* AI Content Generation Panel */}
        <Card title="AI Content Generator" subtitle="Create SEO-optimized content">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">Topic</label>
              <input
                type="text"
                placeholder="e.g., Summer skincare essentials"
                value={genForm.topic}
                onChange={(e) => setGenForm({ ...genForm, topic: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-surface-200 dark:border-surface-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-surface-800 dark:text-surface-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">
                  Target Country
                </label>
                <select
                  value={genForm.country}
                  onChange={(e) => setGenForm({ ...genForm, country: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-surface-200 dark:border-surface-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-surface-800 dark:text-surface-100"
                >
                  <option value="">Select...</option>
                  <option value="US">United States</option>
                  <option value="UK">United Kingdom</option>
                  <option value="DE">Germany</option>
                  <option value="FR">France</option>
                  <option value="MX">Mexico</option>
                  <option value="BR">Brazil</option>
                  <option value="JP">Japan</option>
                  <option value="KR">South Korea</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">Language</label>
                <select
                  value={genForm.language}
                  onChange={(e) => setGenForm({ ...genForm, language: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-surface-200 dark:border-surface-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-surface-800 dark:text-surface-100"
                >
                  <option value="">Select...</option>
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="pt">Portuguese</option>
                  <option value="ja">Japanese</option>
                  <option value="ko">Korean</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">Keywords</label>
              <input
                type="text"
                placeholder="Comma-separated keywords"
                value={genForm.keywords}
                onChange={(e) => setGenForm({ ...genForm, keywords: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-surface-200 dark:border-surface-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-surface-800 dark:text-surface-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">Tone</label>
              <select
                value={genForm.tone}
                onChange={(e) => setGenForm({ ...genForm, tone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-surface-200 dark:border-surface-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-surface-800 dark:text-surface-100"
              >
                <option value="professional">Professional</option>
                <option value="conversational">Conversational</option>
                <option value="persuasive">Persuasive</option>
                <option value="educational">Educational</option>
                <option value="playful">Playful</option>
              </select>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generateLoading || !genForm.topic}
              className="w-full mt-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              {generateLoading ? 'Generating...' : 'Generate Content'}
            </button>
          </div>
        </Card>

        {/* Shopify Sync Status */}
        <Card title="Shopify Sync Status" subtitle="Content publishing integration">
          {statsLoading ? (
            <CardSkeleton lines={6} />
          ) : statsError ? (
            <ApiErrorDisplay error={statsError} onRetry={refetchStats} compact />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-success-50 border border-success-200 rounded-lg">
                <CheckCircle className="w-5 h-5 text-success-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-success-800">
                    {shopifySync?.connected ? 'Connected & Syncing' : 'Disconnected'}
                  </p>
                  <p className="text-xs text-success-600">
                    {shopifySync?.connected
                      ? 'Shopify store is actively connected'
                      : 'Shopify store is not connected'}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-surface-500 dark:text-surface-400">Last Sync</span>
                  <span className="text-sm font-medium text-surface-900 dark:text-surface-100">
                    {shopifySync?.lastSync ?? '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-surface-500 dark:text-surface-400">Items Synced</span>
                  <span className="text-sm font-medium text-surface-900 dark:text-surface-100">
                    {shopifySync ? `${shopifySync.itemsSynced} / ${shopifySync.totalItems}` : '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-surface-500 dark:text-surface-400">Sync Errors</span>
                  <span className="text-sm font-medium text-danger-600">
                    {shopifySync?.syncErrors ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-surface-500 dark:text-surface-400">Pending Sync</span>
                  <span className="text-sm font-medium text-warning-600">
                    {shopifySync?.pendingSync ?? 0}
                  </span>
                </div>
              </div>

              <ProgressBar
                value={shopifySync?.itemsSynced ?? 0}
                max={shopifySync?.totalItems ?? 1}
                label="Sync Progress"
                showValue
                color="success"
                size="md"
              />

              {shopifySync?.recentErrors && shopifySync.recentErrors.length > 0 && (
                <div className="pt-3 border-t border-surface-100 dark:border-surface-700 space-y-2">
                  <p className="text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">
                    Recent Errors
                  </p>
                  {shopifySync.recentErrors.map((err) => (
                    <div
                      key={err.id}
                      className="flex items-start gap-2 text-xs text-danger-600 bg-danger-50 p-2 rounded-md"
                    >
                      <span className="font-medium shrink-0">ERR:</span>
                      <span>{err.message}</span>
                    </div>
                  ))}
                </div>
              )}

              <button className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-surface-200 dark:border-surface-700 rounded-lg text-sm font-medium text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors">
                <Globe className="w-4 h-4" />
                Force Sync Now
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
