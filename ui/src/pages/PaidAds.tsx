import { useState } from 'react';
import {
  Megaphone,
  Plus,
  Play,
  Pause,
  Filter,
  Download,
  TrendingUp,
  DollarSign,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import KPICard from '../components/shared/KPICard';
import StatusBadge from '../components/shared/StatusBadge';
import DataTable from '../components/shared/DataTable';
import type { CampaignData } from '../types';

// ---------------------------------------------------------------------------
// Platform colors & labels
// ---------------------------------------------------------------------------

const platformConfig: Record<
  string,
  { color: string; bg: string; label: string }
> = {
  google: { color: 'text-blue-600', bg: 'bg-blue-50', label: 'Google' },
  meta: { color: 'text-indigo-600', bg: 'bg-indigo-50', label: 'Meta' },
  tiktok: { color: 'text-pink-600', bg: 'bg-pink-50', label: 'TikTok' },
  bing: { color: 'text-teal-600', bg: 'bg-teal-50', label: 'Bing' },
  snapchat: { color: 'text-yellow-600', bg: 'bg-yellow-50', label: 'Snapchat' },
};

const platformTabs = ['All', 'Google', 'Meta', 'TikTok', 'Bing', 'Snapchat'] as const;

// ---------------------------------------------------------------------------
// Mock campaign data (10 campaigns)
// ---------------------------------------------------------------------------

const campaigns: CampaignData[] = [
  {
    id: 'c1',
    name: 'US - Brand Awareness Search',
    platform: 'google',
    country: 'United States',
    status: 'active',
    budget: 12000,
    spent: 9840,
    impressions: 1420000,
    clicks: 42600,
    conversions: 1278,
    roas: 5.12,
    cpc: 0.23,
    ctr: 3.0,
  },
  {
    id: 'c2',
    name: 'UK - Retargeting Lookalike',
    platform: 'meta',
    country: 'United Kingdom',
    status: 'active',
    budget: 8500,
    spent: 7650,
    impressions: 980000,
    clicks: 29400,
    conversions: 882,
    roas: 4.85,
    cpc: 0.26,
    ctr: 3.0,
  },
  {
    id: 'c3',
    name: 'DE - Product Launch Video',
    platform: 'tiktok',
    country: 'Germany',
    status: 'active',
    budget: 6000,
    spent: 5100,
    impressions: 2150000,
    clicks: 64500,
    conversions: 645,
    roas: 3.78,
    cpc: 0.08,
    ctr: 3.0,
  },
  {
    id: 'c4',
    name: 'CA - Shopping Campaigns',
    platform: 'google',
    country: 'Canada',
    status: 'active',
    budget: 9200,
    spent: 8280,
    impressions: 760000,
    clicks: 22800,
    conversions: 912,
    roas: 4.61,
    cpc: 0.36,
    ctr: 3.0,
  },
  {
    id: 'c5',
    name: 'AU - Carousel Engagement',
    platform: 'meta',
    country: 'Australia',
    status: 'paused',
    budget: 5500,
    spent: 3300,
    impressions: 430000,
    clicks: 12900,
    conversions: 258,
    roas: 2.18,
    cpc: 0.26,
    ctr: 3.0,
  },
  {
    id: 'c6',
    name: 'FR - Dynamic Search Ads',
    platform: 'bing',
    country: 'France',
    status: 'active',
    budget: 4800,
    spent: 4080,
    impressions: 520000,
    clicks: 15600,
    conversions: 468,
    roas: 3.92,
    cpc: 0.26,
    ctr: 3.0,
  },
  {
    id: 'c7',
    name: 'US - Gen Z Snap Stories',
    platform: 'snapchat',
    country: 'United States',
    status: 'active',
    budget: 3800,
    spent: 3040,
    impressions: 1850000,
    clicks: 37000,
    conversions: 370,
    roas: 3.45,
    cpc: 0.08,
    ctr: 2.0,
  },
  {
    id: 'c8',
    name: 'UK - Performance Max',
    platform: 'google',
    country: 'United Kingdom',
    status: 'active',
    budget: 11000,
    spent: 9900,
    impressions: 1100000,
    clicks: 33000,
    conversions: 1320,
    roas: 5.38,
    cpc: 0.30,
    ctr: 3.0,
  },
  {
    id: 'c9',
    name: 'DE - UGC Creator Ads',
    platform: 'tiktok',
    country: 'Germany',
    status: 'draft',
    budget: 7000,
    spent: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    roas: 0,
    cpc: 0,
    ctr: 0,
  },
  {
    id: 'c10',
    name: 'CA - Bing Shopping Feed',
    platform: 'bing',
    country: 'Canada',
    status: 'paused',
    budget: 3200,
    spent: 1920,
    impressions: 245000,
    clicks: 4900,
    conversions: 147,
    roas: 2.54,
    cpc: 0.39,
    ctr: 2.0,
  },
];

// ---------------------------------------------------------------------------
// Performance trend data (14 days)
// ---------------------------------------------------------------------------

const dailyTrend = [
  { day: 'Feb 1', spend: 6100, conversions: 182 },
  { day: 'Feb 2', spend: 5800, conversions: 174 },
  { day: 'Feb 3', spend: 6400, conversions: 196 },
  { day: 'Feb 4', spend: 6700, conversions: 201 },
  { day: 'Feb 5', spend: 7100, conversions: 218 },
  { day: 'Feb 6', spend: 6900, conversions: 210 },
  { day: 'Feb 7', spend: 5500, conversions: 165 },
  { day: 'Feb 8', spend: 6300, conversions: 189 },
  { day: 'Feb 9', spend: 6600, conversions: 198 },
  { day: 'Feb 10', spend: 7200, conversions: 224 },
  { day: 'Feb 11', spend: 7400, conversions: 237 },
  { day: 'Feb 12', spend: 7000, conversions: 220 },
  { day: 'Feb 13', spend: 6800, conversions: 212 },
  { day: 'Feb 14', spend: 7500, conversions: 245 },
];

// ---------------------------------------------------------------------------
// Platform ROAS comparison
// ---------------------------------------------------------------------------

const platformRoas = [
  { platform: 'Google', roas: 5.04 },
  { platform: 'Meta', roas: 4.15 },
  { platform: 'TikTok', roas: 3.78 },
  { platform: 'Bing', roas: 3.42 },
  { platform: 'Snapchat', roas: 3.45 },
];

// ---------------------------------------------------------------------------
// AI Recommendations
// ---------------------------------------------------------------------------

const recommendations = [
  {
    id: 1,
    type: 'increase' as const,
    title: 'Scale UK Performance Max Campaign',
    description:
      'Campaign "UK - Performance Max" is delivering 5.38x ROAS, significantly above target. Recommend increasing daily budget by 30% to capture additional conversion volume.',
    impact: '+$12K estimated monthly revenue',
    urgency: 'high' as const,
  },
  {
    id: 2,
    type: 'pause' as const,
    title: 'Pause AU Carousel Engagement',
    description:
      'The "AU - Carousel Engagement" campaign has fallen below the 2.5x ROAS threshold for 7 consecutive days. Creative fatigue detected across all ad sets.',
    impact: 'Save $2.2K/month in wasted spend',
    urgency: 'high' as const,
  },
  {
    id: 3,
    type: 'expand' as const,
    title: 'Expand Google Shopping to Netherlands',
    description:
      'Market Scanner detected CPA in the Netherlands is 28% lower than comparable EU markets. Recommend launching a Google Shopping campaign mirroring the DE strategy.',
    impact: '+$8K potential monthly revenue',
    urgency: 'medium' as const,
  },
  {
    id: 4,
    type: 'adjust' as const,
    title: 'Switch TikTok DE to Target CPA Bidding',
    description:
      'Current manual bidding on "DE - Product Launch Video" is leaving impressions on the table. AI model predicts a 15% conversion lift with Target CPA at $4.20.',
    impact: '+96 additional conversions/month',
    urgency: 'medium' as const,
  },
];

// ---------------------------------------------------------------------------
// Retargeting audiences
// ---------------------------------------------------------------------------

const retargetingAudiences = [
  {
    name: 'Cart Abandoners (7d)',
    size: 42300,
    matchRate: 78,
    status: 'active' as const,
    platforms: ['Google', 'Meta'],
  },
  {
    name: 'Product Viewers (14d)',
    size: 128500,
    matchRate: 65,
    status: 'active' as const,
    platforms: ['Google', 'Meta', 'TikTok'],
  },
  {
    name: 'Past Purchasers (90d)',
    size: 18700,
    matchRate: 82,
    status: 'active' as const,
    platforms: ['Meta', 'Snapchat'],
  },
  {
    name: 'High-Value Lookalike (1%)',
    size: 2100000,
    matchRate: 91,
    status: 'active' as const,
    platforms: ['Google', 'Meta', 'TikTok'],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtCurrency = (val: number) =>
  val >= 1_000_000
    ? `$${(val / 1_000_000).toFixed(1)}M`
    : val >= 1_000
      ? `$${(val / 1_000).toFixed(1)}K`
      : `$${val.toFixed(0)}`;

const fmtNumber = (val: number) =>
  val >= 1_000_000
    ? `${(val / 1_000_000).toFixed(1)}M`
    : val >= 1_000
      ? `${(val / 1_000).toFixed(1)}K`
      : val.toLocaleString();

const urgencyStyle: Record<string, string> = {
  high: 'border-l-red-500 bg-red-50/60',
  medium: 'border-l-yellow-500 bg-yellow-50/60',
  low: 'border-l-blue-500 bg-blue-50/60',
};

const recommendationIcon: Record<string, { icon: string; color: string }> = {
  increase: { icon: 'Increase Budget', color: 'text-green-600 bg-green-50' },
  pause: { icon: 'Pause Campaign', color: 'text-red-600 bg-red-50' },
  expand: { icon: 'New Market', color: 'text-blue-600 bg-blue-50' },
  adjust: { icon: 'Adjust Bidding', color: 'text-amber-600 bg-amber-50' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PaidAds() {
  const [activePlatform, setActivePlatform] = useState<string>('All');
  const [campaignStatuses, setCampaignStatuses] = useState<Record<string, string>>(
    () => Object.fromEntries(campaigns.map((c) => [c.id, c.status]))
  );

  const filteredCampaigns = campaigns.filter((c) => {
    if (activePlatform === 'All') return true;
    return platformConfig[c.platform]?.label === activePlatform;
  });

  const toggleCampaignStatus = (id: string) => {
    setCampaignStatuses((prev) => ({
      ...prev,
      [id]: prev[id] === 'active' ? 'paused' : 'active',
    }));
  };

  // Table columns
  const columns = [
    {
      key: 'name',
      label: 'Campaign Name',
      render: (item: CampaignData) => (
        <span className="font-medium text-surface-900">{item.name}</span>
      ),
    },
    {
      key: 'platform',
      label: 'Platform',
      render: (item: CampaignData) => {
        const cfg = platformConfig[item.platform];
        return (
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color} ${cfg.bg}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {cfg.label}
          </span>
        );
      },
    },
    {
      key: 'country',
      label: 'Country',
      render: (item: CampaignData) => (
        <span className="text-surface-700">{item.country}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (item: CampaignData) => (
        <StatusBadge status={campaignStatuses[item.id] || item.status} />
      ),
    },
    {
      key: 'budget',
      label: 'Budget',
      render: (item: CampaignData) => (
        <span className="text-surface-700">{fmtCurrency(item.budget)}</span>
      ),
    },
    {
      key: 'spent',
      label: 'Spend',
      render: (item: CampaignData) => (
        <span className="font-medium text-surface-900">{fmtCurrency(item.spent)}</span>
      ),
    },
    {
      key: 'impressions',
      label: 'Impressions',
      render: (item: CampaignData) => (
        <span className="text-surface-700">{fmtNumber(item.impressions)}</span>
      ),
    },
    {
      key: 'clicks',
      label: 'Clicks',
      render: (item: CampaignData) => (
        <span className="text-surface-700">{fmtNumber(item.clicks)}</span>
      ),
    },
    {
      key: 'ctr',
      label: 'CTR',
      render: (item: CampaignData) => (
        <span className="text-surface-700">{item.ctr.toFixed(1)}%</span>
      ),
    },
    {
      key: 'conversions',
      label: 'Conversions',
      render: (item: CampaignData) => (
        <span className="font-medium text-surface-900">{item.conversions.toLocaleString()}</span>
      ),
    },
    {
      key: 'roas',
      label: 'ROAS',
      render: (item: CampaignData) => {
        const roasVal = item.roas;
        const color =
          roasVal >= 4
            ? 'text-green-600 bg-green-50'
            : roasVal >= 3
              ? 'text-blue-600 bg-blue-50'
              : roasVal > 0
                ? 'text-amber-600 bg-amber-50'
                : 'text-surface-400 bg-surface-50';
        return (
          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${color}`}>
            {roasVal > 0 ? `${roasVal.toFixed(2)}x` : '--'}
          </span>
        );
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (item: CampaignData) => {
        const currentStatus = campaignStatuses[item.id] || item.status;
        if (currentStatus === 'draft') return <span className="text-surface-400 text-xs">--</span>;
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleCampaignStatus(item.id);
            }}
            className={`p-1.5 rounded-lg transition-colors ${
              currentStatus === 'active'
                ? 'text-amber-600 hover:bg-amber-50'
                : 'text-green-600 hover:bg-green-50'
            }`}
            title={currentStatus === 'active' ? 'Pause campaign' : 'Resume campaign'}
          >
            {currentStatus === 'active' ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </button>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Paid Ads Architecture"
        subtitle="Multi-Platform Campaign Management & Smart Bidding"
        icon={<Megaphone className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-surface-600 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors">
              <Filter className="w-4 h-4" />
              Filters
            </button>
            <button className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-surface-600 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors">
              <Download className="w-4 h-4" />
              Export
            </button>
            <button className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors">
              <Plus className="w-4 h-4" />
              New Campaign
            </button>
          </div>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Total Ad Spend"
          value="184K"
          change={9.2}
          trend="up"
          prefix="$"
        />
        <KPICard
          label="Total Revenue"
          value="782K"
          change={14.8}
          trend="up"
          prefix="$"
        />
        <KPICard
          label="Average ROAS"
          value="4.25x"
          change={6.3}
          trend="up"
        />
        <KPICard
          label="Active Campaigns"
          value={47}
          change={4.1}
          trend="up"
        />
      </div>

      {/* Platform Filter Tabs */}
      <div className="flex items-center gap-1 bg-surface-100 rounded-lg p-1 w-fit">
        {platformTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActivePlatform(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activePlatform === tab
                ? 'bg-white text-surface-900 shadow-sm'
                : 'text-surface-500 hover:text-surface-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Campaign Performance Table */}
      <Card
        title="Campaign Performance"
        subtitle={`${filteredCampaigns.length} campaigns${activePlatform !== 'All' ? ` on ${activePlatform}` : ''}`}
        noPadding
      >
        <DataTable columns={columns} data={filteredCampaigns as unknown as Record<string, unknown>[]} />
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Spend vs Conversions */}
        <Card
          title="Performance Trend"
          subtitle="Daily spend vs conversions - last 14 days"
          actions={<TrendingUp className="w-4 h-4 text-surface-400" />}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11 }}
                  stroke="#9ca3af"
                  tickFormatter={(val: string) => val.replace('Feb ', '')}
                />
                <YAxis
                  yAxisId="spend"
                  tick={{ fontSize: 11 }}
                  stroke="#9ca3af"
                  tickFormatter={(val: number) => `$${(val / 1000).toFixed(0)}K`}
                />
                <YAxis
                  yAxisId="conversions"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  stroke="#9ca3af"
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                  }}
                  formatter={(value: number, name: string) =>
                    name === 'spend' ? [`$${value.toLocaleString()}`, 'Spend'] : [value, 'Conversions']
                  }
                />
                <Line
                  yAxisId="spend"
                  type="monotone"
                  dataKey="spend"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                  name="spend"
                />
                <Line
                  yAxisId="conversions"
                  type="monotone"
                  dataKey="conversions"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  name="conversions"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 mt-2 text-xs text-surface-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-indigo-500 rounded" /> Spend
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-green-500 rounded" /> Conversions
            </span>
          </div>
        </Card>

        {/* ROAS by Platform */}
        <Card
          title="ROAS by Platform"
          subtitle="Cross-platform return comparison"
          actions={<DollarSign className="w-4 h-4 text-surface-400" />}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={platformRoas} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="platform" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                  tickFormatter={(val: number) => `${val}x`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                  }}
                  formatter={(value: number) => [`${value.toFixed(2)}x`, 'ROAS']}
                />
                <Bar dataKey="roas" radius={[6, 6, 0, 0]} name="ROAS">
                  {platformRoas.map((entry, index) => {
                    const colors = ['#3b82f6', '#6366f1', '#ec4899', '#14b8a6', '#eab308'];
                    return (
                      <rect key={`cell-${index}`} fill={colors[index % colors.length]} />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* AI Recommendations + Retargeting */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Recommendations */}
        <Card
          title="AI Recommendations"
          subtitle="Smart optimization suggestions"
          className="lg:col-span-2"
          actions={
            <span className="flex items-center gap-1 text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
              4 actions
            </span>
          }
        >
          <div className="space-y-3">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className={`rounded-lg border-l-4 p-4 ${urgencyStyle[rec.urgency]}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${recommendationIcon[rec.type].color}`}
                      >
                        {recommendationIcon[rec.type].icon}
                      </span>
                      {rec.urgency === 'high' && (
                        <span className="text-xs font-medium text-red-600">High Priority</span>
                      )}
                    </div>
                    <h4 className="text-sm font-semibold text-surface-900 mb-1">{rec.title}</h4>
                    <p className="text-xs text-surface-600 leading-relaxed">{rec.description}</p>
                    <p className="text-xs font-medium text-green-700 mt-2">{rec.impact}</p>
                  </div>
                  <button className="shrink-0 px-3 py-1.5 text-xs font-medium text-primary-600 bg-white border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors">
                    Apply
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Retargeting Status */}
        <Card
          title="Retargeting Audiences"
          subtitle="Active audience segments"
        >
          <div className="space-y-4">
            {retargetingAudiences.map((audience) => (
              <div
                key={audience.name}
                className="rounded-lg border border-surface-200 p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-surface-900">{audience.name}</h4>
                  <StatusBadge status={audience.status} size="sm" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                  <div>
                    <span className="text-surface-500">Size</span>
                    <p className="font-medium text-surface-800">{fmtNumber(audience.size)}</p>
                  </div>
                  <div>
                    <span className="text-surface-500">Match Rate</span>
                    <p className="font-medium text-surface-800">{audience.matchRate}%</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {audience.platforms.map((p) => (
                    <span
                      key={p}
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-100 text-surface-600"
                    >
                      {p}
                    </span>
                  ))}
                </div>
                {/* Match rate bar */}
                <div className="w-full bg-surface-100 rounded-full h-1.5 mt-2">
                  <div
                    className="bg-indigo-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${audience.matchRate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
