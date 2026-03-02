import { useState } from 'react';
import {
  Palette,
  Image,
  Video,
  Type,
  Wand2,
  Download,
  Copy,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import KPICard from '../components/shared/KPICard';
import StatusBadge from '../components/shared/StatusBadge';
import { KPIRowSkeleton, GallerySkeleton, ListSkeleton } from '../components/shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../components/shared/ErrorBoundary';
import EmptyState from '../components/shared/EmptyState';
import { useApiQuery, useApiMutation } from '../hooks/useApi';
import type { KPIData } from '../types';

// --- Types ---

type CreativeType = 'ad_copy' | 'video_script' | 'ugc_script' | 'image' | 'thumbnail';

interface CreativeItem {
  id: string;
  title: string;
  type: CreativeType;
  preview: string;
  platform: string;
  country: string;
  performanceScore: number;
  status: 'active' | 'draft' | 'review';
  colorPlaceholder?: string;
}

interface TopPerformingCreative {
  id: string;
  title: string;
  type: string;
  score: number;
  impressions: string;
  ctr: string;
  conversions: number;
}

interface FatigueAlert {
  id: string;
  creative: string;
  platform: string;
  frequency: number;
  threshold: number;
  daysActive: number;
  recommendation: string;
}

interface BrandToneCheck {
  label: string;
  status: 'compliant' | 'warning' | 'violation';
  score: number;
}

interface CreativesApiResponse {
  kpis: KPIData[];
  creatives: CreativeItem[];
  topPerforming: TopPerformingCreative[];
  fatigueAlerts: FatigueAlert[];
  brandToneChecks: BrandToneCheck[];
}

interface AgentExecuteResponse {
  creative: CreativeItem;
  message: string;
}

// --- Constants ---

const creativeTypeLabels: Record<CreativeType, string> = {
  ad_copy: 'Ad Copy',
  video_script: 'Video Script',
  ugc_script: 'UGC Script',
  image: 'Image',
  thumbnail: 'Thumbnail',
};

const tabOptions = [
  { key: 'all', label: 'All' },
  { key: 'ad_copy', label: 'Ad Copy' },
  { key: 'video_script', label: 'Video Scripts' },
  { key: 'ugc_script', label: 'UGC Scripts' },
  { key: 'image', label: 'Images' },
  { key: 'thumbnail', label: 'Thumbnails' },
];

// --- Component ---

export default function CreativeStudio() {
  const [activeTab, setActiveTab] = useState('all');
  const [genProduct, setGenProduct] = useState('');
  const [genPlatform, setGenPlatform] = useState('Meta');
  const [genCountry, setGenCountry] = useState('US');
  const [genTone, setGenTone] = useState('Professional');
  const [genType, setGenType] = useState<CreativeType>('ad_copy');
  const [genResult, setGenResult] = useState<string | null>(null);

  // --- API Calls ---
  const {
    data: creativesData,
    loading: creativesLoading,
    error: creativesError,
    refetch: refetchCreatives,
  } = useApiQuery<CreativesApiResponse>('/v1/creatives');

  const {
    mutate: generateCreative,
    loading: generating,
    error: generateError,
  } = useApiMutation<AgentExecuteResponse>('/v1/agents/creative-studio/run', { method: 'POST' });

  const {
    mutate: createCreative,
    loading: creating,
  } = useApiMutation<CreativeItem>('/v1/creatives', { method: 'POST' });

  // --- Derived Data ---
  const kpis = creativesData?.kpis ?? [];
  const creativeItems = creativesData?.creatives ?? [];
  const topPerforming = creativesData?.topPerforming ?? [];
  const fatigueAlerts = creativesData?.fatigueAlerts ?? [];
  const brandToneChecks = creativesData?.brandToneChecks ?? [];

  const filteredCreatives =
    activeTab === 'all'
      ? creativeItems
      : creativeItems.filter((c) => c.type === activeTab);

  const overallCompliance =
    brandToneChecks.length > 0
      ? Math.round(
          brandToneChecks.reduce((sum, c) => sum + c.score, 0) /
            brandToneChecks.length
        )
      : 0;

  // --- Handlers ---
  const handleGenerate = async () => {
    if (!genProduct.trim()) return;

    setGenResult(null);
    const result = await generateCreative({
      product: genProduct,
      platform: genPlatform,
      country: genCountry,
      tone: genTone,
      creativeType: genType,
    });

    if (result) {
      setGenResult(result.message || 'Creative generated successfully!');
      // Save the generated creative
      await createCreative(result.creative);
      refetchCreatives();
    }
  };

  const handleRegenerate = async (item: CreativeItem) => {
    await generateCreative({
      product: item.title,
      platform: item.platform,
      country: item.country,
      tone: 'Professional',
      creativeType: item.type,
      regenerateFrom: item.id,
    });
    refetchCreatives();
  };

  const handleGenerateReplacement = async (alert: FatigueAlert) => {
    await generateCreative({
      product: alert.creative,
      platform: alert.platform,
      country: 'US',
      tone: 'Professional',
      creativeType: 'ad_copy',
      replaceFatigued: alert.id,
    });
    refetchCreatives();
  };

  // --- Helpers ---
  const typeIcon = (type: CreativeType) => {
    switch (type) {
      case 'ad_copy':
        return <Type className="w-3.5 h-3.5" />;
      case 'video_script':
      case 'ugc_script':
        return <Video className="w-3.5 h-3.5" />;
      case 'image':
        return <Image className="w-3.5 h-3.5" />;
      case 'thumbnail':
        return <Palette className="w-3.5 h-3.5" />;
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 8.5) return 'text-success-700 bg-success-50';
    if (score >= 7.0) return 'text-primary-700 bg-primary-50';
    return 'text-warning-700 bg-warning-50';
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Creative Studio"
        subtitle="AI-Powered Ad Copy, Video Scripts & Visual Generation"
        icon={<Palette className="w-5 h-5" />}
        actions={
          <button
            onClick={() => {
              const el = document.getElementById('ai-generation-panel');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            <Wand2 className="w-4 h-4" />
            New Creative
          </button>
        }
      />

      {/* KPI Row */}
      {creativesError && (
        <ApiErrorDisplay
          error={creativesError}
          onRetry={refetchCreatives}
          compact
        />
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {creativesLoading ? (
          <KPIRowSkeleton count={4} />
        ) : (
          kpis.map((kpi) => (
            <KPICard key={kpi.label} {...kpi} />
          ))
        )}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Gallery (2 cols) */}
        <div className="xl:col-span-2 space-y-6">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-surface-100 dark:bg-surface-700 rounded-lg p-1 overflow-x-auto">
            {tabOptions.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 shadow-sm'
                    : 'text-surface-600 dark:text-surface-300 hover:text-surface-800 dark:hover:text-surface-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Creative Gallery Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {creativesLoading ? (
              <GallerySkeleton count={4} />
            ) : filteredCreatives.length === 0 ? (
              <div className="md:col-span-2">
                <EmptyState
                  icon={<Palette className="w-6 h-6" />}
                  title="No creatives found"
                  description={
                    activeTab === 'all'
                      ? 'Get started by generating your first creative with the AI panel.'
                      : `No ${tabOptions.find((t) => t.key === activeTab)?.label ?? ''} creatives yet. Generate one using the AI panel.`
                  }
                  action={
                    <button
                      onClick={() => {
                        const el = document.getElementById('ai-generation-panel');
                        el?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
                    >
                      <Sparkles className="w-4 h-4" />
                      Generate Creative
                    </button>
                  }
                />
              </div>
            ) : (
              filteredCreatives.map((item) => (
                <div
                  key={item.id}
                  className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden hover:shadow-md transition-shadow"
                >
                  {/* Preview Area */}
                  {item.colorPlaceholder ? (
                    <div
                      className={`h-36 bg-gradient-to-br ${item.colorPlaceholder} flex items-center justify-center`}
                    >
                      <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3">
                        <Image className="w-8 h-8 text-white" />
                      </div>
                    </div>
                  ) : (
                    <div className="h-36 bg-surface-50 dark:bg-surface-800 p-4 border-b border-surface-100 dark:border-surface-700">
                      <p className="text-xs text-surface-600 dark:text-surface-300 leading-relaxed line-clamp-5">
                        {item.preview}
                      </p>
                    </div>
                  )}

                  {/* Card Body */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold text-surface-900 dark:text-surface-100 leading-tight">
                        {item.title}
                      </h4>
                      <span
                        className={`shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${scoreColor(
                          item.performanceScore
                        )}`}
                      >
                        {item.performanceScore}
                      </span>
                    </div>

                    {/* Meta Row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-surface-600 dark:text-surface-300 bg-surface-100 dark:bg-surface-700 rounded-full px-2 py-0.5">
                        {typeIcon(item.type)}
                        {creativeTypeLabels[item.type]}
                      </span>
                      <span className="text-xs text-surface-500 dark:text-surface-400">
                        {item.platform}
                      </span>
                      <span className="text-xs text-surface-400 dark:text-surface-500">|</span>
                      <span className="text-xs text-surface-500 dark:text-surface-400">
                        {item.country}
                      </span>
                      <StatusBadge status={item.status} />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 pt-1 border-t border-surface-100 dark:border-surface-700">
                      <button
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700 rounded-md transition-colors"
                        title="Copy"
                        onClick={() => navigator.clipboard.writeText(item.preview)}
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </button>
                      <button
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700 rounded-md transition-colors"
                        title="Download"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </button>
                      <button
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700 rounded-md transition-colors"
                        title="Edit"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-primary-600 hover:bg-primary-50 rounded-md transition-colors ml-auto disabled:opacity-50"
                        title="Regenerate"
                        disabled={generating}
                        onClick={() => handleRegenerate(item)}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
                        Regenerate
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* AI Generation Panel */}
          <Card
            title="AI Generation"
            subtitle="Create new creatives with AI"
          >
            <div id="ai-generation-panel" className="space-y-4">
              {/* Product / Brand */}
              <div>
                <label className="block text-xs font-medium text-surface-700 dark:text-surface-200 mb-1">
                  Product / Brand
                </label>
                <input
                  type="text"
                  value={genProduct}
                  onChange={(e) => setGenProduct(e.target.value)}
                  placeholder="e.g. ProGlow Skincare Serum"
                  className="w-full px-3 py-2 border border-surface-200 dark:border-surface-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-surface-800 dark:text-surface-100"
                />
              </div>

              {/* Platform */}
              <div>
                <label className="block text-xs font-medium text-surface-700 dark:text-surface-200 mb-1">
                  Platform
                </label>
                <select
                  value={genPlatform}
                  onChange={(e) => setGenPlatform(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-200 dark:border-surface-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-surface-800 dark:text-surface-100"
                >
                  <option>Meta</option>
                  <option>Google</option>
                  <option>TikTok</option>
                  <option>Instagram</option>
                  <option>YouTube</option>
                  <option>Snapchat</option>
                </select>
              </div>

              {/* Country */}
              <div>
                <label className="block text-xs font-medium text-surface-700 dark:text-surface-200 mb-1">
                  Country
                </label>
                <select
                  value={genCountry}
                  onChange={(e) => setGenCountry(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-200 dark:border-surface-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-surface-800 dark:text-surface-100"
                >
                  <option value="US">United States</option>
                  <option value="UK">United Kingdom</option>
                  <option value="DE">Germany</option>
                  <option value="JP">Japan</option>
                  <option value="BR">Brazil</option>
                  <option value="FR">France</option>
                  <option value="IN">India</option>
                </select>
              </div>

              {/* Tone */}
              <div>
                <label className="block text-xs font-medium text-surface-700 dark:text-surface-200 mb-1">
                  Tone
                </label>
                <select
                  value={genTone}
                  onChange={(e) => setGenTone(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-200 dark:border-surface-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-surface-800 dark:text-surface-100"
                >
                  <option>Professional</option>
                  <option>Casual</option>
                  <option>Bold</option>
                  <option>Playful</option>
                </select>
              </div>

              {/* Creative Type */}
              <div>
                <label className="block text-xs font-medium text-surface-700 dark:text-surface-200 mb-1">
                  Creative Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      'ad_copy',
                      'video_script',
                      'ugc_script',
                      'image',
                      'thumbnail',
                    ] as CreativeType[]
                  ).map((t) => (
                    <button
                      key={t}
                      onClick={() => setGenType(t)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        genType === t
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 hover:border-surface-300 dark:hover:border-surface-500'
                      }`}
                    >
                      {typeIcon(t)}
                      {creativeTypeLabels[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generation Error */}
              {generateError && (
                <ApiErrorDisplay error={generateError} compact />
              )}

              {/* Generation Success */}
              {genResult && (
                <div className="p-3 rounded-lg bg-success-50 border border-success-200">
                  <p className="text-sm text-success-700">{genResult}</p>
                </div>
              )}

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={generating || creating || !genProduct.trim()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating || creating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Creative
                  </>
                )}
              </button>
            </div>
          </Card>

          {/* Brand Tone Consistency Checker */}
          <Card title="Brand Tone Compliance" subtitle="Real-time consistency checks">
            {creativesLoading ? (
              <ListSkeleton rows={4} />
            ) : brandToneChecks.length === 0 ? (
              <EmptyState
                title="No compliance data"
                description="Brand tone checks will appear once creatives are analyzed."
              />
            ) : (
              <div className="space-y-3">
                {brandToneChecks.map((check) => (
                  <div
                    key={check.label}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <StatusBadge status={check.status} />
                      <span className="text-sm text-surface-700 dark:text-surface-200">
                        {check.label}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-surface-900 dark:text-surface-100">
                      {check.score}%
                    </span>
                  </div>
                ))}
                <div className="pt-3 border-t border-surface-100 dark:border-surface-700">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-surface-700 dark:text-surface-200">
                      Overall Compliance
                    </span>
                    <span className="font-bold text-success-700">{overallCompliance}%</span>
                  </div>
                  <div className="mt-2 w-full bg-surface-100 dark:bg-surface-700 rounded-full h-2">
                    <div
                      className="bg-success-500 h-2 rounded-full transition-all"
                      style={{ width: `${overallCompliance}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Top Performing Creatives */}
          <Card title="Top Performing Creatives" subtitle="Highest scoring active creatives">
            {creativesLoading ? (
              <ListSkeleton rows={3} />
            ) : topPerforming.length === 0 ? (
              <EmptyState
                title="No performance data"
                description="Top performing creatives will appear as they accumulate engagement metrics."
              />
            ) : (
              <div className="space-y-4">
                {topPerforming.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3"
                  >
                    <span
                      className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        idx === 0
                          ? 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-300'
                          : idx === 1
                          ? 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300'
                          : 'bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400'
                      }`}
                    >
                      #{idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-surface-900 dark:text-surface-100 truncate">
                        {item.title}
                      </p>
                      <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                        {item.type}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-surface-600 dark:text-surface-300">
                        <span>
                          <span className="font-medium">Score:</span>{' '}
                          <span className="text-success-700 font-semibold">
                            {item.score}
                          </span>
                        </span>
                        <span>
                          <span className="font-medium">Imp:</span>{' '}
                          {item.impressions}
                        </span>
                        <span>
                          <span className="font-medium">CTR:</span> {item.ctr}
                        </span>
                        <span>
                          <span className="font-medium">Conv:</span>{' '}
                          {item.conversions.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Creative Fatigue Alerts */}
          <Card
            title="Creative Fatigue Alerts"
            subtitle="Creatives nearing performance threshold"
            actions={
              fatigueAlerts.length > 0 ? (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-warning-100 text-warning-700 text-xs font-bold">
                  {fatigueAlerts.length}
                </span>
              ) : undefined
            }
          >
            {creativesLoading ? (
              <ListSkeleton rows={2} />
            ) : fatigueAlerts.length === 0 ? (
              <EmptyState
                title="No fatigue alerts"
                description="All creatives are performing within healthy thresholds."
              />
            ) : (
              <div className="space-y-4">
                {fatigueAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-3 rounded-lg border border-warning-200 bg-warning-50/50"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">
                        {alert.creative}
                      </p>
                      <StatusBadge status="warning" />
                    </div>
                    <p className="text-xs text-surface-500 dark:text-surface-400 mb-2">
                      {alert.platform} &middot; {alert.daysActive} days active
                    </p>

                    {/* Frequency Bar */}
                    <div className="mb-2">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-surface-600 dark:text-surface-300">
                          Frequency: {alert.frequency}
                        </span>
                        <span className="text-surface-400 dark:text-surface-500">
                          Threshold: {alert.threshold}
                        </span>
                      </div>
                      <div className="w-full bg-surface-100 dark:bg-surface-700 rounded-full h-1.5">
                        <div
                          className="bg-warning-500 h-1.5 rounded-full transition-all"
                          style={{
                            width: `${(alert.frequency / alert.threshold) * 100}%`,
                          }}
                        />
                      </div>
                    </div>

                    <p className="text-xs text-surface-600 dark:text-surface-300 leading-relaxed">
                      {alert.recommendation}
                    </p>

                    <button
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50"
                      disabled={generating}
                      onClick={() => handleGenerateReplacement(alert)}
                    >
                      <RefreshCw className={`w-3 h-3 ${generating ? 'animate-spin' : ''}`} />
                      Generate Replacement
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
