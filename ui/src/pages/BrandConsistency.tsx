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
  Play,
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
  Cell,
} from 'recharts';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import KPICard from '../components/shared/KPICard';
import StatusBadge from '../components/shared/StatusBadge';
import ProgressBar from '../components/shared/ProgressBar';
import { useApiQuery, useApiMutation } from '../hooks/useApi';
import { TableSkeleton, ChartSkeleton, CardSkeleton } from '../components/shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../components/shared/ErrorBoundary';
import EmptyState from '../components/shared/EmptyState';

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

interface BrandStatusResponse {
  brandScore: number;
  brandScoreChange: number;
  campaignsVerified: number;
  campaignsVerifiedChange: number;
  toneCompliance: number;
  toneComplianceChange: number;
  visualCompliance: number;
  visualComplianceChange: number;
  radarData: Array<{ dimension: string; score: number; fullMark: number }>;
  marketComplianceData: Array<{ market: string; compliance: number }>;
  voiceSettings: {
    primaryTone: { label: string; description: string };
    secondaryTone: { label: string; description: string };
    forbiddenTones: string[];
    toneDetectionAccuracy: number;
    campaignsUsingToneCheck: number;
    totalCampaigns: number;
  };
  visualChecks: Array<{
    name: string;
    icon: string;
    compliance: number;
    notes?: string;
  }>;
  lastScanAgo: string;
  assetsScanned: number;
  brandAssets: Array<{
    name: string;
    status: string;
    lastUpdated: string;
    usageCount: number;
  }>;
}

interface BrandChecksResponse {
  campaignCompliance: Array<{
    id: string;
    name: string;
    channel: string;
    country: string;
    toneMatch: number;
    visualMatch: number;
    overallScore: number;
    status: 'compliant' | 'warning' | 'violation';
    issues: number;
  }>;
  flaggedIssues: Array<{
    id: string;
    campaign: string;
    type: string;
    description: string;
    severity: 'critical' | 'warning';
    flaggedAt: string;
  }>;
}

interface AgentExecuteResponse {
  success: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const visualCheckIcon = (icon: string) => {
  switch (icon) {
    case 'image':
      return <Image className="w-4 h-4 text-surface-500" />;
    case 'palette':
      return <Palette className="w-4 h-4 text-surface-500" />;
    case 'type':
      return <Type className="w-4 h-4 text-surface-500" />;
    default:
      return <Image className="w-4 h-4 text-surface-500" />;
  }
};

const complianceColor = (value: number): 'success' | 'warning' | 'danger' => {
  if (value >= 90) return 'success';
  if (value >= 80) return 'warning';
  return 'danger';
};

const complianceTextClass = (value: number): string => {
  if (value >= 90) return 'text-success-600';
  if (value >= 80) return 'text-warning-600';
  return 'text-danger-600';
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BrandConsistency() {
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'compliant' | 'warning' | 'violation'>('all');

  // API queries
  const {
    data: statusData,
    loading: statusLoading,
    error: statusError,
    refetch: refetchStatus,
  } = useApiQuery<BrandStatusResponse>('/api/v1/agents/brand-consistency/status');

  const {
    data: checksData,
    loading: checksLoading,
    error: checksError,
    refetch: refetchChecks,
  } = useApiQuery<BrandChecksResponse>('/api/v1/agents/brand-consistency/checks');

  // Agent execution mutation
  const {
    mutate: runAgent,
    loading: agentRunning,
  } = useApiMutation<AgentExecuteResponse>('/api/v1/agents/16/execute');

  const handleRunAgent = async () => {
    const result = await runAgent();
    if (result?.success) {
      refetchStatus();
      refetchChecks();
    }
  };

  // Derived data
  const radarData = statusData?.radarData ?? [];
  const marketComplianceData = statusData?.marketComplianceData ?? [];
  const voiceSettings = statusData?.voiceSettings;
  const visualChecks = statusData?.visualChecks ?? [];
  const brandAssets = statusData?.brandAssets ?? [];

  const campaignCompliance = checksData?.campaignCompliance ?? [];
  const flaggedIssues = checksData?.flaggedIssues ?? [];

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
            <button
              onClick={handleRunAgent}
              disabled={agentRunning}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              {agentRunning ? 'Running...' : 'Run Analysis'}
            </button>
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
      {statusError ? (
        <ApiErrorDisplay error={statusError} onRetry={refetchStatus} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statusLoading ? (
            <>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-surface-200 p-5">
                  <CardSkeleton lines={2} />
                </div>
              ))}
            </>
          ) : (
            <>
              <KPICard
                label="Brand Score"
                value={`${statusData?.brandScore ?? 0}%`}
                change={statusData?.brandScoreChange ?? 0}
                trend="up"
              />
              <KPICard
                label="Campaigns Verified"
                value={statusData?.campaignsVerified ?? 0}
                change={statusData?.campaignsVerifiedChange ?? 0}
                trend="up"
              />
              <KPICard
                label="Tone Compliance"
                value={`${statusData?.toneCompliance ?? 0}%`}
                change={statusData?.toneComplianceChange ?? 0}
                trend="up"
              />
              <KPICard
                label="Visual Compliance"
                value={`${statusData?.visualCompliance ?? 0}%`}
                change={statusData?.visualComplianceChange ?? 0}
                trend="up"
              />
            </>
          )}
        </div>
      )}

      {/* Radar Chart + Tone Analysis Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Brand Consistency Radar */}
        <Card
          title="Brand Consistency Overview"
          subtitle="Compliance across 6 dimensions"
          actions={<Eye className="w-4 h-4 text-surface-400" />}
        >
          {statusLoading ? (
            <ChartSkeleton />
          ) : statusError ? (
            <ApiErrorDisplay error={statusError} onRetry={refetchStatus} />
          ) : radarData.length === 0 ? (
            <EmptyState title="No radar data" description="Brand dimension scores are not available yet." />
          ) : (
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
          )}
        </Card>

        {/* Tone Analysis */}
        <Card
          title="Brand Voice Settings"
          subtitle="Current tone configuration"
          actions={<Volume2 className="w-4 h-4 text-surface-400" />}
        >
          {statusLoading ? (
            <CardSkeleton lines={8} />
          ) : statusError ? (
            <ApiErrorDisplay error={statusError} onRetry={refetchStatus} />
          ) : !voiceSettings ? (
            <EmptyState title="No voice settings" description="Brand voice configuration is not available." />
          ) : (
            <div className="space-y-6">
              {/* Primary Tone */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span className="text-sm font-semibold text-surface-800">Primary Tone</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-700">
                    {voiceSettings.primaryTone.label}
                  </span>
                </div>
                <p className="text-xs text-surface-500 mt-1.5">
                  {voiceSettings.primaryTone.description}
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
                    {voiceSettings.secondaryTone.label}
                  </span>
                </div>
                <p className="text-xs text-surface-500 mt-1.5">
                  {voiceSettings.secondaryTone.description}
                </p>
              </div>

              {/* Forbidden Tones */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-sm font-semibold text-surface-800">Forbidden Tones</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {voiceSettings.forbiddenTones.map((tone) => (
                    <span
                      key={tone}
                      className="inline-flex items-center rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700"
                    >
                      {tone}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-surface-500 mt-1.5">
                  Content flagged with these tones will require human review before publication.
                </p>
              </div>

              {/* Compliance Summary */}
              <div className="pt-4 border-t border-surface-100">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-surface-600">Tone detection accuracy</span>
                  <span className="text-sm font-semibold text-success-600">
                    {voiceSettings.toneDetectionAccuracy}%
                  </span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-surface-600">Campaigns using AI tone check</span>
                  <span className="text-sm font-semibold text-surface-900">
                    {voiceSettings.campaignsUsingToneCheck} / {voiceSettings.totalCampaigns}
                  </span>
                </div>
              </div>
            </div>
          )}
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
          {statusLoading ? (
            <CardSkeleton lines={6} />
          ) : statusError ? (
            <ApiErrorDisplay error={statusError} onRetry={refetchStatus} />
          ) : visualChecks.length === 0 ? (
            <EmptyState title="No visual checks" description="Visual compliance data is not available." />
          ) : (
            <div className="space-y-5">
              {visualChecks.map((check) => (
                <div key={check.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      {visualCheckIcon(check.icon)}
                      <span className="text-sm font-medium text-surface-700">{check.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${complianceTextClass(check.compliance)}`}>
                        {check.compliance}% compliant
                      </span>
                      {check.notes && (
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            check.compliance >= 90
                              ? 'text-warning-600 bg-warning-50'
                              : 'text-danger-600 bg-danger-50'
                          }`}
                        >
                          {check.notes}
                        </span>
                      )}
                    </div>
                  </div>
                  <ProgressBar value={check.compliance} color={complianceColor(check.compliance)} size="md" />
                </div>
              ))}

              <div className="pt-4 border-t border-surface-100">
                <div className="flex items-center gap-2 text-sm text-surface-500">
                  <CheckCircle className="w-4 h-4 text-success-500" />
                  <span>Last full scan: {statusData?.lastScanAgo ?? 'unknown'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-surface-500 mt-1.5">
                  <Eye className="w-4 h-4 text-primary-500" />
                  <span>
                    {statusData?.assetsScanned?.toLocaleString() ?? 0} assets scanned across{' '}
                    {statusData?.campaignsVerified ?? 0} campaigns
                  </span>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Country-Specific Brand Adaptations */}
        <Card
          title="Market Compliance by Country"
          subtitle="Brand adaptation scores per market"
          actions={<Fingerprint className="w-4 h-4 text-surface-400" />}
        >
          {statusLoading ? (
            <ChartSkeleton />
          ) : statusError ? (
            <ApiErrorDisplay error={statusError} onRetry={refetchStatus} />
          ) : marketComplianceData.length === 0 ? (
            <EmptyState title="No market data" description="Market compliance data is not available yet." />
          ) : (
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
                  <Bar dataKey="compliance" radius={[4, 4, 0, 0]}>
                    {marketComplianceData.map((entry, index) => {
                      let fill = '#22c55e';
                      if (entry.compliance < 90) fill = '#f59e0b';
                      if (entry.compliance < 80) fill = '#ef4444';
                      return <Cell key={index} fill={fill} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
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
        {checksLoading ? (
          <TableSkeleton rows={6} columns={8} />
        ) : checksError ? (
          <ApiErrorDisplay error={checksError} onRetry={refetchChecks} />
        ) : filteredCampaigns.length === 0 ? (
          <EmptyState
            title="No campaigns found"
            description={
              selectedFilter === 'all'
                ? 'No campaign compliance data is available yet.'
                : `No campaigns with "${selectedFilter}" status.`
            }
          />
        ) : (
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
        )}
      </Card>

      {/* Flagged Issues + Brand Asset Library Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI-Flagged Issues */}
        <Card
          title="AI-Flagged Issues"
          subtitle="Requires human review"
          className="lg:col-span-2"
          actions={
            !checksLoading && flaggedIssues.length > 0 ? (
              <span className="flex items-center gap-1 text-xs text-red-600 font-medium bg-red-50 px-2 py-0.5 rounded-full">
                <AlertTriangle className="w-3 h-3" />
                {flaggedIssues.filter((i) => i.severity === 'critical').length} critical
              </span>
            ) : undefined
          }
        >
          {checksLoading ? (
            <CardSkeleton lines={6} />
          ) : checksError ? (
            <ApiErrorDisplay error={checksError} onRetry={refetchChecks} />
          ) : flaggedIssues.length === 0 ? (
            <EmptyState
              icon={<CheckCircle className="w-6 h-6 text-success-500" />}
              title="No flagged issues"
              description="All campaigns are passing brand consistency checks."
            />
          ) : (
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
          )}
        </Card>

        {/* Brand Asset Library Status */}
        <Card
          title="Brand Asset Library"
          subtitle="Asset inventory & status"
          actions={<Image className="w-4 h-4 text-surface-400" />}
        >
          {statusLoading ? (
            <CardSkeleton lines={8} />
          ) : statusError ? (
            <ApiErrorDisplay error={statusError} onRetry={refetchStatus} />
          ) : brandAssets.length === 0 ? (
            <EmptyState title="No assets" description="Brand asset library is empty." />
          ) : (
            <>
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
                  <span className="font-semibold text-surface-900">{brandAssets.length} packages</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1.5">
                  <span className="text-surface-600">Total usage</span>
                  <span className="font-semibold text-surface-900">
                    {brandAssets.reduce((sum, a) => sum + a.usageCount, 0).toLocaleString()} references
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-surface-500 mt-3">
                  <CheckCircle className="w-3.5 h-3.5 text-success-500" />
                  <span>All assets synced across {marketComplianceData.length} markets</span>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
