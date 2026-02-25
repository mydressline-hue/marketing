import { useState } from 'react';
import {
  AlertTriangle,
  Shield,
  Activity,
  Ban,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import {
  AreaChart,
  Area,
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FraudAlert {
  id: string;
  type: 'click_fraud' | 'bot_traffic' | 'conversion_anomaly' | 'budget_misuse';
  severity: 'critical' | 'high' | 'medium' | 'low';
  campaign: string;
  description: string;
  timestamp: string;
  status: 'active' | 'resolved';
}

interface ProtectionRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

interface ResolutionLogEntry {
  id: string;
  alertId: string;
  type: string;
  resolution: string;
  resolvedBy: string;
  resolvedAt: string;
  savingsRecovered: string;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const fraudAlerts: FraudAlert[] = [
  {
    id: 'FRD-001',
    type: 'click_fraud',
    severity: 'critical',
    campaign: 'Google Ads - US Brand Terms',
    description:
      'Detected 1,847 suspicious clicks from a single IP range (185.220.x.x) within 15 minutes. Click pattern matches known click farm behavior.',
    timestamp: '2026-02-25T14:32:00Z',
    status: 'active',
  },
  {
    id: 'FRD-002',
    type: 'bot_traffic',
    severity: 'high',
    campaign: 'Meta Ads - DE Retargeting',
    description:
      'Bot traffic spike detected: 34% of sessions showing zero scroll depth and sub-200ms page dwell time. Likely automated scraping bots.',
    timestamp: '2026-02-25T13:18:00Z',
    status: 'active',
  },
  {
    id: 'FRD-003',
    type: 'conversion_anomaly',
    severity: 'high',
    campaign: 'TikTok Ads - UK Prospecting',
    description:
      'Conversion rate jumped from 2.1% to 11.8% in the last 2 hours without corresponding revenue increase. Possible pixel firing issue or fake form submissions.',
    timestamp: '2026-02-25T12:45:00Z',
    status: 'active',
  },
  {
    id: 'FRD-004',
    type: 'budget_misuse',
    severity: 'critical',
    campaign: 'Google Ads - FR Display Network',
    description:
      'Daily budget of $2,500 exhausted by 10:30 AM due to placement on low-quality MFA (Made for Advertising) sites. $1,890 spent on suspicious inventory.',
    timestamp: '2026-02-25T10:30:00Z',
    status: 'active',
  },
  {
    id: 'FRD-005',
    type: 'click_fraud',
    severity: 'medium',
    campaign: 'Bing Ads - CA Search',
    description:
      'Elevated click-through rate (18.7%) on non-branded terms in Canada with 0% conversion rate. Pattern consistent with competitor click fraud.',
    timestamp: '2026-02-25T09:15:00Z',
    status: 'resolved',
  },
  {
    id: 'FRD-006',
    type: 'bot_traffic',
    severity: 'low',
    campaign: 'Meta Ads - AU Lookalike',
    description:
      'Minor bot traffic detected: 8% of sessions from data center IPs in Sydney region. Auto-blocked by IP exclusion rules.',
    timestamp: '2026-02-25T08:02:00Z',
    status: 'resolved',
  },
  {
    id: 'FRD-007',
    type: 'conversion_anomaly',
    severity: 'medium',
    campaign: 'Google Ads - US Shopping',
    description:
      'Add-to-cart events spiked 340% at 3 AM ET with no corresponding checkout completions. Likely bot-driven cart stuffing activity.',
    timestamp: '2026-02-25T03:12:00Z',
    status: 'active',
  },
];

const blockedClicksData = Array.from({ length: 30 }, (_, i) => {
  const day = i + 1;
  const baseBlocked = 120 + Math.floor(Math.random() * 80);
  const baseLegitimate = 2800 + Math.floor(Math.random() * 600);
  return {
    day: `Feb ${day}`,
    blocked: day === 25 ? 340 : day === 18 ? 280 : baseBlocked,
    legitimate: baseLegitimate,
  };
});

const botTrafficByCountry = [
  { country: 'United States', botPct: 3.1, volume: 14200 },
  { country: 'Germany', botPct: 1.8, volume: 6800 },
  { country: 'United Kingdom', botPct: 4.2, volume: 8900 },
  { country: 'India', botPct: 8.7, volume: 5400 },
  { country: 'Brazil', botPct: 6.3, volume: 3200 },
  { country: 'France', botPct: 2.1, volume: 4700 },
  { country: 'Canada', botPct: 1.5, volume: 3800 },
  { country: 'Russia', botPct: 12.4, volume: 2100 },
];

const protectionRulesData: ProtectionRule[] = [
  {
    id: 'rule-1',
    name: 'IP Frequency Cap',
    description: 'Block IPs exceeding 15 clicks per hour on the same campaign',
    enabled: true,
  },
  {
    id: 'rule-2',
    name: 'Data Center IP Blocking',
    description: 'Automatically exclude known data center and VPN IP ranges',
    enabled: true,
  },
  {
    id: 'rule-3',
    name: 'Geo-Mismatch Detection',
    description: 'Flag clicks where IP geolocation does not match targeting region',
    enabled: true,
  },
  {
    id: 'rule-4',
    name: 'Session Behavior Analysis',
    description: 'Flag sessions with zero scroll depth and sub-500ms dwell time',
    enabled: true,
  },
  {
    id: 'rule-5',
    name: 'Conversion Velocity Guard',
    description: 'Alert when conversion rate exceeds 3x baseline within a 1-hour window',
    enabled: true,
  },
  {
    id: 'rule-6',
    name: 'Budget Velocity Control',
    description: 'Pause campaigns spending over 50% of daily budget before noon',
    enabled: false,
  },
  {
    id: 'rule-7',
    name: 'Competitor Click Detection',
    description: 'Identify repeat clicks from IPs associated with competitor domains',
    enabled: true,
  },
  {
    id: 'rule-8',
    name: 'Placement Quality Filter',
    description: 'Block display placements with quality score below 40/100',
    enabled: true,
  },
];

const resolutionLog: ResolutionLogEntry[] = [
  {
    id: 'res-1',
    alertId: 'FRD-005',
    type: 'Click Fraud',
    resolution: 'Blocked 23 IPs and filed invalid click report with Bing Ads. Refund of $312 pending.',
    resolvedBy: 'Anomaly Detector Agent',
    resolvedAt: '2026-02-25T11:42:00Z',
    savingsRecovered: '$312',
  },
  {
    id: 'res-2',
    alertId: 'FRD-006',
    type: 'Bot Traffic',
    resolution: 'Added 14 data center IP ranges to exclusion list. Traffic normalized within 20 minutes.',
    resolvedBy: 'Anomaly Detector Agent',
    resolvedAt: '2026-02-25T08:45:00Z',
    savingsRecovered: '$89',
  },
  {
    id: 'res-3',
    alertId: 'FRD-098',
    type: 'Budget Misuse',
    resolution: 'Removed 47 low-quality MFA placements from display network. Budget reallocated to search.',
    resolvedBy: 'Budget Optimizer Agent',
    resolvedAt: '2026-02-24T16:20:00Z',
    savingsRecovered: '$1,430',
  },
  {
    id: 'res-4',
    alertId: 'FRD-094',
    type: 'Click Fraud',
    resolution:
      'Identified and blocked competitor click farm operating from Southeast Asia. Google refund approved for $2,100.',
    resolvedBy: 'Anomaly Detector Agent',
    resolvedAt: '2026-02-24T10:05:00Z',
    savingsRecovered: '$2,100',
  },
  {
    id: 'res-5',
    alertId: 'FRD-091',
    type: 'Conversion Anomaly',
    resolution:
      'Fixed duplicate pixel firing on checkout page for Meta Ads DE campaign. Conversion data corrected retroactively.',
    resolvedBy: 'Compliance Checker Agent',
    resolvedAt: '2026-02-23T14:38:00Z',
    savingsRecovered: '$0',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const typeLabels: Record<FraudAlert['type'], string> = {
  click_fraud: 'Click Fraud',
  bot_traffic: 'Bot Traffic',
  conversion_anomaly: 'Conversion Anomaly',
  budget_misuse: 'Budget Misuse',
};

const typeIcons: Record<FraudAlert['type'], JSX.Element> = {
  click_fraud: <Ban className="w-4 h-4 text-red-500" />,
  bot_traffic: <Activity className="w-4 h-4 text-orange-500" />,
  conversion_anomaly: <AlertTriangle className="w-4 h-4 text-yellow-500" />,
  budget_misuse: <XCircle className="w-4 h-4 text-purple-500" />,
};

const severityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-green-100 text-green-700 border-green-200',
};

const formatTimestamp = (ts: string) => {
  const date = new Date(ts);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FraudDetection() {
  const [rules, setRules] = useState<ProtectionRule[]>(protectionRulesData);

  const toggleRule = (ruleId: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r)),
    );
  };

  const activeAlerts = fraudAlerts.filter((a) => a.status === 'active').length;
  const resolvedAlerts = fraudAlerts.filter((a) => a.status === 'resolved').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Fraud & Anomaly Detection"
        subtitle="Click Fraud, Bot Detection & Conversion Anomaly Alerts"
        icon={<Shield className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm font-medium text-green-600 bg-green-50 px-3 py-1.5 rounded-full border border-green-200">
              <Shield className="w-3.5 h-3.5" />
              Protection Active
            </span>
          </div>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Fraud Blocked"
          value="24.5K"
          change={18.2}
          trend="up"
          prefix="$"
        />
        <KPICard
          label="Bot Traffic Detected"
          value="2.3"
          change={0.4}
          trend="down"
          suffix="%"
        />
        <KPICard
          label="Anomaly Alerts"
          value={7}
          change={3}
          trend="up"
        />
        <KPICard
          label="Protection Score"
          value="97"
          change={2.1}
          trend="up"
          suffix="%"
        />
      </div>

      {/* Active Alerts Table */}
      <Card
        title="Active Alerts"
        subtitle={`${activeAlerts} active / ${resolvedAlerts} resolved`}
        actions={
          <span className="flex items-center gap-1 text-xs text-red-600 font-medium bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
            <AlertTriangle className="w-3 h-3" />
            {fraudAlerts.filter((a) => a.severity === 'critical' && a.status === 'active').length} critical
          </span>
        }
      >
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-100">
                <th className="text-left py-3 px-2 font-medium text-surface-500 whitespace-nowrap">Alert ID</th>
                <th className="text-left py-3 px-2 font-medium text-surface-500 whitespace-nowrap">Type</th>
                <th className="text-left py-3 px-2 font-medium text-surface-500 whitespace-nowrap">Severity</th>
                <th className="text-left py-3 px-2 font-medium text-surface-500 whitespace-nowrap">Campaign</th>
                <th className="text-left py-3 px-2 font-medium text-surface-500 min-w-[280px]">Description</th>
                <th className="text-left py-3 px-2 font-medium text-surface-500 whitespace-nowrap">Timestamp</th>
                <th className="text-left py-3 px-2 font-medium text-surface-500 whitespace-nowrap">Status</th>
                <th className="text-left py-3 px-2 font-medium text-surface-500 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {fraudAlerts.map((alert) => (
                <tr key={alert.id} className="border-b border-surface-50 hover:bg-surface-50/50 transition-colors">
                  <td className="py-3 px-2 font-mono text-xs text-surface-600">{alert.id}</td>
                  <td className="py-3 px-2">
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      {typeIcons[alert.type]}
                      <span className="text-surface-700">{typeLabels[alert.type]}</span>
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${severityColors[alert.severity]}`}
                    >
                      {alert.severity}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-surface-700 whitespace-nowrap max-w-[200px] truncate">
                    {alert.campaign}
                  </td>
                  <td className="py-3 px-2 text-surface-600 text-xs leading-relaxed">
                    {alert.description}
                  </td>
                  <td className="py-3 px-2 text-surface-500 whitespace-nowrap text-xs">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTimestamp(alert.timestamp)}
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    <StatusBadge status={alert.status === 'resolved' ? 'completed' : 'error'} />
                  </td>
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-1">
                      <button
                        className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-500 hover:text-surface-700 transition-colors"
                        title="Investigate"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {alert.status === 'active' && (
                        <button
                          className="p-1.5 rounded-lg hover:bg-green-50 text-surface-500 hover:text-green-600 transition-colors"
                          title="Mark Resolved"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        className="p-1.5 rounded-lg hover:bg-red-50 text-surface-500 hover:text-red-600 transition-colors"
                        title="Block Source"
                      >
                        <Ban className="w-4 h-4" />
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
        {/* Fraud Detection AreaChart */}
        <Card
          title="Fraud Detection Overview"
          subtitle="Blocked vs Legitimate Clicks - Last 30 Days"
          actions={<Shield className="w-4 h-4 text-surface-400" />}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={blockedClicksData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="blockedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="legitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11 }}
                  stroke="#9ca3af"
                  interval={4}
                />
                <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="legitimate"
                  stroke="#22c55e"
                  strokeWidth={2}
                  fill="url(#legitGrad)"
                  name="Legitimate Clicks"
                />
                <Area
                  type="monotone"
                  dataKey="blocked"
                  stroke="#ef4444"
                  strokeWidth={2}
                  fill="url(#blockedGrad)"
                  name="Blocked Clicks"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Bot Traffic by Country BarChart */}
        <Card
          title="Bot Traffic Distribution"
          subtitle="Bot traffic percentage by country"
          actions={<Activity className="w-4 h-4 text-surface-400" />}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={botTrafficByCountry}
                margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                  tickFormatter={(v: number) => `${v}%`}
                />
                <YAxis
                  dataKey="country"
                  type="category"
                  tick={{ fontSize: 11 }}
                  stroke="#9ca3af"
                  width={100}
                />
                <Tooltip
                  formatter={(value: number) => [`${value}%`, 'Bot Traffic']}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                  }}
                />
                <Bar dataKey="botPct" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Bot %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Real-time Anomaly Monitor + Protection Rules */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Real-time Anomaly Monitor */}
        <Card
          title="Real-time Anomaly Monitor"
          subtitle="Live detection status"
          actions={
            <span className="flex items-center gap-1.5 text-xs text-surface-500">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              Monitoring
            </span>
          }
        >
          <div className="space-y-4">
            {/* CTR Anomaly Detection */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-green-200 bg-green-50/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                  <Activity className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-surface-800">CTR Anomaly Detection</p>
                  <p className="text-xs text-surface-500">All campaigns within normal range</p>
                </div>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
                <CheckCircle className="w-3 h-3" />
                Normal
              </span>
            </div>

            {/* CPC Spike Detection */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-yellow-200 bg-yellow-50/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-surface-800">CPC Spike Detection</p>
                  <p className="text-xs text-yellow-700 font-medium">15% above baseline in UK</p>
                </div>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-medium text-yellow-700 bg-yellow-100 px-2.5 py-1 rounded-full">
                <AlertTriangle className="w-3 h-3" />
                Warning
              </span>
            </div>

            {/* Conversion Tracking */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-green-200 bg-green-50/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-surface-800">Conversion Tracking</p>
                  <p className="text-xs text-surface-500">All pixels and events verified</p>
                </div>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
                <CheckCircle className="w-3 h-3" />
                Normal
              </span>
            </div>

            {/* Budget Velocity */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-red-200 bg-red-50/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                  <XCircle className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-surface-800">Budget Velocity</p>
                  <p className="text-xs text-red-700 font-medium">Spend rate 2x normal for Meta US</p>
                </div>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-100 px-2.5 py-1 rounded-full">
                <XCircle className="w-3 h-3" />
                Alert
              </span>
            </div>
          </div>
        </Card>

        {/* Protection Rules */}
        <Card
          title="Protection Rules"
          subtitle={`${rules.filter((r) => r.enabled).length} of ${rules.length} rules active`}
          actions={<Shield className="w-4 h-4 text-surface-400" />}
        >
          <div className="space-y-3 max-h-[380px] overflow-y-auto">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                  rule.enabled
                    ? 'border-surface-200 bg-white'
                    : 'border-surface-100 bg-surface-50'
                }`}
              >
                <div className="flex-1 min-w-0 mr-3">
                  <p
                    className={`text-sm font-medium ${
                      rule.enabled ? 'text-surface-800' : 'text-surface-400'
                    }`}
                  >
                    {rule.name}
                  </p>
                  <p
                    className={`text-xs mt-0.5 ${
                      rule.enabled ? 'text-surface-500' : 'text-surface-400'
                    }`}
                  >
                    {rule.description}
                  </p>
                </div>
                <button
                  onClick={() => toggleRule(rule.id)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                    rule.enabled ? 'bg-green-500' : 'bg-surface-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                      rule.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Resolution Log */}
      <Card
        title="Resolution Log"
        subtitle="Last 5 resolved fraud incidents"
        actions={<Clock className="w-4 h-4 text-surface-400" />}
      >
        <div className="space-y-3">
          {resolutionLog.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-4 p-4 rounded-lg border border-surface-200 bg-surface-50/50 hover:bg-surface-50 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle className="w-4 h-4 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-surface-800">{entry.alertId}</span>
                  <span className="text-xs font-medium text-surface-500 bg-surface-100 px-2 py-0.5 rounded-full">
                    {entry.type}
                  </span>
                  {entry.savingsRecovered !== '$0' && (
                    <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                      {entry.savingsRecovered} recovered
                    </span>
                  )}
                </div>
                <p className="text-sm text-surface-600 mt-1">{entry.resolution}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-surface-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTimestamp(entry.resolvedAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    {entry.resolvedBy}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
