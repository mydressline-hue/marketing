import { useState, useMemo, useCallback } from 'react';
import {
  Megaphone,
  Plus,
  Play,
  Pause,
  Filter,
  Download,
  TrendingUp,
  DollarSign,
  X,
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
import { TableSkeleton, ChartSkeleton } from '../components/shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../components/shared/ErrorBoundary';
import EmptyState from '../components/shared/EmptyState';
import { useApiQuery, useApiMutation } from '../hooks/useApi';
import api from '../services/api';
import type { CampaignData } from '../types';

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

interface CampaignsResponse {
  campaigns: CampaignData[];
  total: number;
}

interface CampaignMetrics {
  daily: { day: string; spend: number; conversions: number }[];
  platformRoas: { platform: string; roas: number }[];
  totals: {
    totalSpend: number;
    totalSpendChange: number;
    totalRevenue: number;
    totalRevenueChange: number;
    averageRoas: number;
    averageRoasChange: number;
    activeCampaigns: number;
    activeCampaignsChange: number;
  };
}

interface Recommendation {
  id: number;
  type: 'increase' | 'pause' | 'expand' | 'adjust';
  title: string;
  description: string;
  impact: string;
  urgency: 'high' | 'medium' | 'low';
}

interface RecommendationsResponse {
  recommendations: Recommendation[];
}

interface RetargetingAudience {
  name: string;
  size: number;
  matchRate: number;
  status: 'active' | 'paused';
  platforms: string[];
}

interface RetargetingResponse {
  audiences: RetargetingAudience[];
}

interface CampaignFormData {
  name: string;
  platform: string;
  country: string;
  budget: number;
  status: string;
}

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

// Map platform tab label -> API endpoint for platform-specific queries
const platformEndpoints: Record<string, string> = {
  Google: '/v1/integrations/ads/google/campaigns',
  Meta: '/v1/integrations/ads/meta/campaigns',
  TikTok: '/v1/integrations/ads/tiktok/campaigns',
};

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
// Campaign Modal
// ---------------------------------------------------------------------------

interface CampaignModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CampaignFormData) => void;
  loading: boolean;
  initial?: CampaignData | null;
}

function CampaignModal({ open, onClose, onSubmit, loading, initial }: CampaignModalProps) {
  const [form, setForm] = useState<CampaignFormData>({
    name: initial?.name || '',
    platform: initial?.platform || 'google',
    country: initial?.country || '',
    budget: initial?.budget || 0,
    status: initial?.status || 'draft',
  });

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
          <h3 className="font-semibold text-surface-900">
            {initial ? 'Edit Campaign' : 'New Campaign'}
          </h3>
          <button onClick={onClose} className="p-1 text-surface-400 hover:text-surface-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Campaign Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              placeholder="e.g. US - Brand Awareness Search"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Platform</label>
              <select
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              >
                {Object.entries(platformConfig).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Country</label>
              <input
                type="text"
                required
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                placeholder="e.g. United States"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Budget ($)</label>
              <input
                type="number"
                required
                min={0}
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-surface-600 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Saving...' : initial ? 'Update Campaign' : 'Create Campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PaidAds() {
  const [activePlatform, setActivePlatform] = useState<string>('All');
  const [showModal, setShowModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<CampaignData | null>(null);

  // -----------------------------------------------------------------------
  // API queries
  // -----------------------------------------------------------------------

  // Build the campaigns endpoint based on active platform filter
  const campaignsEndpoint = useMemo(() => {
    if (activePlatform !== 'All' && platformEndpoints[activePlatform]) {
      return platformEndpoints[activePlatform];
    }
    return '/v1/campaigns';
  }, [activePlatform]);

  const {
    data: campaignsData,
    loading: campaignsLoading,
    error: campaignsError,
    refetch: refetchCampaigns,
  } = useApiQuery<CampaignsResponse>(campaignsEndpoint);

  const {
    data: metricsData,
    loading: metricsLoading,
    error: metricsError,
    refetch: refetchMetrics,
  } = useApiQuery<CampaignMetrics>('/v1/campaigns/metrics');

  const {
    data: recommendationsData,
    loading: recommendationsLoading,
    error: recommendationsError,
    refetch: refetchRecommendations,
  } = useApiQuery<RecommendationsResponse>('/v1/campaigns/recommendations');

  const {
    data: retargetingData,
    loading: retargetingLoading,
    error: retargetingError,
    refetch: refetchRetargeting,
  } = useApiQuery<RetargetingResponse>('/v1/campaigns/retargeting');

  // -----------------------------------------------------------------------
  // API mutations
  // -----------------------------------------------------------------------

  const { mutate: createCampaign, loading: createLoading } =
    useApiMutation<CampaignData>('/v1/campaigns', { method: 'POST' });

  const { mutate: updateCampaign, loading: updateLoading } =
    useApiMutation<CampaignData>(
      editingCampaign ? `/v1/campaigns/${editingCampaign.id}` : '/v1/campaigns',
      { method: 'PUT' },
    );

  // -----------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------

  const campaigns = campaignsData?.campaigns ?? [];
  const dailyTrend = metricsData?.daily ?? [];
  const platformRoas = metricsData?.platformRoas ?? [];
  const totals = metricsData?.totals;
  const recommendations = recommendationsData?.recommendations ?? [];
  const retargetingAudiences = retargetingData?.audiences ?? [];

  // For platforms without a dedicated endpoint (Bing, Snapchat), do client-side filtering
  const filteredCampaigns = useMemo(() => {
    if (activePlatform === 'All' || platformEndpoints[activePlatform]) {
      return campaigns;
    }
    // Client-side filter for platforms without dedicated endpoints
    return campaigns.filter(
      (c) => platformConfig[c.platform]?.label === activePlatform,
    );
  }, [campaigns, activePlatform]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleToggleStatus = useCallback(
    async (campaign: CampaignData) => {
      const newStatus = campaign.status === 'active' ? 'paused' : 'active';
      try {
        await api.put(`/v1/campaigns/${campaign.id}/status`, { status: newStatus });
        refetchCampaigns();
      } catch {
        // Silently fail - error will be visible if refetch shows stale data
      }
    },
    [refetchCampaigns],
  );

  const handleCreateCampaign = useCallback(
    async (formData: CampaignFormData) => {
      const result = await createCampaign(formData);
      if (result) {
        setShowModal(false);
        refetchCampaigns();
        refetchMetrics();
      }
    },
    [createCampaign, refetchCampaigns, refetchMetrics],
  );

  const handleUpdateCampaign = useCallback(
    async (formData: CampaignFormData) => {
      const result = await updateCampaign(formData);
      if (result) {
        setEditingCampaign(null);
        setShowModal(false);
        refetchCampaigns();
        refetchMetrics();
      }
    },
    [updateCampaign, refetchCampaigns, refetchMetrics],
  );

  const openCreateModal = useCallback(() => {
    setEditingCampaign(null);
    setShowModal(true);
  }, []);

  const openEditModal = useCallback((campaign: CampaignData) => {
    setEditingCampaign(campaign);
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setEditingCampaign(null);
  }, []);

  // -----------------------------------------------------------------------
  // Table columns
  // -----------------------------------------------------------------------

  const columns = [
    {
      key: 'name',
      label: 'Campaign Name',
      render: (item: CampaignData) => (
        <button
          className="font-medium text-surface-900 hover:text-primary-600 transition-colors text-left"
          onClick={() => openEditModal(item)}
        >
          {item.name}
        </button>
      ),
    },
    {
      key: 'platform',
      label: 'Platform',
      render: (item: CampaignData) => {
        const cfg = platformConfig[item.platform];
        if (!cfg) return <span className="text-surface-400">--</span>;
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
        <StatusBadge status={item.status} />
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
        if (item.status === 'draft') return <span className="text-surface-400 text-xs">--</span>;
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleStatus(item);
            }}
            className={`p-1.5 rounded-lg transition-colors ${
              item.status === 'active'
                ? 'text-amber-600 hover:bg-amber-50'
                : 'text-green-600 hover:bg-green-50'
            }`}
            title={item.status === 'active' ? 'Pause campaign' : 'Resume campaign'}
          >
            {item.status === 'active' ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </button>
        );
      },
    },
  ];

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

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
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Campaign
            </button>
          </div>
        }
      />

      {/* KPI Row */}
      {metricsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-surface-200 p-5">
              <div className="animate-pulse">
                <div className="h-4 w-24 bg-surface-200 rounded mb-2" />
                <div className="h-8 w-20 bg-surface-200 rounded mb-2" />
                <div className="h-5 w-16 bg-surface-200 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : metricsError ? (
        <ApiErrorDisplay error={metricsError} onRetry={refetchMetrics} compact />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Total Ad Spend"
            value={totals ? fmtCurrency(totals.totalSpend).replace('$', '') : '--'}
            change={totals?.totalSpendChange ?? 0}
            trend={totals && totals.totalSpendChange >= 0 ? 'up' : 'down'}
            prefix="$"
          />
          <KPICard
            label="Total Revenue"
            value={totals ? fmtCurrency(totals.totalRevenue).replace('$', '') : '--'}
            change={totals?.totalRevenueChange ?? 0}
            trend={totals && totals.totalRevenueChange >= 0 ? 'up' : 'down'}
            prefix="$"
          />
          <KPICard
            label="Average ROAS"
            value={totals ? `${totals.averageRoas.toFixed(2)}x` : '--'}
            change={totals?.averageRoasChange ?? 0}
            trend={totals && totals.averageRoasChange >= 0 ? 'up' : 'down'}
          />
          <KPICard
            label="Active Campaigns"
            value={totals?.activeCampaigns ?? 0}
            change={totals?.activeCampaignsChange ?? 0}
            trend={totals && totals.activeCampaignsChange >= 0 ? 'up' : 'down'}
          />
        </div>
      )}

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
        subtitle={
          campaignsLoading
            ? 'Loading campaigns...'
            : `${filteredCampaigns.length} campaigns${activePlatform !== 'All' ? ` on ${activePlatform}` : ''}`
        }
        noPadding
      >
        {campaignsLoading ? (
          <TableSkeleton rows={6} columns={8} />
        ) : campaignsError ? (
          <ApiErrorDisplay
            error={campaignsError}
            onRetry={refetchCampaigns}
            title="Failed to load campaigns"
          />
        ) : filteredCampaigns.length === 0 ? (
          <EmptyState
            title="No campaigns found"
            description={
              activePlatform !== 'All'
                ? `No campaigns found for ${activePlatform}. Try selecting a different platform or create a new campaign.`
                : 'Get started by creating your first campaign.'
            }
            action={
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Campaign
              </button>
            }
          />
        ) : (
          <DataTable columns={columns as any} data={filteredCampaigns as unknown as Record<string, unknown>[]} />
        )}
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Spend vs Conversions */}
        <Card
          title="Performance Trend"
          subtitle="Daily spend vs conversions - last 14 days"
          actions={<TrendingUp className="w-4 h-4 text-surface-400" />}
        >
          {metricsLoading ? (
            <ChartSkeleton />
          ) : metricsError ? (
            <ApiErrorDisplay error={metricsError} onRetry={refetchMetrics} compact />
          ) : dailyTrend.length === 0 ? (
            <EmptyState title="No trend data" description="Performance data will appear once campaigns are active." />
          ) : (
            <>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11 }}
                      stroke="#9ca3af"
                      tickFormatter={(val: string) => val.replace(/^[A-Za-z]+ /, '')}
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
                      formatter={(value: number | undefined, name?: string) =>
                        name === 'spend' ? [`$${(value ?? 0).toLocaleString()}`, 'Spend'] : [value ?? 0, 'Conversions']
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
            </>
          )}
        </Card>

        {/* ROAS by Platform */}
        <Card
          title="ROAS by Platform"
          subtitle="Cross-platform return comparison"
          actions={<DollarSign className="w-4 h-4 text-surface-400" />}
        >
          {metricsLoading ? (
            <ChartSkeleton />
          ) : metricsError ? (
            <ApiErrorDisplay error={metricsError} onRetry={refetchMetrics} compact />
          ) : platformRoas.length === 0 ? (
            <EmptyState title="No ROAS data" description="Platform ROAS data will appear once campaigns generate revenue." />
          ) : (
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
                    formatter={(value: number | undefined) => [`${(value ?? 0).toFixed(2)}x`, 'ROAS']}
                  />
                  <Bar dataKey="roas" radius={[6, 6, 0, 0]} name="ROAS">
                    {platformRoas.map((_, index) => {
                      const colors = ['#3b82f6', '#6366f1', '#ec4899', '#14b8a6', '#eab308'];
                      return (
                        <rect key={`cell-${index}`} fill={colors[index % colors.length]} />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
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
            !recommendationsLoading && !recommendationsError && recommendations.length > 0 ? (
              <span className="flex items-center gap-1 text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                {recommendations.length} actions
              </span>
            ) : undefined
          }
        >
          {recommendationsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-lg border-l-4 border-l-surface-200 bg-surface-50 p-4">
                  <div className="h-4 w-24 bg-surface-200 rounded mb-2" />
                  <div className="h-4 w-48 bg-surface-200 rounded mb-2" />
                  <div className="h-3 w-full bg-surface-200 rounded mb-1" />
                  <div className="h-3 w-3/4 bg-surface-200 rounded" />
                </div>
              ))}
            </div>
          ) : recommendationsError ? (
            <ApiErrorDisplay error={recommendationsError} onRetry={refetchRecommendations} />
          ) : recommendations.length === 0 ? (
            <EmptyState
              title="No recommendations"
              description="AI recommendations will appear as campaigns gather enough data for optimization."
            />
          ) : (
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
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${recommendationIcon[rec.type]?.color ?? 'text-surface-600 bg-surface-100'}`}
                        >
                          {recommendationIcon[rec.type]?.icon ?? rec.type}
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
          )}
        </Card>

        {/* Retargeting Status */}
        <Card
          title="Retargeting Audiences"
          subtitle="Active audience segments"
        >
          {retargetingLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-lg border border-surface-200 p-3">
                  <div className="h-4 w-32 bg-surface-200 rounded mb-3" />
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className="h-3 w-16 bg-surface-200 rounded" />
                    <div className="h-3 w-16 bg-surface-200 rounded" />
                  </div>
                  <div className="h-1.5 w-full bg-surface-200 rounded-full" />
                </div>
              ))}
            </div>
          ) : retargetingError ? (
            <ApiErrorDisplay error={retargetingError} onRetry={refetchRetargeting} />
          ) : retargetingAudiences.length === 0 ? (
            <EmptyState
              title="No audiences"
              description="Retargeting audiences will be generated from campaign activity."
            />
          ) : (
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
          )}
        </Card>
      </div>

      {/* Campaign Create / Edit Modal */}
      <CampaignModal
        open={showModal}
        onClose={closeModal}
        onSubmit={editingCampaign ? handleUpdateCampaign : handleCreateCampaign}
        loading={editingCampaign ? updateLoading : createLoading}
        initial={editingCampaign}
      />
    </div>
  );
}
