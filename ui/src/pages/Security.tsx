import { useState } from 'react';
import {
  Lock,
  Shield,
  Key,
  Eye,
  AlertTriangle,
  CheckCircle,
  Users,
  Clock,
  RefreshCw,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import KPICard from '../components/shared/KPICard';
import StatusBadge from '../components/shared/StatusBadge';
import { useApiQuery, useApiMutation } from '../hooks/useApi';
import { TableSkeleton, ChartSkeleton, CardSkeleton, KPIRowSkeleton } from '../components/shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../components/shared/ErrorBoundary';
import EmptyState from '../components/shared/EmptyState';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiKey {
  id: string;
  name: string;
  service: string;
  created: string;
  lastUsed: string;
  status: 'active' | 'inactive' | 'expired';
  rotation: string;
  expiresIn: string;
  requests?: number;
}

interface SecurityEvent {
  name: string;
  value: number;
  color: string;
}

interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  ip: string;
  status: 'completed' | 'active' | 'warning';
}

interface ThreatScan {
  id: string;
  target: string;
  result: string;
  vulnerabilities: number;
  lastScan: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface SOC2Item {
  id: string;
  category: string;
  status: 'pass' | 'warning' | 'fail';
  detail: string;
  lastAudit: string;
}

interface SecurityData {
  kpis: {
    securityScore: string;
    securityScoreChange: number;
    apiKeysActive: number;
    apiKeysChange: number;
    accessViolations: number;
    accessViolationsChange: number;
    threatsBlocked: number;
    threatsBlockedChange: number;
  };
  encryption: {
    atRest: string;
    inTransit: string;
  };
  secretVault: {
    provider: string;
    status: string;
    lastRotation: string;
  };
  ddosProtection: {
    status: string;
    attacksBlocked: number;
    uptime: string;
  };
  mfa: {
    adminAccounts: string;
    allUsers: string;
    method: string;
  };
  securityEventsByType: SecurityEvent[];
  threatScans: ThreatScan[];
  soc2Checklist: SOC2Item[];
  roles: {
    role: string;
    iconType: string;
    users: number;
    permissions: Record<string, string>;
  }[];
  sessions: {
    user: string;
    role: string;
    location: string;
    device: string;
    since: string;
  }[];
}

interface ApiKeysData {
  keys: ApiKey[];
}

interface AuditData {
  entries: AuditEntry[];
}

interface SecurityAgentResult {
  status: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Static data for roles / permissions display
// ---------------------------------------------------------------------------

const permissionColumns = ['API Keys', 'Campaigns', 'Billing', 'Analytics', 'User Mgmt', 'Kill Switch'];

const roleIconMap: Record<string, typeof Shield> = {
  shield: Shield,
  eye: Eye,
  users: Users,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const permissionBadge = (level: string) => {
  switch (level) {
    case 'full':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-full px-2 py-0.5">
          Full
        </span>
      );
    case 'read':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-full px-2 py-0.5">
          Read
        </span>
      );
    case 'none':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-surface-400 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-full px-2 py-0.5">
          None
        </span>
      );
    default:
      return null;
  }
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Security() {
  const [selectedTab, setSelectedTab] = useState<'overview' | 'keys' | 'access' | 'audit'>('overview');

  // ---- API queries ---------------------------------------------------------
  const security = useApiQuery<SecurityData>('/v1/infrastructure/security');
  const apiKeysQuery = useApiQuery<ApiKeysData>('/v1/settings/api-keys');
  const auditQuery = useApiQuery<AuditData>('/v1/audit');

  // ---- Mutations -----------------------------------------------------------
  const scanAgent = useApiMutation<SecurityAgentResult>('/v1/agents/security/run', { method: 'POST' });
  const rotateKey = useApiMutation<{ success: boolean }>('/v1/settings/api-keys', { method: 'PUT' });

  // ---- Derived data --------------------------------------------------------
  const secData = security.data;
  const apiKeys = apiKeysQuery.data?.keys ?? [];
  const auditEntries = auditQuery.data?.entries ?? [];

  const handleRunScan = async () => {
    await scanAgent.mutate({});
    security.refetch();
  };

  const handleRotateKey = async (keyId: string) => {
    await rotateKey.mutate({ keyId, action: 'rotate' });
    apiKeysQuery.refetch();
  };

  const tabs = [
    { key: 'overview' as const, label: 'Overview', icon: Shield },
    { key: 'keys' as const, label: 'API Keys', icon: Key },
    { key: 'access' as const, label: 'Access Control', icon: Users },
    { key: 'audit' as const, label: 'Audit & Compliance', icon: Eye },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Enterprise Security"
        subtitle="API Protection, Access Control & SOC2 Compliance"
        icon={<Shield className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-3">
            {secData && (
              <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                <Lock className="w-4 h-4" />
                All systems secured
              </span>
            )}
            <button
              onClick={handleRunScan}
              disabled={scanAgent.loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanAgent.loading ? 'animate-spin' : ''}`} />
              {scanAgent.loading ? 'Scanning...' : 'Run Security Scan'}
            </button>
          </div>
        }
      />

      {/* KPI Row */}
      {security.loading ? (
        <KPIRowSkeleton count={4} />
      ) : security.error ? (
        <ApiErrorDisplay error={security.error} onRetry={security.refetch} />
      ) : secData ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Security Score"
            value={secData.kpis.securityScore}
            change={secData.kpis.securityScoreChange}
            trend="up"
          />
          <KPICard
            label="API Keys Active"
            value={secData.kpis.apiKeysActive}
            change={secData.kpis.apiKeysChange}
            trend="stable"
          />
          <KPICard
            label="Access Violations"
            value={secData.kpis.accessViolations}
            change={secData.kpis.accessViolationsChange}
            trend="down"
          />
          <KPICard
            label="Threats Blocked"
            value={secData.kpis.threatsBlocked}
            change={secData.kpis.threatsBlockedChange}
            trend="up"
          />
        </div>
      ) : null}

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 bg-surface-100 dark:bg-surface-700 rounded-lg p-1 w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setSelectedTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                selectedTab === tab.key
                  ? 'bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 shadow-sm'
                  : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* === OVERVIEW TAB === */}
      {selectedTab === 'overview' && (
        <div className="space-y-6">
          {security.loading ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <CardSkeleton key={i} lines={3} />
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartSkeleton />
                <ChartSkeleton />
              </div>
              <CardSkeleton lines={6} />
            </>
          ) : security.error ? (
            <ApiErrorDisplay error={security.error} onRetry={security.refetch} />
          ) : secData ? (
            <>
              {/* Security Overview Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Encryption */}
                <Card title="Encryption" className="relative">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-surface-600 dark:text-surface-300">At Rest</span>
                      <span className="flex items-center gap-1 text-sm font-medium text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        {secData.encryption.atRest}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-surface-600 dark:text-surface-300">In Transit</span>
                      <span className="flex items-center gap-1 text-sm font-medium text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        {secData.encryption.inTransit}
                      </span>
                    </div>
                  </div>
                  <div className="absolute top-4 right-4">
                    <Lock className="w-5 h-5 text-indigo-400" />
                  </div>
                </Card>

                {/* Secret Vault */}
                <Card title="Secret Vault" className="relative">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-surface-600 dark:text-surface-300">Provider</span>
                      <span className="text-sm font-medium text-surface-900 dark:text-surface-100">{secData.secretVault.provider}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-surface-600 dark:text-surface-300">Status</span>
                      <StatusBadge status={secData.secretVault.status} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-surface-600 dark:text-surface-300">Last rotation</span>
                      <span className="flex items-center gap-1 text-sm text-surface-700 dark:text-surface-200">
                        <Clock className="w-3.5 h-3.5 text-surface-400" />
                        {secData.secretVault.lastRotation}
                      </span>
                    </div>
                  </div>
                  <div className="absolute top-4 right-4">
                    <Key className="w-5 h-5 text-indigo-400" />
                  </div>
                </Card>

                {/* DDoS Protection */}
                <Card title="DDoS Protection" className="relative">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-surface-600 dark:text-surface-300">Status</span>
                      <StatusBadge status={secData.ddosProtection.status} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-surface-600 dark:text-surface-300">Attacks blocked</span>
                      <span className="text-sm font-semibold text-red-600">{secData.ddosProtection.attacksBlocked}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-surface-600 dark:text-surface-300">Uptime</span>
                      <span className="text-sm font-medium text-green-600">{secData.ddosProtection.uptime}</span>
                    </div>
                  </div>
                  <div className="absolute top-4 right-4">
                    <Shield className="w-5 h-5 text-indigo-400" />
                  </div>
                </Card>

                {/* MFA Status */}
                <Card title="MFA Status" className="relative">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-surface-600 dark:text-surface-300">Admin accounts</span>
                      <span className="flex items-center gap-1 text-sm font-medium text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        {secData.mfa.adminAccounts}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-surface-600 dark:text-surface-300">All users</span>
                      <span className="flex items-center gap-1 text-sm font-medium text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        {secData.mfa.allUsers}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-surface-600 dark:text-surface-300">Method</span>
                      <span className="text-sm font-medium text-surface-900 dark:text-surface-100">{secData.mfa.method}</span>
                    </div>
                  </div>
                  <div className="absolute top-4 right-4">
                    <Users className="w-5 h-5 text-indigo-400" />
                  </div>
                </Card>
              </div>

              {/* Security Events Chart + Threat Detection */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Security Events Pie Chart */}
                <Card title="Security Events by Type" subtitle="Last 30 days">
                  {secData.securityEventsByType.length === 0 ? (
                    <EmptyState title="No security events" description="No events recorded in the last 30 days." />
                  ) : (
                    <div className="h-72 flex items-center">
                      <ResponsiveContainer width="50%" height="100%">
                        <PieChart>
                          <Pie
                            data={secData.securityEventsByType}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={90}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {secData.securityEventsByType.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              borderRadius: '8px',
                              border: '1px solid #e5e7eb',
                              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="w-1/2 space-y-2">
                        {secData.securityEventsByType.map((entry) => (
                          <div key={entry.name} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: entry.color }}
                              />
                              <span className="text-surface-600 dark:text-surface-300">{entry.name}</span>
                            </div>
                            <span className="font-semibold text-surface-900 dark:text-surface-100">{entry.value.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>

                {/* Threat Detection Panel */}
                <Card
                  title="Threat Detection"
                  subtitle="Latest scan results"
                  actions={
                    <span className="flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 dark:bg-green-500/10 px-2.5 py-1 rounded-full">
                      <CheckCircle className="w-3 h-3" />
                      Scan complete
                    </span>
                  }
                >
                  {secData.threatScans.length === 0 ? (
                    <EmptyState title="No scan results" description="Run a security scan to see threat detection results." />
                  ) : (
                    <div className="space-y-3">
                      {secData.threatScans.map((scan) => (
                        <div
                          key={scan.id}
                          className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                            scan.vulnerabilities > 0
                              ? 'border-yellow-200 dark:border-yellow-500/30 bg-yellow-50 dark:bg-yellow-500/10'
                              : 'border-surface-200 dark:border-surface-700 bg-surface-50/40 dark:bg-surface-800/40'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {scan.vulnerabilities === 0 ? (
                              <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
                            )}
                            <div>
                              <p className="text-sm font-medium text-surface-900 dark:text-surface-100">{scan.target}</p>
                              <p className="text-xs text-surface-500 dark:text-surface-400">{scan.lastScan}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-medium ${scan.vulnerabilities > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                              {scan.result}
                            </p>
                            <p className="text-xs text-surface-400">
                              {scan.vulnerabilities} {scan.vulnerabilities === 1 ? 'issue' : 'issues'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              {/* SOC2 Readiness Checklist */}
              <Card
                title="SOC2 Readiness Checklist"
                subtitle="Type II compliance status"
                actions={
                  secData.soc2Checklist.length > 0 ? (
                    <span className="text-xs text-surface-500 dark:text-surface-400">Last audit: {secData.soc2Checklist[0].lastAudit}</span>
                  ) : undefined
                }
              >
                {secData.soc2Checklist.length === 0 ? (
                  <EmptyState title="No compliance data" description="SOC2 checklist data is not available." />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {secData.soc2Checklist.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-start gap-3 rounded-lg border p-4 ${
                          item.status === 'pass'
                            ? 'border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-500/10'
                            : 'border-yellow-200 dark:border-yellow-500/30 bg-yellow-50 dark:bg-yellow-500/10'
                        }`}
                      >
                        {item.status === 'pass' ? (
                          <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">{item.category}</p>
                          <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{item.detail}</p>
                          <p className="text-xs text-surface-400 mt-1">Audited: {item.lastAudit}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          ) : null}
        </div>
      )}

      {/* === API KEYS TAB === */}
      {selectedTab === 'keys' && (
        <div className="space-y-6">
          {apiKeysQuery.loading ? (
            <>
              <TableSkeleton rows={6} cols={7} />
              <ChartSkeleton />
            </>
          ) : apiKeysQuery.error ? (
            <ApiErrorDisplay error={apiKeysQuery.error} onRetry={apiKeysQuery.refetch} />
          ) : apiKeys.length === 0 ? (
            <EmptyState
              title="No API keys"
              description="No API keys have been created yet."
              icon={<Key className="w-6 h-6 text-surface-400" />}
            />
          ) : (
            <>
              <Card
                title="API Key Management"
                subtitle="Manage service credentials and rotation schedules"
                actions={
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
                    <Key className="w-3.5 h-3.5" />
                    Generate New Key
                  </button>
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-200 dark:border-surface-700">
                        <th className="text-left py-3 px-4 font-semibold text-surface-600 dark:text-surface-300">Key Name</th>
                        <th className="text-left py-3 px-4 font-semibold text-surface-600 dark:text-surface-300">Service</th>
                        <th className="text-left py-3 px-4 font-semibold text-surface-600 dark:text-surface-300">Created</th>
                        <th className="text-left py-3 px-4 font-semibold text-surface-600 dark:text-surface-300">Last Used</th>
                        <th className="text-left py-3 px-4 font-semibold text-surface-600 dark:text-surface-300">Status</th>
                        <th className="text-left py-3 px-4 font-semibold text-surface-600 dark:text-surface-300">Rotation Schedule</th>
                        <th className="text-left py-3 px-4 font-semibold text-surface-600 dark:text-surface-300">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apiKeys.map((key) => (
                        <tr key={key.id} className="border-b border-surface-100 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <Key className="w-4 h-4 text-indigo-400" />
                              <span className="font-medium text-surface-900 dark:text-surface-100">{key.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-surface-600 dark:text-surface-300">{key.service}</td>
                          <td className="py-3 px-4 text-surface-600 dark:text-surface-300">{key.created}</td>
                          <td className="py-3 px-4 text-surface-600 dark:text-surface-300">{key.lastUsed}</td>
                          <td className="py-3 px-4">
                            <StatusBadge status={key.status} />
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <span className="text-surface-700 dark:text-surface-200">{key.rotation}</span>
                              <p className="text-xs text-surface-400">Expires in {key.expiresIn}</p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleRotateKey(key.id)}
                                disabled={rotateKey.loading}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 rounded-md hover:bg-indigo-100 transition-colors disabled:opacity-50"
                              >
                                <RefreshCw className={`w-3 h-3 ${rotateKey.loading ? 'animate-spin' : ''}`} />
                                Rotate
                              </button>
                              <button className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-surface-600 dark:text-surface-300 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-md hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors">
                                <Eye className="w-3 h-3" />
                                View
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Key Usage Bar Chart */}
              <Card title="API Key Usage" subtitle="Requests per key (last 7 days)">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={apiKeys.map((k) => ({
                        name: k.name,
                        requests: k.requests ?? 0,
                      }))}
                      margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                      <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid #e5e7eb',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                        }}
                        formatter={(value: number | undefined) => [(value ?? 0).toLocaleString(), 'Requests']}
                      />
                      <Bar dataKey="requests" fill="#6366f1" radius={[4, 4, 0, 0]} name="Requests" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* === ACCESS CONTROL TAB === */}
      {selectedTab === 'access' && (
        <div className="space-y-6">
          {security.loading ? (
            <>
              <TableSkeleton rows={4} cols={8} />
              <CardSkeleton lines={4} />
            </>
          ) : security.error ? (
            <ApiErrorDisplay error={security.error} onRetry={security.refetch} />
          ) : secData ? (
            <>
              <Card
                title="Role-Based Access Control"
                subtitle="Permission matrix by role"
                actions={
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 rounded-lg hover:bg-indigo-100 transition-colors">
                    <Users className="w-3.5 h-3.5" />
                    Manage Roles
                  </button>
                }
              >
                {secData.roles.length === 0 ? (
                  <EmptyState title="No roles defined" description="Configure roles to manage access control." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-surface-200 dark:border-surface-700">
                          <th className="text-left py-3 px-4 font-semibold text-surface-600 dark:text-surface-300">Role</th>
                          <th className="text-left py-3 px-4 font-semibold text-surface-600 dark:text-surface-300">Users</th>
                          {permissionColumns.map((col) => (
                            <th key={col} className="text-center py-3 px-4 font-semibold text-surface-600 dark:text-surface-300">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {secData.roles.map((role) => {
                          const Icon = roleIconMap[role.iconType] ?? Shield;
                          return (
                            <tr key={role.role} className="border-b border-surface-100 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
                                    <Icon className="w-4 h-4 text-indigo-500" />
                                  </div>
                                  <span className="font-medium text-surface-900 dark:text-surface-100">{role.role}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-surface-600 dark:text-surface-300">{role.users}</td>
                              {permissionColumns.map((col) => (
                                <td key={col} className="py-3 px-4 text-center">
                                  {permissionBadge(role.permissions[col] ?? 'none')}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {/* Active Sessions */}
              <Card title="Active Sessions" subtitle="Currently authenticated users">
                {secData.sessions.length === 0 ? (
                  <EmptyState title="No active sessions" description="No users are currently authenticated." />
                ) : (
                  <div className="space-y-3">
                    {secData.sessions.map((session) => (
                      <div
                        key={session.user}
                        className="flex items-center justify-between rounded-lg border border-surface-200 dark:border-surface-700 px-4 py-3 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-600">
                            {session.user.split('.')[0]?.[0]?.toUpperCase() ?? ''}{session.user.split('.')[1]?.[0]?.toUpperCase() ?? ''}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-surface-900 dark:text-surface-100">{session.user}</p>
                            <p className="text-xs text-surface-500 dark:text-surface-400">{session.role} -- {session.location}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-surface-600 dark:text-surface-300">{session.device}</p>
                          <p className="text-xs text-surface-400">Active for {session.since}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          ) : null}
        </div>
      )}

      {/* === AUDIT & COMPLIANCE TAB === */}
      {selectedTab === 'audit' && (
        <div className="space-y-6">
          {auditQuery.loading || security.loading ? (
            <>
              <TableSkeleton rows={8} cols={5} />
              <CardSkeleton lines={6} />
              <ChartSkeleton />
            </>
          ) : auditQuery.error ? (
            <ApiErrorDisplay error={auditQuery.error} onRetry={auditQuery.refetch} />
          ) : (
            <>
              {/* Audit Log */}
              <Card
                title="Audit Log"
                subtitle={`Last ${auditEntries.length} security events`}
                actions={
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-surface-600 dark:text-surface-300 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors">
                    Export Log
                  </button>
                }
              >
                {auditEntries.length === 0 ? (
                  <EmptyState title="No audit entries" description="No security events have been recorded." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-surface-200 dark:border-surface-700">
                          <th className="text-left py-3 px-4 font-semibold text-surface-600 dark:text-surface-300">Timestamp</th>
                          <th className="text-left py-3 px-4 font-semibold text-surface-600 dark:text-surface-300">User</th>
                          <th className="text-left py-3 px-4 font-semibold text-surface-600 dark:text-surface-300">Action</th>
                          <th className="text-left py-3 px-4 font-semibold text-surface-600 dark:text-surface-300">IP Address</th>
                          <th className="text-left py-3 px-4 font-semibold text-surface-600 dark:text-surface-300">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditEntries.map((event) => (
                          <tr key={event.id} className="border-b border-surface-100 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors">
                            <td className="py-3 px-4">
                              <span className="flex items-center gap-1.5 text-surface-600 dark:text-surface-300">
                                <Clock className="w-3.5 h-3.5 text-surface-400" />
                                {event.timestamp}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-medium text-surface-800 dark:text-surface-200">{event.user}</td>
                            <td className="py-3 px-4 text-surface-600 dark:text-surface-300">{event.action}</td>
                            <td className="py-3 px-4 font-mono text-xs text-surface-500 dark:text-surface-400">{event.ip}</td>
                            <td className="py-3 px-4">
                              <StatusBadge status={event.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {/* SOC2 Readiness */}
              {secData && (
                <Card
                  title="SOC2 Readiness Checklist"
                  subtitle="Type II compliance status"
                  actions={
                    secData.soc2Checklist.length > 0 ? (
                      <span className="text-xs text-surface-500 dark:text-surface-400">Last audit: {secData.soc2Checklist[0].lastAudit}</span>
                    ) : undefined
                  }
                >
                  {secData.soc2Checklist.length === 0 ? (
                    <EmptyState title="No compliance data" description="SOC2 checklist data is not available." />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {secData.soc2Checklist.map((item) => (
                        <div
                          key={item.id}
                          className={`flex items-start gap-3 rounded-lg border p-4 ${
                            item.status === 'pass'
                              ? 'border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-500/10'
                              : 'border-yellow-200 dark:border-yellow-500/30 bg-yellow-50 dark:bg-yellow-500/10'
                          }`}
                        >
                          {item.status === 'pass' ? (
                            <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                          ) : (
                            <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">{item.category}</p>
                            <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{item.detail}</p>
                            <p className="text-xs text-surface-400 mt-1">Audited: {item.lastAudit}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}

              {/* Security Events Chart in Audit Tab */}
              {secData && secData.securityEventsByType.length > 0 && (
                <Card title="Security Events Distribution" subtitle="Event breakdown by category">
                  <div className="h-72 flex items-center">
                    <ResponsiveContainer width="50%" height="100%">
                      <PieChart>
                        <Pie
                          data={secData.securityEventsByType}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {secData.securityEventsByType.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="w-1/2 space-y-2">
                      {secData.securityEventsByType.map((entry) => (
                        <div key={entry.name} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: entry.color }}
                            />
                            <span className="text-surface-600 dark:text-surface-300">{entry.name}</span>
                          </div>
                          <span className="font-semibold text-surface-900 dark:text-surface-100">{entry.value.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
