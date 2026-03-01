import { useState, useMemo } from 'react';
import {
  Shield,
  CheckCircle,
  AlertTriangle,
  XCircle,
  FileText,
  Globe,
  Lock,
  Clock,
  Play,
  Loader2,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
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
import { useApiQuery, useApiMutation } from '../hooks/useApi';
import { TableSkeleton, CardSkeleton } from '../components/shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../components/shared/ErrorBoundary';
import EmptyState from '../components/shared/EmptyState';

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

interface ComplianceRule {
  id: string;
  name: string;
  country: string;
  category: string;
  status: 'compliant' | 'warning' | 'review' | 'violation';
  lastChecked: string;
  details: string;
  riskLevel: 'Low' | 'Medium' | 'High';
}

interface ComplianceStatus {
  overview: { name: string; value: number; color: string }[];
  kpis: {
    complianceScore: number;
    complianceScoreChange: number;
    activeRegulations: number;
    activeRegulationsChange: number;
    violations: number;
    violationsChange: number;
    pendingReviews: number;
    pendingReviewsChange: number;
  };
  countryCompliance: { country: string; compliance: number }[];
  flaggedCampaigns: {
    id: string;
    name: string;
    market: string;
    issue: string;
    severity: 'warning' | 'review' | 'critical';
    flaggedDate: string;
    assignee: string;
  }[];
  dataProtection: {
    label: string;
    description: string;
    status: 'compliant' | 'warning' | 'violation' | 'review';
  }[];
  adRestrictions: {
    country: string;
    categories: string[];
    enforced: boolean;
  }[];
  auditLog: {
    id: string;
    timestamp: string;
    action: string;
    agent: string;
    result: string;
  }[];
}

interface CountryData {
  code: string;
  name: string;
  flag: string;
}

interface AgentExecuteResult {
  success: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const categoryColors: Record<string, string> = {
  'Data Protection': 'bg-blue-100 text-blue-700',
  'Ad Standards': 'bg-purple-100 text-purple-700',
  'Consumer Rights': 'bg-teal-100 text-teal-700',
  Tax: 'bg-orange-100 text-orange-700',
};

const riskColors: Record<string, string> = {
  Low: 'text-green-600',
  Medium: 'text-yellow-600',
  High: 'text-red-600',
};

const riskBg: Record<string, string> = {
  Low: 'bg-green-50',
  Medium: 'bg-yellow-50',
  High: 'bg-red-50',
};

const auditResultStyles: Record<string, string> = {
  Pass: 'bg-green-100 text-green-700',
  Pending: 'bg-yellow-100 text-yellow-700',
  'In Progress': 'bg-blue-100 text-blue-700',
  Fail: 'bg-red-100 text-red-700',
};

const getBarColor = (compliance: number) => {
  if (compliance >= 95) return '#22c55e';
  if (compliance >= 90) return '#84cc16';
  if (compliance >= 85) return '#f59e0b';
  return '#ef4444';
};

const dataProtectionIconMap: Record<string, typeof CheckCircle> = {
  compliant: CheckCircle,
  warning: AlertTriangle,
  violation: XCircle,
  review: Clock,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Compliance() {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // ---- API calls ----
  const {
    data: rules,
    loading: rulesLoading,
    error: rulesError,
    refetch: refetchRules,
  } = useApiQuery<ComplianceRule[]>('/api/v1/agents/compliance/rules');

  const {
    data: status,
    loading: statusLoading,
    error: statusError,
    refetch: refetchStatus,
  } = useApiQuery<ComplianceStatus>('/api/v1/agents/compliance/status');

  const {
    data: _countries,
    loading: countriesLoading,
    error: countriesError,
    refetch: refetchCountries,
  } = useApiQuery<CountryData[]>('/api/v1/countries');

  const {
    mutate: runAudit,
    loading: auditRunning,
  } = useApiMutation<AgentExecuteResult>('/api/v1/agents/13/execute');

  // ---- Derived state ----
  const categories = ['All', 'Data Protection', 'Ad Standards', 'Consumer Rights', 'Tax'];

  const regulations = rules ?? [];

  const filteredRegulations = useMemo(
    () =>
      selectedCategory === 'All'
        ? regulations
        : regulations.filter((r) => r.category === selectedCategory),
    [regulations, selectedCategory],
  );

  const complianceOverview = status?.overview ?? [];
  const countryComplianceData = status?.countryCompliance ?? [];
  const flaggedCampaigns = status?.flaggedCampaigns ?? [];
  const dataProtectionItems = status?.dataProtection ?? [];
  const adRestrictions = status?.adRestrictions ?? [];
  const auditLog = status?.auditLog ?? [];
  const kpis = status?.kpis;

  const violationCount =
    kpis?.violations ?? regulations.filter((r) => r.status === 'violation').length;

  // ---- Run Audit handler ----
  const handleRunAudit = async () => {
    await runAudit();
    // Refresh data after audit completes
    refetchRules();
    refetchStatus();
    refetchCountries();
  };

  // ---- Global loading state (for KPIs / header) ----
  const isInitialLoading = rulesLoading && statusLoading && countriesLoading;

  // ---- Global error ----
  if (rulesError && statusError && countriesError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Compliance & Regulatory"
          subtitle="GDPR, CCPA & Local Ad Law Enforcement"
          icon={<Shield className="w-5 h-5" />}
        />
        <ApiErrorDisplay
          error={rulesError || statusError || countriesError || 'Failed to load compliance data'}
          onRetry={() => {
            refetchRules();
            refetchStatus();
            refetchCountries();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Compliance & Regulatory"
        subtitle="GDPR, CCPA & Local Ad Law Enforcement"
        icon={<Shield className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={handleRunAudit}
              disabled={auditRunning}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {auditRunning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {auditRunning ? 'Running Audit...' : 'Run Audit'}
            </button>
            <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium bg-green-50 px-3 py-1 rounded-full">
              <CheckCircle className="w-4 h-4" />
              {statusLoading ? '...' : `${violationCount} Violation${violationCount !== 1 ? 's' : ''}`}
            </span>
          </div>
        }
      />

      {/* KPI Row */}
      {isInitialLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} lines={2} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Compliance Score"
            value={kpis?.complianceScore ?? 0}
            change={kpis?.complianceScoreChange ?? 0}
            trend={
              (kpis?.complianceScoreChange ?? 0) > 0
                ? 'up'
                : (kpis?.complianceScoreChange ?? 0) < 0
                  ? 'down'
                  : 'stable'
            }
            suffix="%"
          />
          <KPICard
            label="Active Regulations"
            value={kpis?.activeRegulations ?? regulations.length}
            change={kpis?.activeRegulationsChange ?? 0}
            trend={
              (kpis?.activeRegulationsChange ?? 0) > 0
                ? 'up'
                : (kpis?.activeRegulationsChange ?? 0) < 0
                  ? 'down'
                  : 'stable'
            }
          />
          <KPICard
            label="Violations"
            value={violationCount}
            change={kpis?.violationsChange ?? 0}
            trend={
              (kpis?.violationsChange ?? 0) > 0
                ? 'up'
                : (kpis?.violationsChange ?? 0) < 0
                  ? 'down'
                  : 'stable'
            }
          />
          <KPICard
            label="Pending Reviews"
            value={kpis?.pendingReviews ?? regulations.filter((r) => r.status === 'review').length}
            change={kpis?.pendingReviewsChange ?? 0}
            trend={
              (kpis?.pendingReviewsChange ?? 0) > 0
                ? 'up'
                : (kpis?.pendingReviewsChange ?? 0) < 0
                  ? 'down'
                  : 'stable'
            }
          />
        </div>
      )}

      {/* Compliance Overview Pie + Country Compliance Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Compliance Overview PieChart */}
        <Card
          title="Compliance Overview"
          subtitle="Current regulation status distribution"
          actions={<Shield className="w-4 h-4 text-surface-400" />}
        >
          {statusLoading ? (
            <CardSkeleton lines={6} />
          ) : statusError ? (
            <ApiErrorDisplay error={statusError} onRetry={refetchStatus} />
          ) : complianceOverview.length === 0 ? (
            <EmptyState title="No overview data" message="Compliance overview data is not available yet." />
          ) : (
            <div className="flex items-center gap-6">
              <div className="h-64 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={complianceOverview}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={4}
                      dataKey="value"
                      stroke="none"
                    >
                      {complianceOverview.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number | undefined) => `${value ?? 0}%`}
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3 min-w-[140px]">
                {complianceOverview.map((item) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm text-surface-600">{item.name}</span>
                    <span className="text-sm font-semibold text-surface-900 ml-auto">
                      {item.value}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Country Compliance BarChart */}
        <Card
          title="Country Compliance"
          subtitle="Compliance % by country"
          actions={<Globe className="w-4 h-4 text-surface-400" />}
        >
          {statusLoading ? (
            <CardSkeleton lines={6} />
          ) : statusError ? (
            <ApiErrorDisplay error={statusError} onRetry={refetchStatus} />
          ) : countryComplianceData.length === 0 ? (
            <EmptyState title="No country data" message="Country compliance data is not available yet." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={countryComplianceData}
                  margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="country"
                    tick={{ fontSize: 11 }}
                    stroke="#9ca3af"
                  />
                  <YAxis
                    domain={[70, 100]}
                    tick={{ fontSize: 12 }}
                    stroke="#9ca3af"
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    formatter={(value: number | undefined) => `${value ?? 0}%`}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                    }}
                  />
                  <Bar dataKey="compliance" radius={[4, 4, 0, 0]} name="Compliance">
                    {countryComplianceData.map((entry, index) => (
                      <Cell key={`bar-${index}`} fill={getBarColor(entry.compliance)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Regulation Tracking Table */}
      <Card
        title="Regulation Tracking"
        subtitle={`${filteredRegulations.length} regulation${filteredRegulations.length !== 1 ? 's' : ''} shown`}
        actions={
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-surface-400" />
          </div>
        }
      >
        {/* Category Filter */}
        <div className="flex flex-wrap gap-2 mb-4">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-primary-600 text-white'
                  : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Table */}
        {rulesLoading ? (
          <TableSkeleton rows={7} columns={7} />
        ) : rulesError ? (
          <ApiErrorDisplay error={rulesError} onRetry={refetchRules} />
        ) : filteredRegulations.length === 0 ? (
          <EmptyState
            title="No regulations found"
            message={
              selectedCategory === 'All'
                ? 'No compliance regulations are being tracked yet.'
                : `No regulations found for the "${selectedCategory}" category.`
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200">
                  <th className="text-left py-3 px-3 font-semibold text-surface-600">Regulation</th>
                  <th className="text-left py-3 px-3 font-semibold text-surface-600">Country</th>
                  <th className="text-left py-3 px-3 font-semibold text-surface-600">Category</th>
                  <th className="text-left py-3 px-3 font-semibold text-surface-600">Status</th>
                  <th className="text-left py-3 px-3 font-semibold text-surface-600">Last Checked</th>
                  <th className="text-left py-3 px-3 font-semibold text-surface-600">Details</th>
                  <th className="text-left py-3 px-3 font-semibold text-surface-600">Risk Level</th>
                </tr>
              </thead>
              <tbody>
                {filteredRegulations.map((reg) => (
                  <tr
                    key={reg.id}
                    className="border-b border-surface-100 hover:bg-surface-50 transition-colors"
                  >
                    <td className="py-3 px-3 font-medium text-surface-900">{reg.name}</td>
                    <td className="py-3 px-3 text-surface-600">{reg.country}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          categoryColors[reg.category] || 'bg-surface-100 text-surface-600'
                        }`}
                      >
                        {reg.category}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <StatusBadge status={reg.status} />
                    </td>
                    <td className="py-3 px-3 text-surface-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {reg.lastChecked}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-surface-500 max-w-xs truncate">{reg.details}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${riskBg[reg.riskLevel]} ${riskColors[reg.riskLevel]}`}
                      >
                        {reg.riskLevel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Flagged Campaigns */}
      <Card
        title="High-Risk Campaign Flags"
        subtitle="Campaigns flagged for compliance review"
        actions={
          <span className="flex items-center gap-1 text-xs text-yellow-600 font-medium bg-yellow-50 px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3" />
            {statusLoading ? '...' : `${flaggedCampaigns.length} flagged`}
          </span>
        }
      >
        {statusLoading ? (
          <CardSkeleton lines={5} />
        ) : statusError ? (
          <ApiErrorDisplay error={statusError} onRetry={refetchStatus} />
        ) : flaggedCampaigns.length === 0 ? (
          <EmptyState
            title="No flagged campaigns"
            message="All campaigns are currently compliant. No flags have been raised."
            icon={<CheckCircle className="w-6 h-6" />}
          />
        ) : (
          <div className="space-y-3">
            {flaggedCampaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="flex items-start gap-4 rounded-lg border border-surface-200 p-4 hover:border-surface-300 transition-colors"
              >
                <div className="w-10 h-10 bg-yellow-50 rounded-lg flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-yellow-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-semibold text-surface-900">{campaign.name}</h4>
                    <StatusBadge status={campaign.severity} />
                  </div>
                  <p className="text-sm text-surface-500 mb-2">{campaign.issue}</p>
                  <div className="flex items-center gap-4 text-xs text-surface-400">
                    <span className="flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      {campaign.market}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {campaign.flaggedDate}
                    </span>
                    <span className="flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      {campaign.assignee}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Data Protection + Ad Restrictions Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Data Protection Compliance */}
        <Card
          title="Data Protection Compliance"
          subtitle="GDPR & global privacy requirements"
          actions={<Lock className="w-4 h-4 text-surface-400" />}
        >
          {statusLoading ? (
            <CardSkeleton lines={5} />
          ) : statusError ? (
            <ApiErrorDisplay error={statusError} onRetry={refetchStatus} />
          ) : dataProtectionItems.length === 0 ? (
            <EmptyState
              title="No data protection info"
              message="Data protection compliance details are not available."
            />
          ) : (
            <div className="space-y-4">
              {dataProtectionItems.map((item) => {
                const Icon = dataProtectionIconMap[item.status] || CheckCircle;
                const iconColor =
                  item.status === 'compliant'
                    ? 'text-green-600'
                    : item.status === 'warning'
                      ? 'text-yellow-600'
                      : item.status === 'violation'
                        ? 'text-red-600'
                        : 'text-blue-600';
                const iconBg =
                  item.status === 'compliant'
                    ? 'bg-green-50'
                    : item.status === 'warning'
                      ? 'bg-yellow-50'
                      : item.status === 'violation'
                        ? 'bg-red-50'
                        : 'bg-blue-50';
                return (
                  <div
                    key={item.label}
                    className="flex items-start gap-3 rounded-lg border border-surface-200 p-3"
                  >
                    <div
                      className={`w-8 h-8 ${iconBg} rounded-lg flex items-center justify-center shrink-0 mt-0.5`}
                    >
                      <Icon className={`w-4 h-4 ${iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <h4 className="text-sm font-semibold text-surface-900">{item.label}</h4>
                        <StatusBadge status={item.status} />
                      </div>
                      <p className="text-xs text-surface-500">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Ad Restriction Enforcement */}
        <Card
          title="Ad Restriction Enforcement"
          subtitle="Restricted categories by country"
          actions={<XCircle className="w-4 h-4 text-surface-400" />}
        >
          {statusLoading ? (
            <CardSkeleton lines={5} />
          ) : statusError ? (
            <ApiErrorDisplay error={statusError} onRetry={refetchStatus} />
          ) : adRestrictions.length === 0 ? (
            <EmptyState
              title="No restrictions data"
              message="Ad restriction enforcement data is not available."
            />
          ) : (
            <div className="space-y-3">
              {adRestrictions.map((restriction) => (
                <div
                  key={restriction.country}
                  className="rounded-lg border border-surface-200 p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-surface-400" />
                      <span className="text-sm font-semibold text-surface-900">
                        {restriction.country}
                      </span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        restriction.enforced
                          ? 'bg-green-50 text-green-700'
                          : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {restriction.enforced ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : (
                        <XCircle className="w-3 h-3" />
                      )}
                      {restriction.enforced ? 'Enforced' : 'Not Enforced'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {restriction.categories.map((cat) => (
                      <span
                        key={cat}
                        className="px-2 py-0.5 rounded bg-red-50 text-red-600 text-xs font-medium"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Recent Compliance Audit Log */}
      <Card
        title="Recent Compliance Audit Log"
        subtitle="Latest automated compliance checks"
        actions={<FileText className="w-4 h-4 text-surface-400" />}
      >
        {statusLoading ? (
          <TableSkeleton rows={5} columns={4} />
        ) : statusError ? (
          <ApiErrorDisplay error={statusError} onRetry={refetchStatus} />
        ) : auditLog.length === 0 ? (
          <EmptyState
            title="No audit entries"
            message="No compliance audit logs have been recorded yet. Run an audit to generate entries."
            action={
              <button
                onClick={handleRunAudit}
                disabled={auditRunning}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {auditRunning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {auditRunning ? 'Running...' : 'Run Audit'}
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200">
                  <th className="text-left py-3 px-3 font-semibold text-surface-600">Timestamp</th>
                  <th className="text-left py-3 px-3 font-semibold text-surface-600">Action</th>
                  <th className="text-left py-3 px-3 font-semibold text-surface-600">Agent</th>
                  <th className="text-left py-3 px-3 font-semibold text-surface-600">Result</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-surface-100 hover:bg-surface-50 transition-colors"
                  >
                    <td className="py-3 px-3 text-surface-500 whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {entry.timestamp}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-medium text-surface-900">{entry.action}</td>
                    <td className="py-3 px-3 text-surface-600">{entry.agent}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          auditResultStyles[entry.result] || 'bg-surface-100 text-surface-600'
                        }`}
                      >
                        {entry.result}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
