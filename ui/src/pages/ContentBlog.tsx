import { useState } from 'react';
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

// --- Mock Data ---

const kpis = [
  { label: 'Articles Published', value: 89, change: 12, trend: 'up' as const },
  { label: 'Avg SEO Score', value: 87, change: 5, trend: 'up' as const, suffix: '/100' },
  { label: 'Organic Traffic', value: '+34%', change: 34, trend: 'up' as const },
  { label: 'Shopify Synced', value: 76, change: 8, trend: 'up' as const },
];

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

const contentItems: ContentEntry[] = [
  {
    id: 'c1',
    title: '10 Sustainable Fashion Trends Dominating Europe in 2026',
    type: 'blog',
    language: 'English',
    country: 'UK',
    seoScore: 94,
    status: 'published',
    publishDate: '2026-02-20',
  },
  {
    id: 'c2',
    title: 'Guia Completa: Cuidado de la Piel con Ingredientes Naturales',
    type: 'guide',
    language: 'Spanish',
    country: 'Mexico',
    seoScore: 88,
    status: 'published',
    publishDate: '2026-02-18',
  },
  {
    id: 'c3',
    title: 'Premium Wireless Earbuds - Product Comparison & Review',
    type: 'product',
    language: 'English',
    country: 'USA',
    seoScore: 91,
    status: 'published',
    publishDate: '2026-02-15',
  },
  {
    id: 'c4',
    title: 'Les Meilleurs Produits Bio pour Bébé - Guide d\'Achat 2026',
    type: 'guide',
    language: 'French',
    country: 'France',
    seoScore: 82,
    status: 'review',
    publishDate: '2026-02-28',
  },
  {
    id: 'c5',
    title: 'Wie Smart-Home-Geräte Ihren Alltag Revolutionieren',
    type: 'blog',
    language: 'German',
    country: 'Germany',
    seoScore: 76,
    status: 'in_progress',
    publishDate: '',
  },
  {
    id: 'c6',
    title: 'Top 5 Japanese Matcha Brands You Can Buy Online',
    type: 'product',
    language: 'English',
    country: 'Japan',
    seoScore: 85,
    status: 'scheduled',
    publishDate: '2026-03-01',
  },
  {
    id: 'c7',
    title: 'Yoga para Iniciantes: Equipamentos Essenciais e Dicas',
    type: 'blog',
    language: 'Portuguese',
    country: 'Brazil',
    seoScore: 69,
    status: 'draft',
    publishDate: '',
  },
  {
    id: 'c8',
    title: 'The Ultimate Guide to K-Beauty Routines for Every Skin Type',
    type: 'guide',
    language: 'English',
    country: 'South Korea',
    seoScore: 92,
    status: 'published',
    publishDate: '2026-02-10',
  },
];

const organicTrafficData = [
  { month: 'Sep', traffic: 12400 },
  { month: 'Oct', traffic: 15800 },
  { month: 'Nov', traffic: 18200 },
  { month: 'Dec', traffic: 21500 },
  { month: 'Jan', traffic: 26800 },
  { month: 'Feb', traffic: 32100 },
];

const keywordRankings = [
  { keyword: 'sustainable fashion', position: 3 },
  { keyword: 'natural skincare', position: 5 },
  { keyword: 'wireless earbuds review', position: 2 },
  { keyword: 'organic baby products', position: 7 },
  { keyword: 'smart home guide', position: 4 },
  { keyword: 'matcha brands online', position: 6 },
  { keyword: 'k-beauty routine', position: 1 },
  { keyword: 'yoga equipment guide', position: 9 },
  { keyword: 'eco friendly lifestyle', position: 8 },
  { keyword: 'best skincare 2026', position: 3 },
];

const pipelineStages = [
  { stage: 'Research', count: 5, color: 'bg-blue-500' },
  { stage: 'Writing', count: 3, color: 'bg-yellow-500' },
  { stage: 'Review', count: 2, color: 'bg-purple-500' },
  { stage: 'Published', count: 89, color: 'bg-green-500' },
];

// --- Helper ---

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
    blog: 'bg-blue-100 text-blue-700',
    guide: 'bg-purple-100 text-purple-700',
    product: 'bg-amber-100 text-amber-700',
  };
  return map[type] || 'bg-surface-100 text-surface-600';
}

// --- Component ---

export default function ContentBlog() {
  const [searchQuery, setSearchQuery] = useState('');
  const [genForm, setGenForm] = useState({
    topic: '',
    country: '',
    language: '',
    keywords: '',
    tone: 'professional',
  });

  const filteredContent = contentItems.filter((item) =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="AI Content & Blog Engine"
        subtitle="SEO-Optimized Content Generation & Shopify Publishing"
        icon={<FileText className="w-5 h-5" />}
        actions={
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors">
            <Plus className="w-4 h-4" />
            New Article
          </button>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <KPICard key={kpi.label} {...kpi} />
        ))}
      </div>

      {/* Content Table */}
      <Card
        title="Content Library"
        subtitle={`${contentItems.length} items total`}
        actions={
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text"
              placeholder="Search content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        }
        noPadding
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-100 text-left text-surface-500">
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
                  className="border-b border-surface-50 hover:bg-surface-50 transition-colors"
                >
                  <td className="px-5 py-3">
                    <span className="font-medium text-surface-900 line-clamp-1 max-w-xs block">
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
                  <td className="px-5 py-3 text-surface-600">
                    <div className="flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-surface-400" />
                      {item.language}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-surface-600">{item.country}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <ProgressBar
                        value={item.seoScore}
                        color={getSeoColor(item.seoScore)}
                        size="sm"
                      />
                      <span className="text-xs font-medium text-surface-700 whitespace-nowrap">
                        {item.seoScore}/100
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-5 py-3 text-surface-600">
                    {item.publishDate ? (
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-surface-400" />
                        {item.publishDate}
                      </div>
                    ) : (
                      <span className="text-surface-400">--</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1">
                      <button className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-500 hover:text-primary-600 transition-colors">
                        <ExternalLink className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-500 hover:text-yellow-600 transition-colors">
                        <Star className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Organic Traffic LineChart */}
        <Card title="Organic Traffic" subtitle="Last 6 months">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={organicTrafficData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '13px',
                  }}
                  formatter={(value: number) => [value.toLocaleString(), 'Sessions']}
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
        </Card>

        {/* Keyword Rankings BarChart */}
        <Card title="Keyword Rankings" subtitle="Top 10 keywords by position">
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
                  label={{ value: 'Position (lower is better)', position: 'bottom', fontSize: 11, fill: '#9ca3af' }}
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
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '13px',
                  }}
                  formatter={(value: number) => [`#${value}`, 'Position']}
                />
                <Bar dataKey="position" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Bottom Row: Pipeline, AI Generator, Shopify Sync */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Content Pipeline */}
        <Card title="Content Pipeline" subtitle="Current workflow stages">
          <div className="space-y-4">
            {pipelineStages.map((stage) => (
              <div key={stage.stage} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                  <span className="text-sm font-medium text-surface-700">{stage.stage}</span>
                </div>
                <span className="text-lg font-bold text-surface-900">{stage.count}</span>
              </div>
            ))}
            <div className="pt-3 mt-3 border-t border-surface-100">
              <div className="flex items-center justify-between text-sm">
                <span className="text-surface-500">Total in pipeline</span>
                <span className="font-semibold text-surface-900">
                  {pipelineStages.reduce((sum, s) => sum + s.count, 0)}
                </span>
              </div>
              <div className="mt-3 flex gap-1 h-2 rounded-full overflow-hidden">
                {pipelineStages.map((stage) => {
                  const total = pipelineStages.reduce((sum, s) => sum + s.count, 0);
                  const widthPct = (stage.count / total) * 100;
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
        </Card>

        {/* AI Content Generation Panel */}
        <Card title="AI Content Generator" subtitle="Create SEO-optimized content">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">Topic</label>
              <input
                type="text"
                placeholder="e.g., Summer skincare essentials"
                value={genForm.topic}
                onChange={(e) => setGenForm({ ...genForm, topic: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">
                  Target Country
                </label>
                <select
                  value={genForm.country}
                  onChange={(e) => setGenForm({ ...genForm, country: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
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
                <label className="block text-xs font-medium text-surface-600 mb-1">Language</label>
                <select
                  value={genForm.language}
                  onChange={(e) => setGenForm({ ...genForm, language: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
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
              <label className="block text-xs font-medium text-surface-600 mb-1">Keywords</label>
              <input
                type="text"
                placeholder="Comma-separated keywords"
                value={genForm.keywords}
                onChange={(e) => setGenForm({ ...genForm, keywords: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">Tone</label>
              <select
                value={genForm.tone}
                onChange={(e) => setGenForm({ ...genForm, tone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
              >
                <option value="professional">Professional</option>
                <option value="conversational">Conversational</option>
                <option value="persuasive">Persuasive</option>
                <option value="educational">Educational</option>
                <option value="playful">Playful</option>
              </select>
            </div>
            <button className="w-full mt-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors">
              <FileText className="w-4 h-4" />
              Generate Content
            </button>
          </div>
        </Card>

        {/* Shopify Sync Status */}
        <Card title="Shopify Sync Status" subtitle="Content publishing integration">
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-success-50 border border-success-200 rounded-lg">
              <CheckCircle className="w-5 h-5 text-success-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-success-800">Connected & Syncing</p>
                <p className="text-xs text-success-600">Shopify store is actively connected</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-surface-500">Last Sync</span>
                <span className="text-sm font-medium text-surface-900">2026-02-25 14:32 UTC</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-surface-500">Items Synced</span>
                <span className="text-sm font-medium text-surface-900">76 / 89</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-surface-500">Sync Errors</span>
                <span className="text-sm font-medium text-danger-600">2</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-surface-500">Pending Sync</span>
                <span className="text-sm font-medium text-warning-600">11</span>
              </div>
            </div>

            <ProgressBar
              value={76}
              max={89}
              label="Sync Progress"
              showValue
              color="success"
              size="md"
            />

            <div className="pt-3 border-t border-surface-100 space-y-2">
              <p className="text-xs font-medium text-surface-500 uppercase tracking-wide">
                Recent Errors
              </p>
              <div className="flex items-start gap-2 text-xs text-danger-600 bg-danger-50 p-2 rounded-md">
                <span className="font-medium shrink-0">ERR:</span>
                <span>
                  "Les Meilleurs Produits Bio..." -- Image CDN timeout during upload
                </span>
              </div>
              <div className="flex items-start gap-2 text-xs text-danger-600 bg-danger-50 p-2 rounded-md">
                <span className="font-medium shrink-0">ERR:</span>
                <span>
                  "Yoga para Iniciantes..." -- Missing SEO meta description
                </span>
              </div>
            </div>

            <button className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-surface-200 rounded-lg text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors">
              <Globe className="w-4 h-4" />
              Force Sync Now
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
