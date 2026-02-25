import { useState } from 'react';
import {
  Shield,
  CheckCircle,
  AlertTriangle,
  XCircle,
  FileText,
  Globe,
  Lock,
  Clock,
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

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const complianceOverview = [
  { name: 'Compliant', value: 85, color: '#22c55e' },
  { name: 'Warning', value: 10, color: '#f59e0b' },
  { name: 'Under Review', value: 5, color: '#6366f1' },
];

const regulations = [
  {
    id: 'reg-1',
    name: 'GDPR',
    country: 'EU',
    category: 'Data Protection',
    status: 'compliant' as const,
    lastChecked: '2026-02-24',
    details: 'Full data processing compliance with Art. 6 lawful basis verified.',
    riskLevel: 'Low',
  },
  {
    id: 'reg-2',
    name: 'CCPA',
    country: 'United States',
    category: 'Consumer Rights',
    status: 'compliant' as const,
    lastChecked: '2026-02-23',
    details: 'Consumer opt-out mechanisms active. Annual review scheduled Q1.',
    riskLevel: 'Low',
  },
  {
    id: 'reg-3',
    name: 'ePrivacy Directive',
    country: 'EU',
    category: 'Data Protection',
    status: 'warning' as const,
    lastChecked: '2026-02-22',
    details: 'Cookie consent banner update needed for new tracking pixels.',
    riskLevel: 'Medium',
  },
  {
    id: 'reg-4',
    name: 'UK Data Protection Act',
    country: 'United Kingdom',
    category: 'Data Protection',
    status: 'compliant' as const,
    lastChecked: '2026-02-24',
    details: 'ICO registration current. DPO appointed and documented.',
    riskLevel: 'Low',
  },
  {
    id: 'reg-5',
    name: 'Japan APPI',
    country: 'Japan',
    category: 'Data Protection',
    status: 'review' as const,
    lastChecked: '2026-02-20',
    details: 'Cross-border transfer provisions under review after 2025 amendment.',
    riskLevel: 'Medium',
  },
  {
    id: 'reg-6',
    name: 'UAE Ad Standards',
    country: 'UAE',
    category: 'Ad Standards',
    status: 'warning' as const,
    lastChecked: '2026-02-21',
    details: 'Certain creative assets flagged for local content review process.',
    riskLevel: 'Medium',
  },
  {
    id: 'reg-7',
    name: 'Brazil LGPD',
    country: 'Brazil',
    category: 'Data Protection',
    status: 'compliant' as const,
    lastChecked: '2026-02-23',
    details: 'ANPD registration complete. Privacy notice localized in Portuguese.',
    riskLevel: 'Low',
  },
  {
    id: 'reg-8',
    name: 'Australia Privacy Act',
    country: 'Australia',
    category: 'Consumer Rights',
    status: 'compliant' as const,
    lastChecked: '2026-02-24',
    details: 'APP compliance verified. Notifiable data breach plan in place.',
    riskLevel: 'Low',
  },
  {
    id: 'reg-9',
    name: 'South Korea PIPA',
    country: 'South Korea',
    category: 'Data Protection',
    status: 'review' as const,
    lastChecked: '2026-02-19',
    details: 'Pseudonymization requirements pending internal audit completion.',
    riskLevel: 'High',
  },
  {
    id: 'reg-10',
    name: 'German Telemediengesetz',
    country: 'Germany',
    category: 'Ad Standards',
    status: 'compliant' as const,
    lastChecked: '2026-02-24',
    details: 'Impressum and ad disclosure requirements met across all campaigns.',
    riskLevel: 'Low',
  },
];

const countryComplianceData = [
  { country: 'EU', compliance: 94 },
  { country: 'US', compliance: 98 },
  { country: 'UK', compliance: 97 },
  { country: 'Japan', compliance: 88 },
  { country: 'UAE', compliance: 82 },
  { country: 'Brazil', compliance: 95 },
  { country: 'Australia', compliance: 96 },
  { country: 'S. Korea', compliance: 85 },
  { country: 'Germany', compliance: 99 },
];

const flaggedCampaigns = [
  {
    id: 'fc-1',
    name: 'TikTok UAE Ramadan Promo',
    market: 'UAE',
    issue: 'Creative assets may violate local advertising content guidelines during religious period.',
    severity: 'warning' as const,
    flaggedDate: '2026-02-23',
    assignee: 'Compliance Team A',
  },
  {
    id: 'fc-2',
    name: 'Google Ads South Korea Retargeting',
    market: 'South Korea',
    issue: 'Retargeting pixel implementation needs PIPA pseudonymization review before launch.',
    severity: 'warning' as const,
    flaggedDate: '2026-02-22',
    assignee: 'Data Privacy Officer',
  },
  {
    id: 'fc-3',
    name: 'Meta EU Lookalike Audiences',
    market: 'EU',
    issue: 'Lookalike audience data sourcing requires updated GDPR consent flow verification.',
    severity: 'review' as const,
    flaggedDate: '2026-02-24',
    assignee: 'Legal Review Board',
  },
];

const dataProtectionItems = [
  { label: 'Consent Management', description: 'Cookie consent and opt-in flows active across all markets', status: 'compliant' as const, icon: CheckCircle },
  { label: 'Data Retention', description: 'Automated 24-month retention policy enforced. Purge jobs running weekly', status: 'compliant' as const, icon: CheckCircle },
  { label: 'Right to Deletion', description: 'Self-service deletion portal live. Average fulfillment: 2.1 days', status: 'compliant' as const, icon: CheckCircle },
  { label: 'Data Portability', description: 'Export functionality available. Format: JSON & CSV. Under GDPR Art. 20', status: 'compliant' as const, icon: CheckCircle },
];

const adRestrictions = [
  { country: 'UAE', categories: ['Alcohol', 'Gambling', 'Religious sensitivity'], enforced: true },
  { country: 'Germany', categories: ['Comparative advertising', 'Health claims'], enforced: true },
  { country: 'South Korea', categories: ['Cosmetic surgery', 'Financial guarantees'], enforced: true },
  { country: 'Brazil', categories: ['Tobacco', 'Alcohol (time-restricted)'], enforced: true },
  { country: 'Australia', categories: ['Gambling (state-specific)', 'Therapeutic goods'], enforced: true },
  { country: 'Japan', categories: ['Pharma (pre-approval)', 'Misleading discounts'], enforced: true },
];

const auditLog = [
  {
    id: 'audit-1',
    timestamp: '2026-02-24 16:42',
    action: 'GDPR consent flow validated',
    agent: 'Compliance Checker',
    result: 'Pass',
  },
  {
    id: 'audit-2',
    timestamp: '2026-02-24 14:18',
    action: 'UAE ad creative review submitted',
    agent: 'Creative Engine',
    result: 'Pending',
  },
  {
    id: 'audit-3',
    timestamp: '2026-02-24 11:05',
    action: 'CCPA opt-out mechanism tested',
    agent: 'Compliance Checker',
    result: 'Pass',
  },
  {
    id: 'audit-4',
    timestamp: '2026-02-23 22:30',
    action: 'Data retention purge job completed',
    agent: 'Data Pipeline',
    result: 'Pass',
  },
  {
    id: 'audit-5',
    timestamp: '2026-02-23 17:55',
    action: 'South Korea PIPA audit initiated',
    agent: 'Compliance Checker',
    result: 'In Progress',
  },
];

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Compliance() {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = ['All', 'Data Protection', 'Ad Standards', 'Consumer Rights', 'Tax'];

  const filteredRegulations =
    selectedCategory === 'All'
      ? regulations
      : regulations.filter((r) => r.category === selectedCategory);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Compliance & Regulatory"
        subtitle="GDPR, CCPA & Local Ad Law Enforcement"
        icon={<Shield className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium bg-green-50 px-3 py-1 rounded-full">
              <CheckCircle className="w-4 h-4" />
              0 Violations
            </span>
          </div>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Compliance Score"
          value="96"
          change={2.1}
          trend="up"
          suffix="%"
        />
        <KPICard
          label="Active Regulations"
          value={14}
          change={3}
          trend="up"
        />
        <KPICard
          label="Violations"
          value={0}
          change={0}
          trend="stable"
        />
        <KPICard
          label="Pending Reviews"
          value={3}
          change={1}
          trend="down"
        />
      </div>

      {/* Compliance Overview Pie + Country Compliance Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Compliance Overview PieChart */}
        <Card
          title="Compliance Overview"
          subtitle="Current regulation status distribution"
          actions={<Shield className="w-4 h-4 text-surface-400" />}
        >
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
                    formatter={(value: number) => `${value}%`}
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
        </Card>

        {/* Country Compliance BarChart */}
        <Card
          title="Country Compliance"
          subtitle="Compliance % by country"
          actions={<Globe className="w-4 h-4 text-surface-400" />}
        >
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
                  formatter={(value: number) => `${value}%`}
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
      </Card>

      {/* Flagged Campaigns */}
      <Card
        title="High-Risk Campaign Flags"
        subtitle="Campaigns flagged for compliance review"
        actions={
          <span className="flex items-center gap-1 text-xs text-yellow-600 font-medium bg-yellow-50 px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3" />
            {flaggedCampaigns.length} flagged
          </span>
        }
      >
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
      </Card>

      {/* Data Protection + Ad Restrictions Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Data Protection Compliance */}
        <Card
          title="Data Protection Compliance"
          subtitle="GDPR & global privacy requirements"
          actions={<Lock className="w-4 h-4 text-surface-400" />}
        >
          <div className="space-y-4">
            {dataProtectionItems.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="flex items-start gap-3 rounded-lg border border-surface-200 p-3"
                >
                  <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-4 h-4 text-green-600" />
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
        </Card>

        {/* Ad Restriction Enforcement */}
        <Card
          title="Ad Restriction Enforcement"
          subtitle="Restricted categories by country"
          actions={<XCircle className="w-4 h-4 text-surface-400" />}
        >
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
        </Card>
      </div>

      {/* Recent Compliance Audit Log */}
      <Card
        title="Recent Compliance Audit Log"
        subtitle="Latest automated compliance checks"
        actions={<FileText className="w-4 h-4 text-surface-400" />}
      >
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
      </Card>
    </div>
  );
}
