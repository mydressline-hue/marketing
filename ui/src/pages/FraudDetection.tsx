import React, { useState } from 'react';
import {
  AlertTriangle,
  Shield,
  Activity,
  Ban,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
  Play,
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
import { useApiQuery, useApiMutation } from '../hooks/useApi';
import { TableSkeleton, ChartSkeleton, CardSkeleton } from '../components/shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../components/shared/ErrorBoundary';
import EmptyState from '../components/shared/EmptyState';

// ---------------------------------------------------------------------------
// API response types
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

interface BlockedClickEntry {
  day: string;
  blocked: number;
  legitimate: number;
}

interface BotTrafficEntry {
  country: string;
  botPct: number;
  volume: number;
}

interface AnomalyMonitorEntry {
  id: string;
  label: string;
  detail: string;
  status: 'normal' | 'warning' | 'alert';
}

interface AlertsResponse {
  alerts: FraudAlert[];
  blockedClicksData: BlockedClickEntry[];
  botTrafficByCountry: BotTrafficEntry[];
  anomalyMonitor: AnomalyMonitorEntry[];
  resolutionLog: ResolutionLogEntry[];
  kpis: {
    fraudBlocked: string;
    fraudBlockedChange: number;
    botTrafficDetected: string;
    botTrafficChange: number;
    anomalyAlerts: number;
    anomalyAlertsChange: number;
    protectionScore: string;
    protectionScoreChange: number;
  };
}

interface RulesResponse {
  rules: ProtectionRule[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const typeLabels: Record<FraudAlert['type'], string> = {
  click_fraud: 'Click Fraud',
  bot_traffic: 'Bot Traffic',
  conversion_anomaly: 'Conversion Anomaly',
  budget_misuse: 'Budget Misuse',
};

const typeIcons: Record<FraudAlert['type'], React.ReactElement> = {
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

const anomalyStatusConfig: Record<string, { border: string; bg: string; iconBg: string; icon: React.ReactElement; badge: string; badgeBg: string; badgeLabel: string }> = {
  normal: {
    border: 'border-green-200',
    bg: 'bg-green-50/50',
    iconBg: 'bg-green-100',
    icon: <Activity className="w-4 h-4 text-green-600" />,
    badge: 'text-green-700',
    badgeBg: 'bg-green-100',
    badgeLabel: 'Normal',
  },
  warning: {
    border: 'border-yellow-200',
    bg: 'bg-yellow-50/50',
    iconBg: 'bg-yellow-100',
    icon: <AlertTriangle className="w-4 h-4 text-yellow-600" />,
    badge: 'text-yellow-700',
    badgeBg: 'bg-yellow-100',
    badgeLabel: 'Warning',
  },
  alert: {
    border: 'border-red-200',
    bg: 'bg-red-50/50',
    iconBg: 'bg-red-100',
    icon: <XCircle className="w-4 h-4 text-red-600" />,
    badge: 'text-red-700',
    badgeBg: 'bg-red-100',
    badgeLabel: 'Alert',
  },
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
  const [localRuleOverrides, setLocalRuleOverrides] = useState<Record<string, boolean>>({});

  // ------ API calls ------
  const {
    data: alertsData,
    loading: alertsLoading,
    error: alertsError,
    refetch: refetchAlerts,
  } = useApiQuery<AlertsResponse>('/v1/agents/fraud-detection/alerts');

  const {
    data: rulesData,
    loading: rulesLoading,
    error: rulesError,
    refetch: refetchRules,
  } = useApiQuery<RulesResponse>('/v1/agents/fraud-detection/rules');

  const {
    mutate: runAgent,
    loading: agentRunning,
  } = useApiMutation<{ status: string }>('/v1/agents/fraud-detection/run', { method: 'POST' });

  const {
    mutate: resolveAlert,
    loading: resolving,
  } = useApiMutation<{ status: string }>('/v1/alerts?type=fraud', { method: 'PUT' });

  const {
    mutate: toggleRuleApi,
  } = useApiMutation<{ status: string }>('/v1/agents/fraud-detection/rules', { method: 'PUT' });

  // ------ Derived data ------
  const fraudAlerts = alertsData?.alerts ?? [];
  const blockedClicksData = alertsData?.blockedClicksData ?? [];
  const botTrafficByCountry = alertsData?.botTrafficByCountry ?? [];
  const anomalyMonitor = alertsData?.anomalyMonitor ?? [];
  const resolutionLog = alertsData?.resolutionLog ?? [];
  const kpis = alertsData?.kpis;

  const rules = (rulesData?.rules ?? []).map((r) => ({
    ...r,
    enabled: localRuleOverrides[r.id] !== undefined ? localRuleOverrides[r.id] : r.enabled,
  }));

  const activeAlerts = fraudAlerts.filter((a) => a.status === 'active').length;
  const resolvedAlerts = fraudAlerts.filter((a) => a.status === 'resolved').length;

  // ------ Handlers ------
  const handleRunAgent = async () => {
    await runAgent();
    refetchAlerts();
    refetchRules();
  };

  const handleResolveAlert = async (alertId: string) => {
    await resolveAlert({ alertId, action: 'resolve' });
    refetchAlerts();
  };

  const handleBlockSource = async (alertId: string) => {
    await resolveAlert({ alertId, action: 'block_source' });
    refetchAlerts();
  };

  const toggleRule = async (ruleId: string) => {
    const currentRule = rules.find((r) => r.id === ruleId);
    if (!currentRule) return;
    const newEnabled = !currentRule.enabled;
    // Optimistic update
    setLocalRuleOverrides((prev) => ({ ...prev, [ruleId]: newEnabled }));
    await toggleRuleApi({ ruleId, enabled: newEnabled });
    refetchRules();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Fraud & Anomaly Detection"
        subtitle="Click Fraud, Bot Detection & Conversion Anomaly Alerts"
        icon={<Shield className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={handleRunAgent}
              disabled={agentRunning}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              {agentRunning ? 'Running...' : 'Run Agent'}
            </button>
            <span className="flex items-center gap-1.5 text-sm font-medium text-green-600 bg-green-50 px-3 py-1.5 rounded-full border border-green-200">
              <Shield className="w-3.5 h-3.5" />
              Protection Active
            </span>
          </div>
        }
      />

      {/* KPI Row */}
      {alertsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-surface-200 p-5">
              <CardSkeleton lines={2} />
            </div>
          ))}
        </div>
      ) : alertsError ? (
        <ApiErrorDisplay error={alertsError} onRetry={refetchAlerts} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Fraud Blocked"
            value={kpis?.fraudBlocked ?? '0'}
            change={kpis?.fraudBlockedChange ?? 0}
            trend="up"
            prefix="$"
          />
          <KPICard
            label="Bot Traffic Detected"
            value={kpis?.botTrafficDetected ?? '0'}
            change={kpis?.botTrafficChange ?? 0}
            trend="down"
            suffix="%"
          />
          <KPICard
            label="Anomaly Alerts"
            value={kpis?.anomalyAlerts ?? 0}
            change={kpis?.anomalyAlertsChange ?? 0}
            trend="up"
          />
          <KPICard
            label="Protection Score"
            value={kpis?.protectionScore ?? '0'}
            change={kpis?.protectionScoreChange ?? 0}
            trend="up"
            suffix="%"
          />
        </div>
      )}

      {/* Active Alerts Table */}
      <Card
        title="Active Alerts"
        subtitle={alertsLoading ? 'Loading...' : `${activeAlerts} active / ${resolvedAlerts} resolved`}
        actions={
          alertsLoading ? null : (
            <span className="flex items-center gap-1 text-xs text-red-600 font-medium bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
              <AlertTriangle className="w-3 h-3" />
              {fraudAlerts.filter((a) => a.severity === 'critical' && a.status === 'active').length} critical
            </span>
          )
        }
      >
        {alertsLoading ? (
          <TableSkeleton rows={6} columns={8} />
        ) : alertsError ? (
          <ApiErrorDisplay error={alertsError} onRetry={refetchAlerts} />
        ) : fraudAlerts.length === 0 ? (
          <EmptyState
            title="No fraud alerts"
            message="No fraud or anomaly alerts have been detected. Your campaigns are running clean."
            icon={<Shield className="w-6 h-6 text-green-500" />}
          />
        ) : (
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
                            onClick={() => handleResolveAlert(alert.id)}
                            disabled={resolving}
                            className="p-1.5 rounded-lg hover:bg-green-50 text-surface-500 hover:text-green-600 transition-colors disabled:opacity-50"
                            title="Mark Resolved"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleBlockSource(alert.id)}
                          disabled={resolving}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-surface-500 hover:text-red-600 transition-colors disabled:opacity-50"
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
        )}
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fraud Detection AreaChart */}
        <Card
          title="Fraud Detection Overview"
          subtitle="Blocked vs Legitimate Clicks - Last 30 Days"
          actions={<Shield className="w-4 h-4 text-surface-400" />}
        >
          {alertsLoading ? (
            <ChartSkeleton height="h-72" />
          ) : alertsError ? (
            <ApiErrorDisplay error={alertsError} onRetry={refetchAlerts} />
          ) : blockedClicksData.length === 0 ? (
            <EmptyState title="No click data" message="Blocked vs legitimate click data is not available yet." />
          ) : (
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
          )}
        </Card>

        {/* Bot Traffic by Country BarChart */}
        <Card
          title="Bot Traffic Distribution"
          subtitle="Bot traffic percentage by country"
          actions={<Activity className="w-4 h-4 text-surface-400" />}
        >
          {alertsLoading ? (
            <ChartSkeleton height="h-72" />
          ) : alertsError ? (
            <ApiErrorDisplay error={alertsError} onRetry={refetchAlerts} />
          ) : botTrafficByCountry.length === 0 ? (
            <EmptyState title="No bot traffic data" message="Bot traffic distribution data is not available yet." />
          ) : (
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
                    formatter={(value: number | undefined) => [`${value ?? 0}%`, 'Bot Traffic']}
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
          )}
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
          {alertsLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-surface-200 p-3">
                  <CardSkeleton lines={2} />
                </div>
              ))}
            </div>
          ) : alertsError ? (
            <ApiErrorDisplay error={alertsError} onRetry={refetchAlerts} />
          ) : anomalyMonitor.length === 0 ? (
            <EmptyState
              title="No monitors active"
              message="Real-time anomaly monitors are not reporting yet."
              icon={<Activity className="w-6 h-6 text-surface-400" />}
            />
          ) : (
            <div className="space-y-4">
              {anomalyMonitor.map((entry) => {
                const cfg = anomalyStatusConfig[entry.status] || anomalyStatusConfig.normal;
                return (
                  <div
                    key={entry.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${cfg.border} ${cfg.bg}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg ${cfg.iconBg} flex items-center justify-center`}>
                        {cfg.icon}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-surface-800">{entry.label}</p>
                        <p className={`text-xs ${entry.status === 'normal' ? 'text-surface-500' : `${cfg.badge} font-medium`}`}>
                          {entry.detail}
                        </p>
                      </div>
                    </div>
                    <span className={`flex items-center gap-1.5 text-xs font-medium ${cfg.badge} ${cfg.badgeBg} px-2.5 py-1 rounded-full`}>
                      {entry.status === 'normal' ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : entry.status === 'warning' ? (
                        <AlertTriangle className="w-3 h-3" />
                      ) : (
                        <XCircle className="w-3 h-3" />
                      )}
                      {cfg.badgeLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Protection Rules */}
        <Card
          title="Protection Rules"
          subtitle={rulesLoading ? 'Loading...' : `${rules.filter((r) => r.enabled).length} of ${rules.length} rules active`}
          actions={<Shield className="w-4 h-4 text-surface-400" />}
        >
          {rulesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-surface-200 p-3">
                  <CardSkeleton lines={2} />
                </div>
              ))}
            </div>
          ) : rulesError ? (
            <ApiErrorDisplay error={rulesError} onRetry={refetchRules} />
          ) : rules.length === 0 ? (
            <EmptyState
              title="No protection rules"
              message="No fraud protection rules have been configured yet."
              icon={<Shield className="w-6 h-6 text-surface-400" />}
            />
          ) : (
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
          )}
        </Card>
      </div>

      {/* Resolution Log */}
      <Card
        title="Resolution Log"
        subtitle="Recent resolved fraud incidents"
        actions={<Clock className="w-4 h-4 text-surface-400" />}
      >
        {alertsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-surface-200 p-4">
                <CardSkeleton lines={3} />
              </div>
            ))}
          </div>
        ) : alertsError ? (
          <ApiErrorDisplay error={alertsError} onRetry={refetchAlerts} />
        ) : resolutionLog.length === 0 ? (
          <EmptyState
            title="No resolutions yet"
            message="Resolved fraud incidents will appear here."
            icon={<CheckCircle className="w-6 h-6 text-surface-400" />}
          />
        ) : (
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
        )}
      </Card>
    </div>
  );
}
