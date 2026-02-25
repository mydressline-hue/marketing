import { useState } from 'react';
import {
  Settings as SettingsIcon, Key, Globe, Bell, Shield, Database,
  Save, Eye, EyeOff, RefreshCw, CheckCircle, Cpu, Palette
} from 'lucide-react';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import StatusBadge from '../components/shared/StatusBadge';

interface ApiKeyConfig {
  name: string;
  service: string;
  key: string;
  status: 'active' | 'expired' | 'warning';
  lastRotated: string;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);

  const [generalSettings, setGeneralSettings] = useState({
    companyName: 'MyDressLine',
    timezone: 'UTC',
    currency: 'USD',
    language: 'en',
    autonomyMode: 'semi',
    notificationEmail: 'admin@mydressline.com',
  });

  const apiKeys: ApiKeyConfig[] = [
    { name: 'Anthropic (Opus)', service: 'AI Agent - Primary', key: 'sk-ant-opus-****************************', status: 'active', lastRotated: '2 days ago' },
    { name: 'Anthropic (Sonnet)', service: 'AI Agent - Sub-agent', key: 'sk-ant-sonnet-****************************', status: 'active', lastRotated: '2 days ago' },
    { name: 'Google Ads', service: 'Paid Advertising', key: 'AIza************************************', status: 'active', lastRotated: '5 days ago' },
    { name: 'Meta Marketing', service: 'Facebook & Instagram Ads', key: 'EAAx************************************', status: 'active', lastRotated: '3 days ago' },
    { name: 'TikTok Ads', service: 'TikTok Advertising', key: 'tt-ads-*********************************', status: 'active', lastRotated: '1 week ago' },
    { name: 'Bing Ads', service: 'Microsoft Advertising', key: 'bing-************************************', status: 'active', lastRotated: '1 week ago' },
    { name: 'Snapchat Ads', service: 'Snapchat Marketing', key: 'snap-************************************', status: 'warning', lastRotated: '30 days ago' },
    { name: 'Shopify', service: 'E-commerce Platform', key: 'shpat_***********************************', status: 'active', lastRotated: '4 days ago' },
  ];

  const tabs = [
    { id: 'general', label: 'General', icon: SettingsIcon },
    { id: 'api-keys', label: 'API Keys', icon: Key },
    { id: 'ai-agents', label: 'AI Agents', icon: Cpu },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'appearance', label: 'Appearance', icon: Palette },
  ];

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleKeyVisibility = (name: string) => {
    setShowKeys(s => ({ ...s, [name]: !s[name] }));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="System Configuration & API Management"
        icon={<SettingsIcon className="w-5 h-5" />}
        actions={
          <button
            onClick={handleSave}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              saved ? 'bg-success-600 text-white' : 'bg-primary-600 text-white hover:bg-primary-700'
            }`}
          >
            {saved ? <><CheckCircle className="w-4 h-4" /> Saved</> : <><Save className="w-4 h-4" /> Save Changes</>}
          </button>
        }
      />

      <div className="flex gap-6 flex-col lg:flex-row">
        <div className="lg:w-56 flex-shrink-0">
          <nav className="bg-white rounded-xl border border-surface-200 overflow-hidden">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary-50 text-primary-700 border-r-2 border-primary-600'
                    : 'text-surface-600 hover:bg-surface-50'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 space-y-6">
          {activeTab === 'general' && (
            <Card title="General Settings" subtitle="Core platform configuration">
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-1.5">Company Name</label>
                    <input
                      type="text"
                      value={generalSettings.companyName}
                      onChange={e => setGeneralSettings(s => ({ ...s, companyName: e.target.value }))}
                      className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-1.5">Notification Email</label>
                    <input
                      type="email"
                      value={generalSettings.notificationEmail}
                      onChange={e => setGeneralSettings(s => ({ ...s, notificationEmail: e.target.value }))}
                      className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-1.5">Timezone</label>
                    <select
                      value={generalSettings.timezone}
                      onChange={e => setGeneralSettings(s => ({ ...s, timezone: e.target.value }))}
                      className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
                    >
                      <option value="UTC">UTC</option>
                      <option value="EST">Eastern (EST)</option>
                      <option value="PST">Pacific (PST)</option>
                      <option value="CET">Central European (CET)</option>
                      <option value="JST">Japan (JST)</option>
                      <option value="GST">Gulf (GST)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 mb-1.5">Default Currency</label>
                    <select
                      value={generalSettings.currency}
                      onChange={e => setGeneralSettings(s => ({ ...s, currency: e.target.value }))}
                      className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
                    >
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="JPY">JPY (¥)</option>
                      <option value="AED">AED (د.إ)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1.5">Default Autonomy Mode</label>
                  <div className="flex gap-3">
                    {(['manual', 'semi', 'full'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setGeneralSettings(s => ({ ...s, autonomyMode: mode }))}
                        className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium border transition-colors ${
                          generalSettings.autonomyMode === mode
                            ? 'bg-primary-50 border-primary-300 text-primary-700'
                            : 'bg-white border-surface-300 text-surface-600 hover:bg-surface-50'
                        }`}
                      >
                        {mode === 'manual' ? 'Manual' : mode === 'semi' ? 'Semi-Autonomous' : 'Full Autonomous'}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-surface-500 mt-2">
                    {generalSettings.autonomyMode === 'manual' ? 'All actions require human approval before execution.' :
                     generalSettings.autonomyMode === 'semi' ? 'Low-risk actions auto-execute. High-impact decisions need approval.' :
                     'Agents operate autonomously with kill switch guardrails. Use with caution.'}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'api-keys' && (
            <Card title="API Key Management" subtitle="Configure and rotate API keys for all integrations">
              <div className="space-y-3">
                {apiKeys.map(apiKey => (
                  <div key={apiKey.name} className={`p-4 rounded-lg border ${
                    apiKey.status === 'warning' ? 'border-warning-200 bg-warning-50/30' : 'border-surface-200'
                  }`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-surface-100 rounded-lg flex items-center justify-center">
                          <Key className="w-5 h-5 text-surface-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-surface-900">{apiKey.name}</p>
                            <StatusBadge status={apiKey.status} />
                          </div>
                          <p className="text-xs text-surface-500">{apiKey.service}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleKeyVisibility(apiKey.name)}
                          className="p-2 hover:bg-surface-100 rounded-lg"
                        >
                          {showKeys[apiKey.name] ? <EyeOff className="w-4 h-4 text-surface-500" /> : <Eye className="w-4 h-4 text-surface-500" />}
                        </button>
                        <button className="p-2 hover:bg-surface-100 rounded-lg">
                          <RefreshCw className="w-4 h-4 text-surface-500" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <code className="flex-1 px-3 py-1.5 bg-surface-100 rounded text-xs font-mono text-surface-600">
                        {showKeys[apiKey.name] ? apiKey.key.replace(/\*/g, 'x') : apiKey.key}
                      </code>
                      <span className="text-xs text-surface-500">Rotated: {apiKey.lastRotated}</span>
                    </div>
                    {apiKey.status === 'warning' && (
                      <p className="mt-2 text-xs text-warning-600 flex items-center gap-1">
                        <Globe className="w-3 h-3" /> Key rotation overdue - rotate within 48 hours
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-primary-50 rounded-lg border border-primary-200">
                <p className="text-xs text-primary-700">
                  <strong>Security Note:</strong> API keys are encrypted at rest (AES-256) and stored in the secure vault.
                  Keys are never exposed in logs or transmitted in plain text. Rotation is recommended every 30 days.
                </p>
              </div>
            </Card>
          )}

          {activeTab === 'ai-agents' && (
            <Card title="AI Agent Configuration" subtitle="Configure Opus & Sonnet agent behavior">
              <div className="space-y-5">
                <div className="p-4 rounded-lg border border-surface-200">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                      <Cpu className="w-5 h-5 text-primary-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-surface-900">Claude Opus (Primary Agent)</p>
                      <p className="text-xs text-surface-500">Main decision-making and orchestration</p>
                    </div>
                    <StatusBadge status="active" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Max Tokens</label>
                      <input type="number" defaultValue={4096} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Temperature</label>
                      <input type="number" defaultValue={0.7} step={0.1} min={0} max={1} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Confidence Threshold</label>
                      <input type="number" defaultValue={70} min={0} max={100} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Rate Limit (req/min)</label>
                      <input type="number" defaultValue={60} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg border border-surface-200">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-surface-100 rounded-lg flex items-center justify-center">
                      <Cpu className="w-5 h-5 text-surface-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-surface-900">Claude Sonnet (Sub-Agent)</p>
                      <p className="text-xs text-surface-500">Auxiliary operations and content generation</p>
                    </div>
                    <StatusBadge status="active" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Max Tokens</label>
                      <input type="number" defaultValue={2048} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Temperature</label>
                      <input type="number" defaultValue={0.5} step={0.1} min={0} max={1} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Confidence Threshold</label>
                      <input type="number" defaultValue={60} min={0} max={100} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Rate Limit (req/min)</label>
                      <input type="number" defaultValue={120} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-surface-50 rounded-lg border border-surface-200">
                  <h4 className="text-sm font-semibold text-surface-800 mb-3">Cross-Challenge Configuration</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Min Challenges Per Agent</label>
                      <input type="number" defaultValue={3} min={1} max={10} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Challenge Frequency</label>
                      <select className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20">
                        <option>Every cycle</option>
                        <option>Every 2 cycles</option>
                        <option>Hourly</option>
                        <option>Daily</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Contradiction Resolution</label>
                      <select className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20">
                        <option>Auto (highest confidence)</option>
                        <option>Manual review</option>
                        <option>Orchestrator decides</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'notifications' && (
            <Card title="Notification Settings" subtitle="Configure alert channels and thresholds">
              <div className="space-y-4">
                {[
                  { channel: 'Email', desc: 'Critical alerts and daily summaries', enabled: true },
                  { channel: 'Slack', desc: 'Real-time alerts and agent updates', enabled: true },
                  { channel: 'Microsoft Teams', desc: 'Team notifications', enabled: false },
                  { channel: 'SMS', desc: 'Critical-only emergency alerts', enabled: false },
                ].map(item => (
                  <div key={item.channel} className="flex items-center justify-between p-4 rounded-lg border border-surface-200">
                    <div className="flex items-center gap-3">
                      <Bell className="w-5 h-5 text-surface-500" />
                      <div>
                        <p className="text-sm font-medium text-surface-900">{item.channel}</p>
                        <p className="text-xs text-surface-500">{item.desc}</p>
                      </div>
                    </div>
                    <div className={`relative w-10 h-5 rounded-full transition-colors ${item.enabled ? 'bg-success-500' : 'bg-surface-300'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${item.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                  </div>
                ))}
                <div className="mt-4">
                  <h4 className="text-sm font-semibold text-surface-800 mb-3">Alert Thresholds</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">ROAS Alert Below</label>
                      <input type="number" defaultValue={1.5} step={0.1} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Spend Anomaly %</label>
                      <input type="number" defaultValue={200} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">CPC Spike %</label>
                      <input type="number" defaultValue={150} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1">Fraud Score Threshold</label>
                      <input type="number" defaultValue={90} className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'security' && (
            <Card title="Security Settings" subtitle="Encryption, access control, and audit configuration">
              <div className="space-y-4">
                {[
                  { label: 'Encryption at Rest', desc: 'AES-256 encryption for stored data', status: 'Enabled', ok: true },
                  { label: 'Encryption in Transit', desc: 'TLS 1.3 for all API communications', status: 'Enabled', ok: true },
                  { label: 'API Key Auto-Rotation', desc: 'Automatic rotation every 30 days', status: 'Enabled', ok: true },
                  { label: 'MFA for Admin Access', desc: 'Multi-factor authentication requirement', status: 'Enabled', ok: true },
                  { label: 'IP Whitelisting', desc: 'Restrict API access to approved IPs', status: 'Configured', ok: true },
                  { label: 'SOC2 Logging', desc: 'Immutable audit trail for compliance', status: 'Active', ok: true },
                  { label: 'DDoS Protection', desc: 'Rate limiting and traffic filtering', status: 'Active', ok: true },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between p-4 rounded-lg border border-surface-200">
                    <div className="flex items-center gap-3">
                      <Shield className="w-5 h-5 text-surface-500" />
                      <div>
                        <p className="text-sm font-medium text-surface-900">{item.label}</p>
                        <p className="text-xs text-surface-500">{item.desc}</p>
                      </div>
                    </div>
                    <span className="flex items-center gap-1 text-xs font-medium text-success-700 bg-success-50 px-2 py-1 rounded-full">
                      <CheckCircle className="w-3 h-3" /> {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {activeTab === 'appearance' && (
            <Card title="Appearance" subtitle="Customize the dashboard look and feel">
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-3">Theme</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'light', label: 'Light', preview: 'bg-white border-2 border-primary-500' },
                      { id: 'dark', label: 'Dark', preview: 'bg-surface-900 border-2 border-surface-700' },
                      { id: 'system', label: 'System', preview: 'bg-gradient-to-r from-white to-surface-900 border-2 border-surface-300' },
                    ].map(theme => (
                      <button key={theme.id} className="text-center">
                        <div className={`h-20 rounded-lg mb-2 ${theme.preview}`} />
                        <span className="text-sm font-medium text-surface-700">{theme.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-3">Accent Color</label>
                  <div className="flex gap-3">
                    {['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'].map(color => (
                      <button
                        key={color}
                        className="w-8 h-8 rounded-full border-2 border-white shadow-md hover:scale-110 transition-transform"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1.5">Sidebar Position</label>
                  <div className="flex gap-3">
                    <button className="flex-1 py-2 px-4 rounded-lg text-sm font-medium bg-primary-50 border border-primary-300 text-primary-700">Left</button>
                    <button className="flex-1 py-2 px-4 rounded-lg text-sm font-medium bg-white border border-surface-300 text-surface-600 hover:bg-surface-50">Right</button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1.5">Density</label>
                  <div className="flex gap-3">
                    <button className="flex-1 py-2 px-4 rounded-lg text-sm font-medium bg-white border border-surface-300 text-surface-600 hover:bg-surface-50">Compact</button>
                    <button className="flex-1 py-2 px-4 rounded-lg text-sm font-medium bg-primary-50 border border-primary-300 text-primary-700">Comfortable</button>
                    <button className="flex-1 py-2 px-4 rounded-lg text-sm font-medium bg-white border border-surface-300 text-surface-600 hover:bg-surface-50">Spacious</button>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
