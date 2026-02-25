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

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const apiKeys = [
  {
    id: 'key-1',
    name: 'Google Ads',
    service: 'Advertising',
    created: '2025-11-12',
    lastUsed: '2 min ago',
    status: 'active' as const,
    rotation: 'Every 30 days',
    expiresIn: '18 days',
  },
  {
    id: 'key-2',
    name: 'Meta API',
    service: 'Social Advertising',
    created: '2025-10-28',
    lastUsed: '5 min ago',
    status: 'active' as const,
    rotation: 'Every 30 days',
    expiresIn: '12 days',
  },
  {
    id: 'key-3',
    name: 'TikTok API',
    service: 'Social Advertising',
    created: '2025-12-01',
    lastUsed: '1 hr ago',
    status: 'active' as const,
    rotation: 'Every 60 days',
    expiresIn: '37 days',
  },
  {
    id: 'key-4',
    name: 'Shopify API',
    service: 'E-Commerce',
    created: '2025-09-15',
    lastUsed: '12 min ago',
    status: 'active' as const,
    rotation: 'Every 90 days',
    expiresIn: '44 days',
  },
  {
    id: 'key-5',
    name: 'Anthropic (Opus)',
    service: 'AI / LLM',
    created: '2026-01-08',
    lastUsed: '30 sec ago',
    status: 'active' as const,
    rotation: 'Every 14 days',
    expiresIn: '6 days',
  },
  {
    id: 'key-6',
    name: 'Anthropic (Sonnet)',
    service: 'AI / LLM',
    created: '2026-01-08',
    lastUsed: '1 min ago',
    status: 'active' as const,
    rotation: 'Every 14 days',
    expiresIn: '6 days',
  },
];

const roles = [
  {
    role: 'Admin',
    icon: Shield,
    users: 3,
    permissions: {
      'API Keys': 'full',
      Campaigns: 'full',
      Billing: 'full',
      Analytics: 'full',
      'User Mgmt': 'full',
      'Kill Switch': 'full',
    },
  },
  {
    role: 'Analyst',
    icon: Eye,
    users: 5,
    permissions: {
      'API Keys': 'none',
      Campaigns: 'read',
      Billing: 'none',
      Analytics: 'full',
      'User Mgmt': 'none',
      'Kill Switch': 'none',
    },
  },
  {
    role: 'Campaign Manager',
    icon: Users,
    users: 8,
    permissions: {
      'API Keys': 'read',
      Campaigns: 'full',
      Billing: 'read',
      Analytics: 'full',
      'User Mgmt': 'none',
      'Kill Switch': 'none',
    },
  },
  {
    role: 'Viewer',
    icon: Eye,
    users: 12,
    permissions: {
      'API Keys': 'none',
      Campaigns: 'read',
      Billing: 'none',
      Analytics: 'read',
      'User Mgmt': 'none',
      'Kill Switch': 'none',
    },
  },
];

const permissionColumns = ['API Keys', 'Campaigns', 'Billing', 'Analytics', 'User Mgmt', 'Kill Switch'];

const securityEventsByType = [
  { name: 'Auth Success', value: 1842, color: '#22c55e' },
  { name: 'Key Rotation', value: 24, color: '#6366f1' },
  { name: 'Access Denied', value: 18, color: '#f59e0b' },
  { name: 'Threats Blocked', value: 147, color: '#ef4444' },
  { name: 'Config Changes', value: 36, color: '#3b82f6' },
  { name: 'MFA Challenges', value: 92, color: '#8b5cf6' },
];

const auditLog = [
  {
    id: 'evt-1',
    timestamp: '2026-02-25 14:32:08',
    user: 'sarah.chen@company.com',
    action: 'API key rotated - Google Ads',
    ip: '10.0.1.42',
    status: 'completed' as const,
  },
  {
    id: 'evt-2',
    timestamp: '2026-02-25 14:18:45',
    user: 'system@automated',
    action: 'DDoS attempt blocked - 147 requests',
    ip: '185.234.72.11',
    status: 'active' as const,
  },
  {
    id: 'evt-3',
    timestamp: '2026-02-25 13:55:22',
    user: 'james.wilson@company.com',
    action: 'Login with MFA - Admin portal',
    ip: '10.0.1.88',
    status: 'completed' as const,
  },
  {
    id: 'evt-4',
    timestamp: '2026-02-25 13:41:10',
    user: 'system@automated',
    action: 'TLS certificate renewed - *.api.growthengine.ai',
    ip: '10.0.0.1',
    status: 'completed' as const,
  },
  {
    id: 'evt-5',
    timestamp: '2026-02-25 12:28:33',
    user: 'maria.garcia@company.com',
    action: 'Role updated - Campaign Manager permissions',
    ip: '10.0.1.55',
    status: 'completed' as const,
  },
  {
    id: 'evt-6',
    timestamp: '2026-02-25 11:15:07',
    user: 'system@automated',
    action: 'Vault secret rotation - Shopify credentials',
    ip: '10.0.0.1',
    status: 'completed' as const,
  },
  {
    id: 'evt-7',
    timestamp: '2026-02-25 10:44:58',
    user: 'alex.kumar@company.com',
    action: 'Failed login attempt - incorrect MFA code',
    ip: '192.168.1.204',
    status: 'warning' as const,
  },
  {
    id: 'evt-8',
    timestamp: '2026-02-25 09:30:12',
    user: 'system@automated',
    action: 'Security scan completed - 0 vulnerabilities found',
    ip: '10.0.0.1',
    status: 'completed' as const,
  },
];

const soc2Checklist = [
  { id: 'soc-1', category: 'Access Control', status: 'pass' as const, detail: 'RBAC enforced across all services', lastAudit: '2026-02-20' },
  { id: 'soc-2', category: 'Encryption', status: 'pass' as const, detail: 'AES-256 at rest, TLS 1.3 in transit', lastAudit: '2026-02-20' },
  { id: 'soc-3', category: 'Monitoring', status: 'pass' as const, detail: 'Real-time logging with 90-day retention', lastAudit: '2026-02-20' },
  { id: 'soc-4', category: 'Incident Response', status: 'pass' as const, detail: 'Playbooks defined, <15 min SLA', lastAudit: '2026-02-18' },
  { id: 'soc-5', category: 'Change Management', status: 'pass' as const, detail: 'CI/CD with mandatory review gates', lastAudit: '2026-02-19' },
  { id: 'soc-6', category: 'Vendor Management', status: 'warning' as const, detail: 'TikTok API DPA renewal pending', lastAudit: '2026-02-15' },
];

const threatScans = [
  { id: 'scan-1', target: 'API Gateway', result: 'Clean', vulnerabilities: 0, lastScan: '14 min ago', severity: 'low' as const },
  { id: 'scan-2', target: 'Authentication Service', result: 'Clean', vulnerabilities: 0, lastScan: '14 min ago', severity: 'low' as const },
  { id: 'scan-3', target: 'Data Pipeline', result: 'Clean', vulnerabilities: 0, lastScan: '14 min ago', severity: 'low' as const },
  { id: 'scan-4', target: 'CDN / Edge Network', result: '1 advisory', vulnerabilities: 1, lastScan: '14 min ago', severity: 'medium' as const },
  { id: 'scan-5', target: 'Database Cluster', result: 'Clean', vulnerabilities: 0, lastScan: '14 min ago', severity: 'low' as const },
  { id: 'scan-6', target: 'Secret Vault', result: 'Clean', vulnerabilities: 0, lastScan: '14 min ago', severity: 'low' as const },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const permissionBadge = (level: string) => {
  switch (level) {
    case 'full':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
          Full
        </span>
      );
    case 'read':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
          Read
        </span>
      );
    case 'none':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-surface-400 bg-surface-50 border border-surface-200 rounded-full px-2 py-0.5">
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
            <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
              <Lock className="w-4 h-4" />
              All systems secured
            </span>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
              Run Security Scan
            </button>
          </div>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Security Score" value="95%" change={2.1} trend="up" />
        <KPICard label="API Keys Active" value={12} change={0} trend="stable" />
        <KPICard label="Access Violations" value={0} change={100} trend="down" />
        <KPICard label="Threats Blocked" value={147} change={12} trend="up" />
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 bg-surface-100 rounded-lg p-1 w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setSelectedTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                selectedTab === tab.key
                  ? 'bg-white text-surface-900 shadow-sm'
                  : 'text-surface-500 hover:text-surface-700'
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
          {/* Security Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Encryption */}
            <Card title="Encryption" className="relative">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-surface-600">At Rest</span>
                  <span className="flex items-center gap-1 text-sm font-medium text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    AES-256
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-surface-600">In Transit</span>
                  <span className="flex items-center gap-1 text-sm font-medium text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    TLS 1.3
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
                  <span className="text-sm text-surface-600">Provider</span>
                  <span className="text-sm font-medium text-surface-900">HashiCorp Vault</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-surface-600">Status</span>
                  <StatusBadge status="active" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-surface-600">Last rotation</span>
                  <span className="flex items-center gap-1 text-sm text-surface-700">
                    <Clock className="w-3.5 h-3.5 text-surface-400" />
                    2h ago
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
                  <span className="text-sm text-surface-600">Status</span>
                  <StatusBadge status="active" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-surface-600">Attacks blocked</span>
                  <span className="text-sm font-semibold text-red-600">147</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-surface-600">Uptime</span>
                  <span className="text-sm font-medium text-green-600">99.99%</span>
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
                  <span className="text-sm text-surface-600">Admin accounts</span>
                  <span className="flex items-center gap-1 text-sm font-medium text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    Enabled
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-surface-600">All users</span>
                  <span className="flex items-center gap-1 text-sm font-medium text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    Enforced
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-surface-600">Method</span>
                  <span className="text-sm font-medium text-surface-900">TOTP / WebAuthn</span>
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
              <div className="h-72 flex items-center">
                <ResponsiveContainer width="50%" height="100%">
                  <PieChart>
                    <Pie
                      data={securityEventsByType}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {securityEventsByType.map((entry) => (
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
                  {securityEventsByType.map((entry) => (
                    <div key={entry.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-surface-600">{entry.name}</span>
                      </div>
                      <span className="font-semibold text-surface-900">{entry.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Threat Detection Panel */}
            <Card
              title="Threat Detection"
              subtitle="Latest scan results"
              actions={
                <span className="flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
                  <CheckCircle className="w-3 h-3" />
                  Scan complete
                </span>
              }
            >
              <div className="space-y-3">
                {threatScans.map((scan) => (
                  <div
                    key={scan.id}
                    className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                      scan.vulnerabilities > 0
                        ? 'border-yellow-200 bg-yellow-50/50'
                        : 'border-surface-200 bg-surface-50/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {scan.vulnerabilities === 0 ? (
                        <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-surface-900">{scan.target}</p>
                        <p className="text-xs text-surface-500">{scan.lastScan}</p>
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
            </Card>
          </div>

          {/* SOC2 Readiness Checklist */}
          <Card
            title="SOC2 Readiness Checklist"
            subtitle="Type II compliance status"
            actions={
              <span className="text-xs text-surface-500">Last audit: Feb 20, 2026</span>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {soc2Checklist.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-start gap-3 rounded-lg border p-4 ${
                    item.status === 'pass'
                      ? 'border-green-200 bg-green-50/50'
                      : 'border-yellow-200 bg-yellow-50/50'
                  }`}
                >
                  {item.status === 'pass' ? (
                    <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-surface-900">{item.category}</p>
                    <p className="text-xs text-surface-500 mt-0.5">{item.detail}</p>
                    <p className="text-xs text-surface-400 mt-1">Audited: {item.lastAudit}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* === API KEYS TAB === */}
      {selectedTab === 'keys' && (
        <div className="space-y-6">
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
                  <tr className="border-b border-surface-200">
                    <th className="text-left py-3 px-4 font-semibold text-surface-600">Key Name</th>
                    <th className="text-left py-3 px-4 font-semibold text-surface-600">Service</th>
                    <th className="text-left py-3 px-4 font-semibold text-surface-600">Created</th>
                    <th className="text-left py-3 px-4 font-semibold text-surface-600">Last Used</th>
                    <th className="text-left py-3 px-4 font-semibold text-surface-600">Status</th>
                    <th className="text-left py-3 px-4 font-semibold text-surface-600">Rotation Schedule</th>
                    <th className="text-left py-3 px-4 font-semibold text-surface-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.map((key) => (
                    <tr key={key.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Key className="w-4 h-4 text-indigo-400" />
                          <span className="font-medium text-surface-900">{key.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-surface-600">{key.service}</td>
                      <td className="py-3 px-4 text-surface-600">{key.created}</td>
                      <td className="py-3 px-4 text-surface-600">{key.lastUsed}</td>
                      <td className="py-3 px-4">
                        <StatusBadge status={key.status} />
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          <span className="text-surface-700">{key.rotation}</span>
                          <p className="text-xs text-surface-400">Expires in {key.expiresIn}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <button className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 transition-colors">
                            <RefreshCw className="w-3 h-3" />
                            Rotate
                          </button>
                          <button className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-surface-600 bg-surface-50 border border-surface-200 rounded-md hover:bg-surface-100 transition-colors">
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
                    requests: Math.floor(Math.random() * 40000) + 10000,
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
                    formatter={(value: number) => [value.toLocaleString(), 'Requests']}
                  />
                  <Bar dataKey="requests" fill="#6366f1" radius={[4, 4, 0, 0]} name="Requests" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {/* === ACCESS CONTROL TAB === */}
      {selectedTab === 'access' && (
        <div className="space-y-6">
          <Card
            title="Role-Based Access Control"
            subtitle="Permission matrix by role"
            actions={
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors">
                <Users className="w-3.5 h-3.5" />
                Manage Roles
              </button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200">
                    <th className="text-left py-3 px-4 font-semibold text-surface-600">Role</th>
                    <th className="text-left py-3 px-4 font-semibold text-surface-600">Users</th>
                    {permissionColumns.map((col) => (
                      <th key={col} className="text-center py-3 px-4 font-semibold text-surface-600">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => {
                    const Icon = role.icon;
                    return (
                      <tr key={role.role} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                              <Icon className="w-4 h-4 text-indigo-500" />
                            </div>
                            <span className="font-medium text-surface-900">{role.role}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-surface-600">{role.users}</td>
                        {permissionColumns.map((col) => (
                          <td key={col} className="py-3 px-4 text-center">
                            {permissionBadge(role.permissions[col as keyof typeof role.permissions])}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Active Sessions */}
          <Card title="Active Sessions" subtitle="Currently authenticated users">
            <div className="space-y-3">
              {[
                { user: 'sarah.chen@company.com', role: 'Admin', location: 'San Francisco, US', device: 'Chrome / macOS', since: '2h 14m' },
                { user: 'james.wilson@company.com', role: 'Admin', location: 'London, UK', device: 'Firefox / Windows', since: '45m' },
                { user: 'maria.garcia@company.com', role: 'Campaign Manager', location: 'Madrid, ES', device: 'Chrome / macOS', since: '1h 32m' },
                { user: 'alex.kumar@company.com', role: 'Analyst', location: 'Mumbai, IN', device: 'Safari / macOS', since: '22m' },
              ].map((session) => (
                <div
                  key={session.user}
                  className="flex items-center justify-between rounded-lg border border-surface-200 px-4 py-3 hover:bg-surface-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-600">
                      {session.user.split('.')[0][0].toUpperCase()}{session.user.split('.')[1][0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-surface-900">{session.user}</p>
                      <p className="text-xs text-surface-500">{session.role} -- {session.location}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-surface-600">{session.device}</p>
                    <p className="text-xs text-surface-400">Active for {session.since}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* === AUDIT & COMPLIANCE TAB === */}
      {selectedTab === 'audit' && (
        <div className="space-y-6">
          {/* Audit Log */}
          <Card
            title="Audit Log"
            subtitle="Last 8 security events"
            actions={
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-surface-600 bg-surface-50 border border-surface-200 rounded-lg hover:bg-surface-100 transition-colors">
                Export Log
              </button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200">
                    <th className="text-left py-3 px-4 font-semibold text-surface-600">Timestamp</th>
                    <th className="text-left py-3 px-4 font-semibold text-surface-600">User</th>
                    <th className="text-left py-3 px-4 font-semibold text-surface-600">Action</th>
                    <th className="text-left py-3 px-4 font-semibold text-surface-600">IP Address</th>
                    <th className="text-left py-3 px-4 font-semibold text-surface-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((event) => (
                    <tr key={event.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                      <td className="py-3 px-4">
                        <span className="flex items-center gap-1.5 text-surface-600">
                          <Clock className="w-3.5 h-3.5 text-surface-400" />
                          {event.timestamp}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-surface-800">{event.user}</td>
                      <td className="py-3 px-4 text-surface-600">{event.action}</td>
                      <td className="py-3 px-4 font-mono text-xs text-surface-500">{event.ip}</td>
                      <td className="py-3 px-4">
                        <StatusBadge status={event.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* SOC2 Readiness */}
          <Card
            title="SOC2 Readiness Checklist"
            subtitle="Type II compliance status"
            actions={
              <span className="text-xs text-surface-500">Last audit: Feb 20, 2026</span>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {soc2Checklist.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-start gap-3 rounded-lg border p-4 ${
                    item.status === 'pass'
                      ? 'border-green-200 bg-green-50/50'
                      : 'border-yellow-200 bg-yellow-50/50'
                  }`}
                >
                  {item.status === 'pass' ? (
                    <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-surface-900">{item.category}</p>
                    <p className="text-xs text-surface-500 mt-0.5">{item.detail}</p>
                    <p className="text-xs text-surface-400 mt-1">Audited: {item.lastAudit}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Security Events Chart in Audit Tab */}
          <Card title="Security Events Distribution" subtitle="Event breakdown by category">
            <div className="h-72 flex items-center">
              <ResponsiveContainer width="50%" height="100%">
                <PieChart>
                  <Pie
                    data={securityEventsByType}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {securityEventsByType.map((entry) => (
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
                {securityEventsByType.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="text-surface-600">{entry.name}</span>
                    </div>
                    <span className="font-semibold text-surface-900">{entry.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
