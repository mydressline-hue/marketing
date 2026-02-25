import { useState } from 'react';
import {
  Fingerprint,
  CheckCircle,
  AlertTriangle,
  Palette,
  Type,
  Image,
  Volume2,
  Eye,
} from 'lucide-react';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import KPICard from '../components/shared/KPICard';
import StatusBadge from '../components/shared/StatusBadge';
import ProgressBar from '../components/shared/ProgressBar';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const radarData = [
  { dimension: 'Tone', score: 97, fullMark: 100 },
  { dimension: 'Messaging', score: 93, fullMark: 100 },
  { dimension: 'Logo Usage', score: 98, fullMark: 100 },
  { dimension: 'Color Palette', score: 95, fullMark: 100 },
  { dimension: 'Typography', score: 100, fullMark: 100 },
  { dimension: 'Imagery', score: 88, fullMark: 100 },
];

const campaignCompliance = [
  {
    id: 'C-001',
    name: 'Summer Launch - US',
    channel: 'Google Ads',
    country: 'United States',
    toneMatch: 98,
    visualMatch: 96,
    overallScore: 97,
    status: 'compliant' as const,
    issues: 0,
  },
  {
    id: 'C-002',
    name: 'Brand Awareness - DE',
    channel: 'Meta Ads',
    country: 'Germany',
    toneMatch: 95,
    visualMatch: 92,
    overallScore: 93,
    status: 'compliant' as const,
    issues: 1,
  },
  {
    id: 'C-003',
    name: 'Product Push - UK',
    channel: 'TikTok',
    country: 'United Kingdom',
    toneMatch: 91,
    visualMatch: 87,
    overallScore: 89,
    status: 'warning' as const,
    issues: 3,
  },
  {
    id: 'C-004',
    name: 'Holiday Promo - FR',
    channel: 'Google Ads',
    country: 'France',
    toneMatch: 99,
    visualMatch: 97,
    overallScore: 98,
    status: 'compliant' as const,
    issues: 0,
  },
  {
    id: 'C-005',
    name: 'Retargeting - JP',
    channel: 'Meta Ads',
    country: 'Japan',
    toneMatch: 88,
    visualMatch: 82,
    overallScore: 85,
    status: 'warning' as const,
    issues: 4,
  },
  {
    id: 'C-006',
    name: 'New Market Entry - BR',
    channel: 'Google Ads',
    country: 'Brazil',
    toneMatch: 94,
    visualMatch: 90,
    overallScore: 92,
    status: 'compliant' as const,
    issues: 1,
  },
  {
    id: 'C-007',
    name: 'Influencer Collab - AU',
    channel: 'TikTok',
    country: 'Australia',
    toneMatch: 78,
    visualMatch: 74,
    overallScore: 76,
    status: 'violation' as const,
    issues: 6,
  },
  {
    id: 'C-008',
    name: 'Enterprise B2B - CA',
    channel: 'Bing Ads',
    country: 'Canada',
    toneMatch: 97,
    visualMatch: 95,
    overallScore: 96,
    status: 'compliant' as const,
    issues: 0,
  },
];

const marketComplianceData = [
  { market: 'US', compliance: 97 },
  { market: 'UK', compliance: 89 },
  { market: 'DE', compliance: 93 },
  { market: 'FR', compliance: 98 },
  { market: 'JP', compliance: 85 },
  { market: 'BR', compliance: 92 },
  { market: 'AU', compliance: 76 },
  { market: 'CA', compliance: 96 },
];

const flaggedIssues = [
  {
    id: 'F-001',
    campaign: 'Influencer Collab - AU',
    type: 'Tone Violation',
    description:
      'TikTok ad copy uses casual slang ("epic deal!") that conflicts with Professional & Confident brand voice guidelines.',
    severity: 'warning' as const,
    flaggedAt: '2 hours ago',
  },
  {
    id: 'F-002',
    campaign: 'Retargeting - JP',
    type: 'Visual Mismatch',
    description:
      'Banner creative uses #FF5722 accent color which is not in the approved color palette. Suggested replacement: #E85D04.',
    severity: 'warning' as const,
    flaggedAt: '4 hours ago',
  },
  {
    id: 'F-003',
    campaign: 'Product Push - UK',
    type: 'Logo Misuse',
    description:
      'Logo placed on a busy background without required clear space buffer. Minimum 16px padding not met in mobile variant.',
    severity: 'critical' as const,
    flaggedAt: '6 hours ago',
  },
  {
    id: 'F-004',
    campaign: 'Influencer Collab - AU',
    type: 'Messaging Deviation',
    description:
      'Headline "Unbelievable Prices You Won\'t Find Anywhere Else" flagged as potentially overpromising per forbidden tone guidelines.',
    severity: 'critical' as const,
    flaggedAt: '8 hours ago',
  },
];

const brandAssets = [
  { name: 'Primary Logo (SVG)', status: 'active', lastUpdated: '2026-01-15', usageCount: 284 },
  { name: 'Secondary Logo (PNG)', status: 'active', lastUpdated: '2026-01-15', usageCount: 167 },
  { name: 'Brand Color Palette', status: 'active', lastUpdated: '2025-12-01', usageCount: 412 },
  { name: 'Typography Kit', status: 'active', lastUpdated: '2025-11-20', usageCount: 389 },
  { name: 'Icon Library v3.2', status: 'active', lastUpdated: '2026-02-10', usageCount: 203 },
  { name: 'Photography Style Guide', status: 'review', lastUpdated: '2026-02-20', usageCount: 56 },
  { name: 'Social Media Templates', status: 'active', lastUpdated: '2026-01-28', usageCount: 178 },
  { name: 'Video Intro/Outro Pack', status: 'active', lastUpdated: '2025-12-15', usageCount: 94 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const scoreColor = (score: number): 'success' | 'warning' | 'danger' => {
  if (score >= 90) return 'success';
  if (score >= 80) return 'warning';
  return 'danger';
};

const scoreTextColor = (score: number): string => {
  if (score >= 90) return 'text-success-600';
  if (score >= 80) return 'text-warning-600';
  return 'text-danger-600';
};

const severityStyles: Record<string, string> = {
  critical: 'border-l-red-500 bg-red-50',
  warning: 'border-l-yellow-500 bg-yellow-50',
};

const severityIconColor: Record<string, string> = {
  critical: 'text-red-600',
  warning: 'text-yellow-600',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BrandConsistency() {
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'compliant' | 'warning' | 'violation'>('all');

  const filteredCampaigns =
    selectedFilter === 'all'
      ? campaignCompliance
      : campaignCompliance.filter((c) => c.status === selectedFilter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Brand Consistency"
        subtitle="Tone, Messaging & Visual Alignment Verification"
        icon={<Fingerprint className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-surface-500">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              Monitoring active
            </span>
          </div>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Brand Score" value="94%" change={2.1} trend="up" />
        <KPICard label="Campaigns Verified" value={142} change={12.4} trend="up" />
        <KPICard label="Tone Compliance" value="97%" change={1.8} trend="up" />
        <KPICard label="Visual Compliance" value="91%" change={3.2} trend="up" />
      </div>

      {/* Radar Chart + Tone Analysis Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Brand Consistency Radar */}
        <Card
          title="Brand Consistency Overview"
          subtitle="Compliance across 6 dimensions"
          actions={<Eye className="w-4 h-4 text-surface-400" />}
        >
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis
                  dataKey="dimension"
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                />
                <Radar
                  name="Brand Score"
                  dataKey="score"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                  }}
                  formatter={(value: number) => [`${value}%`, 'Score']}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Tone Analysis */}
        <Card
          title="Brand Voice Settings"
          subtitle="Current tone configuration"
          actions={<Volume2 className="w-4 h-4 text-surface-400" />}
        >
          <div className="space-y-6">
            {/* Primary Tone */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                <span className="text-sm font-semibold text-surface-800">Primary Tone</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-700">
                  Professional & Confident
                </span>
              </div>
              <p className="text-xs text-surface-500 mt-1.5">
                Authoritative language that conveys expertise without being condescending.
              </p>
            </div>

            {/* Secondary Tone */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-sm font-semibold text-surface-800">Secondary Tone</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-lg bg-blue-50 border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-700">
                  Approachable & Innovative
                </span>
              </div>
              <p className="text-xs text-surface-500 mt-1.5">
                Warm, forward-thinking language that builds trust and highlights cutting-edge solutions.
              </p>
            </div>

            {/* Forbidden Tones */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-sm font-semibold text-surface-800">Forbidden Tones</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700">
                  Aggressive
                </span>
                <span className="inline-flex items-center rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700">
                  Sarcastic
                </span>
                <span className="inline-flex items-center rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700">
                  Overpromising
                </span>
              </div>
              <p className="text-xs text-surface-500 mt-1.5">
                Content flagged with these tones will require human review before publication.
              </p>
            </div>

            {/* Compliance Summary */}
            <div className="pt-4 border-t border-surface-100">
              <div className="flex items-center justify-between">
                <span className="text-sm text-surface-600">Tone detection accuracy</span>
                <span className="text-sm font-semibold text-success-600">99.2%</span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm text-surface-600">Campaigns using AI tone check</span>
                <span className="text-sm font-semibold text-surface-900">138 / 142</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Visual Compliance + Market Compliance Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Visual Compliance Checker */}
        <Card
          title="Visual Compliance Checker"
          subtitle="Automated visual asset verification"
          actions={<Palette className="w-4 h-4 text-surface-400" />}
        >
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <Image className="w-4 h-4 text-surface-500" />
                  <span className="text-sm font-medium text-surface-700">Logo Usage</span>
                </div>
                <span className="text-sm font-semibold text-success-600">98% compliant</span>
              </div>
              <ProgressBar value={98} color="success" size="md" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-surface-500" />
                  <span className="text-sm font-medium text-surface-700">Color Palette</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-success-600">95% compliant</span>
                  <span className="text-xs text-warning-600 bg-warning-50 px-1.5 py-0.5 rounded">
                    2 minor deviations
                  </span>
                </div>
              </div>
              <ProgressBar value={95} color="success" size="md" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <Type className="w-4 h-4 text-surface-500" />
                  <span className="text-sm font-medium text-surface-700">Typography</span>
                </div>
                <span className="text-sm font-semibold text-success-600">100% compliant</span>
              </div>
              <ProgressBar value={100} color="success" size="md" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <Image className="w-4 h-4 text-surface-500" />
                  <span className="text-sm font-medium text-surface-700">Image Style</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-warning-600">88% compliant</span>
                  <span className="text-xs text-danger-600 bg-danger-50 px-1.5 py-0.5 rounded">
                    3 off-brand images flagged
                  </span>
                </div>
              </div>
              <ProgressBar value={88} color="warning" size="md" />
            </div>

            <div className="pt-4 border-t border-surface-100">
              <div className="flex items-center gap-2 text-sm text-surface-500">
                <CheckCircle className="w-4 h-4 text-success-500" />
                <span>Last full scan: 15 minutes ago</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-surface-500 mt-1.5">
                <Eye className="w-4 h-4 text-primary-500" />
                <span>1,247 assets scanned across 142 campaigns</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Country-Specific Brand Adaptations */}
        <Card
          title="Market Compliance by Country"
          subtitle="Brand adaptation scores per market"
          actions={<Fingerprint className="w-4 h-4 text-surface-400" />}
        >
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={marketComplianceData}
                margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="market" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis
                  domain={[60, 100]}
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                  }}
                  formatter={(value: number) => [`${value}%`, 'Compliance']}
                />
                <Bar
                  dataKey="compliance"
                  radius={[4, 4, 0, 0]}
                  fill="#6366f1"
                  label={false}
                >
                  {marketComplianceData.map((entry, index) => {
                    let fill = '#22c55e';
                    if (entry.compliance < 90) fill = '#f59e0b';
                    if (entry.compliance < 80) fill = '#ef4444';
                    return <rect key={index} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Brand Guidelines Compliance Table */}
      <Card
        title="Brand Guidelines Compliance"
        subtitle="Per-campaign compliance breakdown"
        actions={
          <div className="flex items-center gap-2">
            {(['all', 'compliant', 'warning', 'violation'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setSelectedFilter(filter)}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                  selectedFilter === filter
                    ? 'bg-primary-100 text-primary-700 border border-primary-300'
                    : 'bg-surface-100 text-surface-600 border border-surface-200 hover:bg-surface-200'
                }`}
              >
                {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-100">
                <th className="text-left py-3 px-3 font-semibold text-surface-600">Campaign</th>
                <th className="text-left py-3 px-3 font-semibold text-surface-600">Channel</th>
                <th className="text-left py-3 px-3 font-semibold text-surface-600">Country</th>
                <th className="text-center py-3 px-3 font-semibold text-surface-600">Tone Match</th>
                <th className="text-center py-3 px-3 font-semibold text-surface-600">Visual Match</th>
                <th className="text-center py-3 px-3 font-semibold text-surface-600">Overall</th>
                <th className="text-center py-3 px-3 font-semibold text-surface-600">Status</th>
                <th className="text-center py-3 px-3 font-semibold text-surface-600">Issues</th>
              </tr>
            </thead>
            <tbody>
              {filteredCampaigns.map((campaign) => (
                <tr
                  key={campaign.id}
                  className="border-b border-surface-50 hover:bg-surface-50/50 transition-colors"
                >
                  <td className="py-3 px-3 font-medium text-surface-800">{campaign.name}</td>
                  <td className="py-3 px-3 text-surface-600">{campaign.channel}</td>
                  <td className="py-3 px-3 text-surface-600">{campaign.country}</td>
                  <td className="py-3 px-3 text-center">
                    <span className={`font-semibold ${scoreTextColor(campaign.toneMatch)}`}>
                      {campaign.toneMatch}%
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`font-semibold ${scoreTextColor(campaign.visualMatch)}`}>
                      {campaign.visualMatch}%
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span
                      className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-xs font-bold ${
                        campaign.overallScore >= 90
                          ? 'bg-success-50 text-success-700'
                          : campaign.overallScore >= 80
                            ? 'bg-warning-50 text-warning-700'
                            : 'bg-danger-50 text-danger-700'
                      }`}
                    >
                      {campaign.overallScore}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <StatusBadge status={campaign.status} />
                  </td>
                  <td className="py-3 px-3 text-center">
                    {campaign.issues > 0 ? (
                      <span className="inline-flex items-center gap-1 text-warning-600 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {campaign.issues}
                      </span>
                    ) : (
                      <CheckCircle className="w-4 h-4 text-success-500 mx-auto" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Flagged Issues + Brand Asset Library Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI-Flagged Issues */}
        <Card
          title="AI-Flagged Issues"
          subtitle="Requires human review"
          className="lg:col-span-2"
          actions={
            <span className="flex items-center gap-1 text-xs text-red-600 font-medium bg-red-50 px-2 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" />
              {flaggedIssues.filter((i) => i.severity === 'critical').length} critical
            </span>
          }
        >
          <div className="space-y-3">
            {flaggedIssues.map((issue) => (
              <div
                key={issue.id}
                className={`flex items-start gap-3 rounded-lg border-l-4 p-3 ${severityStyles[issue.severity]}`}
              >
                <AlertTriangle
                  className={`w-4 h-4 mt-0.5 shrink-0 ${severityIconColor[issue.severity]}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-surface-800">{issue.type}</span>
                    <span className="text-xs text-surface-400">|</span>
                    <span className="text-xs text-surface-500">{issue.campaign}</span>
                  </div>
                  <p className="text-sm text-surface-600">{issue.description}</p>
                  <p className="text-xs text-surface-400 mt-1.5">{issue.flaggedAt}</p>
                </div>
                <StatusBadge status={issue.severity} size="sm" />
              </div>
            ))}
          </div>
        </Card>

        {/* Brand Asset Library Status */}
        <Card
          title="Brand Asset Library"
          subtitle="Asset inventory & status"
          actions={<Image className="w-4 h-4 text-surface-400" />}
        >
          <div className="space-y-3">
            {brandAssets.map((asset) => (
              <div
                key={asset.name}
                className="flex items-center justify-between py-2 border-b border-surface-50 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-surface-800 truncate">{asset.name}</p>
                  <p className="text-xs text-surface-400 mt-0.5">
                    Updated {asset.lastUpdated} &middot; {asset.usageCount} uses
                  </p>
                </div>
                <StatusBadge status={asset.status} size="sm" />
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-surface-100">
            <div className="flex items-center justify-between text-sm">
              <span className="text-surface-600">Total assets</span>
              <span className="font-semibold text-surface-900">8 packages</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1.5">
              <span className="text-surface-600">Total usage</span>
              <span className="font-semibold text-surface-900">
                {brandAssets.reduce((sum, a) => sum + a.usageCount, 0).toLocaleString()} references
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-surface-500 mt-3">
              <CheckCircle className="w-3.5 h-3.5 text-success-500" />
              <span>All assets synced across 8 markets</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
