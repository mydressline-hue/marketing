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
import type { KPIData } from '../types';

// --- Mock Data ---

const kpiData: KPIData[] = [
  { label: 'Creatives Generated', value: '1,247', change: 18, trend: 'up' },
  { label: 'Active Variants', value: 89, change: 7, trend: 'up' },
  { label: 'Avg Performance Score', value: '7.8/10', change: 4, trend: 'up' },
  { label: 'Brand Compliance', value: '98%', change: 1, trend: 'up' },
];

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

const creativeTypeLabels: Record<CreativeType, string> = {
  ad_copy: 'Ad Copy',
  video_script: 'Video Script',
  ugc_script: 'UGC Script',
  image: 'Image',
  thumbnail: 'Thumbnail',
};

const creativeItems: CreativeItem[] = [
  {
    id: 'cr-001',
    title: 'Summer Sale Hero Banner',
    type: 'image',
    preview: 'Vibrant gradient hero banner featuring bold typography "Up to 60% Off" with tropical motifs and product collage overlay.',
    platform: 'Meta',
    country: 'US',
    performanceScore: 9.2,
    status: 'active',
    colorPlaceholder: 'from-orange-400 via-pink-500 to-purple-600',
  },
  {
    id: 'cr-002',
    title: 'Product Launch Ad Copy - DE',
    type: 'ad_copy',
    preview: 'Entdecken Sie die Zukunft der Hautpflege. Unsere neue ProGlow-Linie vereint modernste Biotechnologie mit natuerlichen Inhaltsstoffen. Jetzt 20% Einfuehrungsrabatt sichern. Nur fuer kurze Zeit.',
    platform: 'Google',
    country: 'DE',
    performanceScore: 8.4,
    status: 'active',
  },
  {
    id: 'cr-003',
    title: '30s TikTok Script - Unboxing',
    type: 'video_script',
    preview: '[HOOK - 0-3s] "Wait... this packaging is insane." [REVEAL - 3-10s] Slow unbox with ASMR sounds. Show product texture close-up. [CTA - 25-30s] "Link in bio - trust me, your skin will thank you."',
    platform: 'TikTok',
    country: 'US',
    performanceScore: 8.9,
    status: 'active',
  },
  {
    id: 'cr-004',
    title: 'UGC Creator Brief - Skincare',
    type: 'ugc_script',
    preview: 'Morning routine format. Start with bare face close-up. Apply ProGlow serum - emphasize the dropper and texture. Show 2-week transformation. Keep tone authentic and unscripted. Must include: before/after, product name mention x2.',
    platform: 'Instagram',
    country: 'UK',
    performanceScore: 7.6,
    status: 'review',
  },
  {
    id: 'cr-005',
    title: 'YouTube Thumbnail - Results',
    type: 'thumbnail',
    preview: 'Split-screen before/after with shocked face reaction. Bold yellow text "30 DAYS LATER..." Red arrow pointing to results area. High contrast, saturated colors.',
    platform: 'YouTube',
    country: 'US',
    performanceScore: 8.1,
    status: 'active',
    colorPlaceholder: 'from-yellow-400 via-red-500 to-rose-600',
  },
  {
    id: 'cr-006',
    title: 'Carousel Ad Copy - JP',
    type: 'ad_copy',
    preview: 'Slide 1: "美肌への第一歩" (Your first step to beautiful skin). Slide 2: 3 key ingredients with icons. Slide 3: Before/After clinical results. Slide 4: Limited offer badge + CTA "今すぐ購入" (Buy Now).',
    platform: 'Meta',
    country: 'JP',
    performanceScore: 7.3,
    status: 'active',
  },
  {
    id: 'cr-007',
    title: 'Retargeting Banner Set',
    type: 'image',
    preview: 'Dynamic retargeting banner set (300x250, 728x90, 160x600). Features abandoned product with "Still thinking about it?" headline. Countdown timer overlay. Personalized discount code placeholder.',
    platform: 'Google',
    country: 'US',
    performanceScore: 8.7,
    status: 'active',
    colorPlaceholder: 'from-blue-500 via-indigo-500 to-violet-600',
  },
  {
    id: 'cr-008',
    title: '15s Reels Script - GRWM',
    type: 'video_script',
    preview: '[Scene 1 - 0-5s] POV mirror shot, messy morning hair. Text overlay: "my secret weapon." [Scene 2 - 5-12s] Quick-cut product application montage with upbeat audio. [Scene 3 - 12-15s] Final glam reveal + product tag.',
    platform: 'Instagram',
    country: 'BR',
    performanceScore: 7.9,
    status: 'draft',
  },
];

const tabOptions = [
  { key: 'all', label: 'All' },
  { key: 'ad_copy', label: 'Ad Copy' },
  { key: 'video_script', label: 'Video Scripts' },
  { key: 'ugc_script', label: 'UGC Scripts' },
  { key: 'image', label: 'Images' },
  { key: 'thumbnail', label: 'Thumbnails' },
];

const topPerforming = [
  {
    id: 'cr-001',
    title: 'Summer Sale Hero Banner',
    type: 'Image',
    score: 9.2,
    impressions: '2.4M',
    ctr: '4.8%',
    conversions: 3_812,
  },
  {
    id: 'cr-003',
    title: '30s TikTok Script - Unboxing',
    type: 'Video Script',
    score: 8.9,
    impressions: '1.8M',
    ctr: '5.1%',
    conversions: 2_945,
  },
  {
    id: 'cr-007',
    title: 'Retargeting Banner Set',
    type: 'Image',
    score: 8.7,
    impressions: '1.1M',
    ctr: '3.6%',
    conversions: 2_108,
  },
];

const fatigueAlerts = [
  {
    id: 'fa-001',
    creative: 'Summer Sale Hero Banner',
    platform: 'Meta',
    frequency: 4.7,
    threshold: 5.0,
    daysActive: 28,
    recommendation: 'Refresh creative within 3 days. CTR has dropped 12% in the last week. Consider rotating to variant B or generating a new version.',
  },
  {
    id: 'fa-002',
    creative: 'Product Launch Ad Copy - DE',
    platform: 'Google',
    frequency: 4.3,
    threshold: 5.0,
    daysActive: 21,
    recommendation: 'Approaching fatigue threshold. Performance still stable but engagement declining. Queue a replacement variant for next week.',
  },
];

const brandToneChecks = [
  { label: 'Voice Consistency', status: 'compliant' as const, score: 97 },
  { label: 'Visual Identity', status: 'compliant' as const, score: 99 },
  { label: 'Messaging Alignment', status: 'compliant' as const, score: 96 },
  { label: 'Regulatory Language', status: 'warning' as const, score: 88 },
];

// --- Component ---

export default function CreativeStudio() {
  const [activeTab, setActiveTab] = useState('all');
  const [genProduct, setGenProduct] = useState('');
  const [genPlatform, setGenPlatform] = useState('Meta');
  const [genCountry, setGenCountry] = useState('US');
  const [genTone, setGenTone] = useState('Professional');
  const [genType, setGenType] = useState<CreativeType>('ad_copy');

  const filteredCreatives =
    activeTab === 'all'
      ? creativeItems
      : creativeItems.filter((c) => c.type === activeTab);

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
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors">
            <Wand2 className="w-4 h-4" />
            New Creative
          </button>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiData.map((kpi) => (
          <KPICard key={kpi.label} {...kpi} />
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Gallery (2 cols) */}
        <div className="xl:col-span-2 space-y-6">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-surface-100 rounded-lg p-1 overflow-x-auto">
            {tabOptions.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white text-surface-900 shadow-sm'
                    : 'text-surface-600 hover:text-surface-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Creative Gallery Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredCreatives.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-surface-200 overflow-hidden hover:shadow-md transition-shadow"
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
                  <div className="h-36 bg-surface-50 p-4 border-b border-surface-100">
                    <p className="text-xs text-surface-600 leading-relaxed line-clamp-5">
                      {item.preview}
                    </p>
                  </div>
                )}

                {/* Card Body */}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold text-surface-900 leading-tight">
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
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-surface-600 bg-surface-100 rounded-full px-2 py-0.5">
                      {typeIcon(item.type)}
                      {creativeTypeLabels[item.type]}
                    </span>
                    <span className="text-xs text-surface-500">
                      {item.platform}
                    </span>
                    <span className="text-xs text-surface-400">|</span>
                    <span className="text-xs text-surface-500">
                      {item.country}
                    </span>
                    <StatusBadge status={item.status} />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 pt-1 border-t border-surface-100">
                    <button
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-surface-600 hover:bg-surface-50 rounded-md transition-colors"
                      title="Copy"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </button>
                    <button
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-surface-600 hover:bg-surface-50 rounded-md transition-colors"
                      title="Download"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </button>
                    <button
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-surface-600 hover:bg-surface-50 rounded-md transition-colors"
                      title="Edit"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-primary-600 hover:bg-primary-50 rounded-md transition-colors ml-auto"
                      title="Regenerate"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Regenerate
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* AI Generation Panel */}
          <Card title="AI Generation" subtitle="Create new creatives with AI">
            <div className="space-y-4">
              {/* Product / Brand */}
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1">
                  Product / Brand
                </label>
                <input
                  type="text"
                  value={genProduct}
                  onChange={(e) => setGenProduct(e.target.value)}
                  placeholder="e.g. ProGlow Skincare Serum"
                  className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              {/* Platform */}
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1">
                  Platform
                </label>
                <select
                  value={genPlatform}
                  onChange={(e) => setGenPlatform(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
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
                <label className="block text-xs font-medium text-surface-700 mb-1">
                  Country
                </label>
                <select
                  value={genCountry}
                  onChange={(e) => setGenCountry(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
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
                <label className="block text-xs font-medium text-surface-700 mb-1">
                  Tone
                </label>
                <select
                  value={genTone}
                  onChange={(e) => setGenTone(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
                >
                  <option>Professional</option>
                  <option>Casual</option>
                  <option>Bold</option>
                  <option>Playful</option>
                </select>
              </div>

              {/* Creative Type */}
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1">
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
                          : 'border-surface-200 text-surface-600 hover:border-surface-300'
                      }`}
                    >
                      {typeIcon(t)}
                      {creativeTypeLabels[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate Button */}
              <button className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors">
                <Sparkles className="w-4 h-4" />
                Generate Creative
              </button>
            </div>
          </Card>

          {/* Brand Tone Consistency Checker */}
          <Card title="Brand Tone Compliance" subtitle="Real-time consistency checks">
            <div className="space-y-3">
              {brandToneChecks.map((check) => (
                <div
                  key={check.label}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <StatusBadge status={check.status} />
                    <span className="text-sm text-surface-700">
                      {check.label}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-surface-900">
                    {check.score}%
                  </span>
                </div>
              ))}
              <div className="pt-3 border-t border-surface-100">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-surface-700">
                    Overall Compliance
                  </span>
                  <span className="font-bold text-success-700">98%</span>
                </div>
                <div className="mt-2 w-full bg-surface-100 rounded-full h-2">
                  <div
                    className="bg-success-500 h-2 rounded-full"
                    style={{ width: '98%' }}
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Top Performing Creatives */}
          <Card title="Top Performing Creatives" subtitle="Highest scoring active creatives">
            <div className="space-y-4">
              {topPerforming.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3"
                >
                  <span
                    className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      idx === 0
                        ? 'bg-yellow-100 text-yellow-700'
                        : idx === 1
                        ? 'bg-surface-100 text-surface-600'
                        : 'bg-orange-50 text-orange-600'
                    }`}
                  >
                    #{idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-surface-900 truncate">
                      {item.title}
                    </p>
                    <p className="text-xs text-surface-500 mt-0.5">
                      {item.type}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-surface-600">
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
          </Card>

          {/* Creative Fatigue Alerts */}
          <Card
            title="Creative Fatigue Alerts"
            subtitle="Creatives nearing performance threshold"
            actions={
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-warning-100 text-warning-700 text-xs font-bold">
                {fatigueAlerts.length}
              </span>
            }
          >
            <div className="space-y-4">
              {fatigueAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="p-3 rounded-lg border border-warning-200 bg-warning-50/50"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-surface-900">
                      {alert.creative}
                    </p>
                    <StatusBadge status="warning" />
                  </div>
                  <p className="text-xs text-surface-500 mb-2">
                    {alert.platform} &middot; {alert.daysActive} days active
                  </p>

                  {/* Frequency Bar */}
                  <div className="mb-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-surface-600">
                        Frequency: {alert.frequency}
                      </span>
                      <span className="text-surface-400">
                        Threshold: {alert.threshold}
                      </span>
                    </div>
                    <div className="w-full bg-surface-100 rounded-full h-1.5">
                      <div
                        className="bg-warning-500 h-1.5 rounded-full transition-all"
                        style={{
                          width: `${(alert.frequency / alert.threshold) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-surface-600 leading-relaxed">
                    {alert.recommendation}
                  </p>

                  <button className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700">
                    <RefreshCw className="w-3 h-3" />
                    Generate Replacement
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
