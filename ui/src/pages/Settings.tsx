import { useState, useCallback } from 'react';
import {
  Settings as SettingsIcon, Key, Globe, Bell, Shield,
  Save, Eye, EyeOff, RefreshCw, CheckCircle, Cpu, Palette
} from 'lucide-react';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import StatusBadge from '../components/shared/StatusBadge';
import { CardSkeleton } from '../components/shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../components/shared/ErrorBoundary';
import EmptyState from '../components/shared/EmptyState';
import { useApiQuery, useApiMutation } from '../hooks/useApi';

interface GeneralSettings {
  companyName: string;
  timezone: string;
  currency: string;
  language: string;
  autonomyMode: 'manual' | 'semi' | 'full';
  notificationEmail: string;
}

interface NotificationSettings {
  channels: {
    channel: string;
    desc: string;
    enabled: boolean;
  }[];
  thresholds: {
    roasAlert: number;
    spendAnomaly: number;
    cpcSpike: number;
    fraudScore: number;
  };
}

interface SecuritySetting {
  label: string;
  desc: string;
  status: string;
  ok: boolean;
}

interface AppearanceSettings {
  theme: 'light' | 'dark' | 'system';
  accentColor: string;
  sidebarPosition: 'left' | 'right';
  density: 'compact' | 'comfortable' | 'spacious';
}

interface AgentConfig {
  opus: {
    maxTokens: number;
    temperature: number;
    confidenceThreshold: number;
    rateLimit: number;
  };
  sonnet: {
    maxTokens: number;
    temperature: number;
    confidenceThreshold: number;
    rateLimit: number;
  };
  crossChallenge: {
    minChallengesPerAgent: number;
    challengeFrequency: string;
    contradictionResolution: string;
  };
}

interface SystemSettings {
  general: GeneralSettings;
  notifications: NotificationSettings;
  security: SecuritySetting[];
  appearance: AppearanceSettings;
  aiAgents: AgentConfig;
}

interface ApiKeyConfig {
  name: string;
  service: string;
  key: string;
  status: 'active' | 'expired' | 'warning';
  lastRotated: string;
}

interface ApiKeysResponse {
  keys: ApiKeyConfig[];
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [localSettings, setLocalSettings] = useState<SystemSettings | null>(null);

  // API queries
  const {
    data: settings,
    loading: settingsLoading,
    error: settingsError,
    refetch: refetchSettings,
  } = useApiQuery<SystemSettings>('/v1/settings');

  const {
    data: apiKeysData,
    loading: apiKeysLoading,
    error: apiKeysError,
    refetch: refetchApiKeys,
  } = useApiQuery<ApiKeysResponse>('/v1/settings/api-keys');

  // Mutations
  const { mutate: saveSettings, loading: saving } = useApiMutation<SystemSettings>('/v1/settings', { method: 'PUT' });
  const { mutate: saveApiKeys, loading: savingKeys } = useApiMutation<ApiKeysResponse>('/v1/settings/api-keys', { method: 'PUT' });

  // Derive effective settings: use local edits if available, otherwise the API data
  const effectiveSettings = localSettings ?? settings ?? null;

  const apiKeys = apiKeysData?.keys || [];

  const handleSave = useCallback(async () => {
    const toSave = localSettings ?? settings;
    if (!toSave) return;
    const result = await saveSettings(toSave);
    if (result) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      refetchSettings();
    }
  }, [localSettings, settings, saveSettings, refetchSettings]);

  const toggleKeyVisibility = (name: string) => {
    setShowKeys(s => ({ ...s, [name]: !s[name] }));
  };

  const updateGeneral = (partial: Partial<GeneralSettings>) => {
    setLocalSettings(s => {
      const base = s ?? settings;
      return base ? { ...base, general: { ...base.general, ...partial } } : null;
    });
  };

  const updateAppearance = (partial: Partial<AppearanceSettings>) => {
    setLocalSettings(s => {
      const base = s ?? settings;
      return base ? { ...base, appearance: { ...base.appearance, ...partial } } : null;
    });
  };

  const updateAgentConfig = (section: 'opus' | 'sonnet', partial: Partial<AgentConfig['opus']>) => {
    setLocalSettings(s => {
      const base = s ?? settings;
      return base ? {
        ...base,
        aiAgents: { ...base.aiAgents, [section]: { ...base.aiAgents[section], ...partial } },
      } : null;
    });
  };

  const updateCrossChallenge = (partial: Partial<AgentConfig['crossChallenge']>) => {
    setLocalSettings(s => {
      const base = s ?? settings;
      return base ? {
        ...base,
        aiAgents: { ...base.aiAgents, crossChallenge: { ...base.aiAgents.crossChallenge, ...partial } },
      } : null;
    });
  };

  const updateNotificationChannel = (index: number, enabled: boolean) => {
    setLocalSettings(s => {
      const base = s ?? settings;
      if (!base) return null;
      const channels = [...base.notifications.channels];
      channels[index] = { ...channels[index], enabled };
      return { ...base, notifications: { ...base.notifications, channels } };
    });
  };

  const updateNotificationThreshold = (key: keyof NotificationSettings['thresholds'], value: number) => {
    setLocalSettings(s => {
      const base = s ?? settings;
      return base ? {
        ...base,
        notifications: { ...base.notifications, thresholds: { ...base.notifications.thresholds, [key]: value } },
      } : null;
    });
  };

  const handleRotateKey = useCallback(async (keyName: string) => {
    await saveApiKeys({ action: 'rotate', keyName });
    refetchApiKeys();
  }, [saveApiKeys, refetchApiKeys]);

  const tabs = [
    { id: 'general', label: 'General', icon: SettingsIcon },
    { id: 'api-keys', label: 'API Keys', icon: Key },
    { id: 'ai-agents', label: 'AI Agents', icon: Cpu },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'appearance', label: 'Appearance', icon: Palette },
  ];

  const general = effectiveSettings?.general;
  const appearance = effectiveSettings?.appearance;
  const aiAgents = effectiveSettings?.aiAgents;
  const notifications = effectiveSettings?.notifications;
  const security = effectiveSettings?.security || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="System Configuration & API Management"
        icon={<SettingsIcon className="w-5 h-5" />}
        actions={
          <button
            onClick={handleSave}
            disabled={saving || !effectiveSettings}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
              saved ? 'bg-success-600 text-white' : 'bg-primary-600 text-white hover:bg-primary-700'
            }`}
          >
            {saved ? <><CheckCircle className="w-4 h-4" /> Saved</> :
             saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving...</> :
             <><Save className="w-4 h-4" /> Save Changes</>}
          </button>
        }
      />

      <div className="flex gap-6 flex-col lg:flex-row">
        <div className="lg:w-56 flex-shrink-0">
          <nav className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300 border-r-2 border-primary-600'
                    : 'text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 space-y-6">
          {/* General Tab */}
          {activeTab === 'general' && (
            settingsLoading ? (
              <CardSkeleton lines={5} />
            ) : settingsError ? (
              <ApiErrorDisplay error={settingsError} onRetry={refetchSettings} />
            ) : !general ? (
              <Card title="General Settings" subtitle="Core platform configuration">
                <EmptyState title="Settings unavailable" description="Could not load general settings." />
              </Card>
            ) : (
              <Card title="General Settings" subtitle="Core platform configuration">
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-surface-700 dark:text-surface-200 mb-1.5">Company Name</label>
                      <input
                        type="text"
                        value={general.companyName}
                        onChange={e => updateGeneral({ companyName: e.target.value })}
                        className="w-full px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg text-sm dark:bg-surface-800 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-surface-700 dark:text-surface-200 mb-1.5">Notification Email</label>
                      <input
                        type="email"
                        value={general.notificationEmail}
                        onChange={e => updateGeneral({ notificationEmail: e.target.value })}
                        className="w-full px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg text-sm dark:bg-surface-800 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-surface-700 dark:text-surface-200 mb-1.5">Timezone</label>
                      <select
                        value={general.timezone}
                        onChange={e => updateGeneral({ timezone: e.target.value })}
                        className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white dark:bg-surface-800"
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
                      <label className="block text-sm font-medium text-surface-700 dark:text-surface-200 mb-1.5">Default Currency</label>
                      <select
                        value={general.currency}
                        onChange={e => updateGeneral({ currency: e.target.value })}
                        className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white dark:bg-surface-800"
                      >
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (&#8364;)</option>
                        <option value="GBP">GBP (&#163;)</option>
                        <option value="JPY">JPY (&#165;)</option>
                        <option value="AED">AED</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-200 mb-1.5">Default Autonomy Mode</label>
                    <div className="flex gap-3">
                      {(['manual', 'semi', 'full'] as const).map(mode => (
                        <button
                          key={mode}
                          onClick={() => updateGeneral({ autonomyMode: mode })}
                          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium border transition-colors ${
                            general.autonomyMode === mode
                              ? 'bg-primary-50 border-primary-300 text-primary-700'
                              : 'bg-white dark:bg-surface-800 border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700'
                          }`}
                        >
                          {mode === 'manual' ? 'Manual' : mode === 'semi' ? 'Semi-Autonomous' : 'Full Autonomous'}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-surface-500 dark:text-surface-400 mt-2">
                      {general.autonomyMode === 'manual' ? 'All actions require human approval before execution.' :
                       general.autonomyMode === 'semi' ? 'Low-risk actions auto-execute. High-impact decisions need approval.' :
                       'Agents operate autonomously with kill switch guardrails. Use with caution.'}
                    </p>
                  </div>
                </div>
              </Card>
            )
          )}

          {/* API Keys Tab */}
          {activeTab === 'api-keys' && (
            apiKeysLoading ? (
              <CardSkeleton lines={8} />
            ) : apiKeysError ? (
              <ApiErrorDisplay error={apiKeysError} onRetry={refetchApiKeys} />
            ) : apiKeys.length === 0 ? (
              <Card title="API Key Management" subtitle="Configure and rotate API keys for all integrations">
                <EmptyState
                  icon={<Key className="w-6 h-6 text-surface-400" />}
                  title="No API keys configured"
                  description="Add API keys for your integrations to get started."
                />
              </Card>
            ) : (
              <Card title="API Key Management" subtitle="Configure and rotate API keys for all integrations">
                <div className="space-y-3">
                  {apiKeys.map(apiKey => (
                    <div key={apiKey.name} className={`p-4 rounded-lg border ${
                      apiKey.status === 'warning' ? 'border-warning-200 bg-warning-50/30' : 'border-surface-200 dark:border-surface-700'
                    }`}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-surface-100 dark:bg-surface-700 rounded-lg flex items-center justify-center">
                            <Key className="w-5 h-5 text-surface-600 dark:text-surface-300" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">{apiKey.name}</p>
                              <StatusBadge status={apiKey.status} />
                            </div>
                            <p className="text-xs text-surface-500 dark:text-surface-400">{apiKey.service}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleKeyVisibility(apiKey.name)}
                            className="p-2 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg"
                          >
                            {showKeys[apiKey.name] ? <EyeOff className="w-4 h-4 text-surface-500 dark:text-surface-400" /> : <Eye className="w-4 h-4 text-surface-500 dark:text-surface-400" />}
                          </button>
                          <button
                            onClick={() => handleRotateKey(apiKey.name)}
                            disabled={savingKeys}
                            className="p-2 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg disabled:opacity-50"
                          >
                            <RefreshCw className={`w-4 h-4 text-surface-500 dark:text-surface-400 ${savingKeys ? 'animate-spin' : ''}`} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <code className="flex-1 px-3 py-1.5 bg-surface-100 dark:bg-surface-700 rounded text-xs font-mono text-surface-600 dark:text-surface-300">
                          {showKeys[apiKey.name] ? apiKey.key.replace(/\*/g, 'x') : apiKey.key}
                        </code>
                        <span className="text-xs text-surface-500 dark:text-surface-400">Rotated: {apiKey.lastRotated}</span>
                      </div>
                      {apiKey.status === 'warning' && (
                        <p className="mt-2 text-xs text-warning-600 flex items-center gap-1">
                          <Globe className="w-3 h-3" /> Key rotation overdue - rotate within 48 hours
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 bg-primary-50 dark:bg-primary-500/10 rounded-lg border border-primary-200 dark:border-primary-500/30">
                  <p className="text-xs text-primary-700">
                    <strong>Security Note:</strong> API keys are encrypted at rest (AES-256) and stored in the secure vault.
                    Keys are never exposed in logs or transmitted in plain text. Rotation is recommended every 30 days.
                  </p>
                </div>
              </Card>
            )
          )}

          {/* AI Agents Tab */}
          {activeTab === 'ai-agents' && (
            settingsLoading ? (
              <CardSkeleton lines={8} />
            ) : settingsError ? (
              <ApiErrorDisplay error={settingsError} onRetry={refetchSettings} />
            ) : !aiAgents ? (
              <Card title="AI Agent Configuration" subtitle="Configure Opus & Sonnet agent behavior">
                <EmptyState title="Agent config unavailable" description="Could not load AI agent configuration." />
              </Card>
            ) : (
              <Card title="AI Agent Configuration" subtitle="Configure Opus & Sonnet agent behavior">
                <div className="space-y-5">
                  <div className="p-4 rounded-lg border border-surface-200 dark:border-surface-700">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                        <Cpu className="w-5 h-5 text-primary-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">Claude Opus (Primary Agent)</p>
                        <p className="text-xs text-surface-500 dark:text-surface-400">Main decision-making and orchestration</p>
                      </div>
                      <StatusBadge status="active" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">Max Tokens</label>
                        <input
                          type="number"
                          value={aiAgents.opus.maxTokens}
                          onChange={e => updateAgentConfig('opus', { maxTokens: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg text-sm dark:bg-surface-800 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">Temperature</label>
                        <input
                          type="number"
                          value={aiAgents.opus.temperature}
                          step={0.1}
                          min={0}
                          max={1}
                          onChange={e => updateAgentConfig('opus', { temperature: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg text-sm dark:bg-surface-800 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">Confidence Threshold</label>
                        <input
                          type="number"
                          value={aiAgents.opus.confidenceThreshold}
                          min={0}
                          max={100}
                          onChange={e => updateAgentConfig('opus', { confidenceThreshold: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg text-sm dark:bg-surface-800 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">Rate Limit (req/min)</label>
                        <input
                          type="number"
                          value={aiAgents.opus.rateLimit}
                          onChange={e => updateAgentConfig('opus', { rateLimit: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg text-sm dark:bg-surface-800 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border border-surface-200 dark:border-surface-700">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-surface-100 dark:bg-surface-700 rounded-lg flex items-center justify-center">
                        <Cpu className="w-5 h-5 text-surface-600 dark:text-surface-300" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">Claude Sonnet (Sub-Agent)</p>
                        <p className="text-xs text-surface-500 dark:text-surface-400">Auxiliary operations and content generation</p>
                      </div>
                      <StatusBadge status="active" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">Max Tokens</label>
                        <input
                          type="number"
                          value={aiAgents.sonnet.maxTokens}
                          onChange={e => updateAgentConfig('sonnet', { maxTokens: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg text-sm dark:bg-surface-800 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">Temperature</label>
                        <input
                          type="number"
                          value={aiAgents.sonnet.temperature}
                          step={0.1}
                          min={0}
                          max={1}
                          onChange={e => updateAgentConfig('sonnet', { temperature: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg text-sm dark:bg-surface-800 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">Confidence Threshold</label>
                        <input
                          type="number"
                          value={aiAgents.sonnet.confidenceThreshold}
                          min={0}
                          max={100}
                          onChange={e => updateAgentConfig('sonnet', { confidenceThreshold: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg text-sm dark:bg-surface-800 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">Rate Limit (req/min)</label>
                        <input
                          type="number"
                          value={aiAgents.sonnet.rateLimit}
                          onChange={e => updateAgentConfig('sonnet', { rateLimit: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg text-sm dark:bg-surface-800 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-surface-50 dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700">
                    <h4 className="text-sm font-semibold text-surface-800 dark:text-surface-200 mb-3">Cross-Challenge Configuration</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">Min Challenges Per Agent</label>
                        <input
                          type="number"
                          value={aiAgents.crossChallenge.minChallengesPerAgent}
                          min={1}
                          max={10}
                          onChange={e => updateCrossChallenge({ minChallengesPerAgent: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm bg-white dark:bg-surface-800 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">Challenge Frequency</label>
                        <select
                          value={aiAgents.crossChallenge.challengeFrequency}
                          onChange={e => updateCrossChallenge({ challengeFrequency: e.target.value })}
                          className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm bg-white dark:bg-surface-800 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        >
                          <option>Every cycle</option>
                          <option>Every 2 cycles</option>
                          <option>Hourly</option>
                          <option>Daily</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">Contradiction Resolution</label>
                        <select
                          value={aiAgents.crossChallenge.contradictionResolution}
                          onChange={e => updateCrossChallenge({ contradictionResolution: e.target.value })}
                          className="w-full px-3 py-2 border border-surface-300 rounded-lg text-sm bg-white dark:bg-surface-800 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        >
                          <option>Auto (highest confidence)</option>
                          <option>Manual review</option>
                          <option>Orchestrator decides</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            settingsLoading ? (
              <CardSkeleton lines={6} />
            ) : settingsError ? (
              <ApiErrorDisplay error={settingsError} onRetry={refetchSettings} />
            ) : !notifications ? (
              <Card title="Notification Settings" subtitle="Configure alert channels and thresholds">
                <EmptyState title="Notifications unavailable" description="Could not load notification settings." />
              </Card>
            ) : (
              <Card title="Notification Settings" subtitle="Configure alert channels and thresholds">
                <div className="space-y-4">
                  {notifications.channels.map((item, index) => (
                    <div key={item.channel} className="flex items-center justify-between p-4 rounded-lg border border-surface-200 dark:border-surface-700">
                      <div className="flex items-center gap-3">
                        <Bell className="w-5 h-5 text-surface-500 dark:text-surface-400" />
                        <div>
                          <p className="text-sm font-medium text-surface-900 dark:text-surface-100">{item.channel}</p>
                          <p className="text-xs text-surface-500 dark:text-surface-400">{item.desc}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => updateNotificationChannel(index, !item.enabled)}
                        className={`relative w-10 h-5 rounded-full transition-colors ${item.enabled ? 'bg-success-500' : 'bg-surface-300'}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 bg-white dark:bg-surface-800 rounded-full shadow transition-transform ${item.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  ))}
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold text-surface-800 dark:text-surface-200 mb-3">Alert Thresholds</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">ROAS Alert Below</label>
                        <input
                          type="number"
                          value={notifications.thresholds.roasAlert}
                          step={0.1}
                          onChange={e => updateNotificationThreshold('roasAlert', Number(e.target.value))}
                          className="w-full px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg text-sm dark:bg-surface-800 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">Spend Anomaly %</label>
                        <input
                          type="number"
                          value={notifications.thresholds.spendAnomaly}
                          onChange={e => updateNotificationThreshold('spendAnomaly', Number(e.target.value))}
                          className="w-full px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg text-sm dark:bg-surface-800 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">CPC Spike %</label>
                        <input
                          type="number"
                          value={notifications.thresholds.cpcSpike}
                          onChange={e => updateNotificationThreshold('cpcSpike', Number(e.target.value))}
                          className="w-full px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg text-sm dark:bg-surface-800 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-surface-600 dark:text-surface-300 mb-1">Fraud Score Threshold</label>
                        <input
                          type="number"
                          value={notifications.thresholds.fraudScore}
                          onChange={e => updateNotificationThreshold('fraudScore', Number(e.target.value))}
                          className="w-full px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg text-sm dark:bg-surface-800 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            settingsLoading ? (
              <CardSkeleton lines={7} />
            ) : settingsError ? (
              <ApiErrorDisplay error={settingsError} onRetry={refetchSettings} />
            ) : security.length === 0 ? (
              <Card title="Security Settings" subtitle="Encryption, access control, and audit configuration">
                <EmptyState
                  icon={<Shield className="w-6 h-6 text-surface-400" />}
                  title="No security data"
                  description="Security settings are not yet available."
                />
              </Card>
            ) : (
              <Card title="Security Settings" subtitle="Encryption, access control, and audit configuration">
                <div className="space-y-4">
                  {security.map(item => (
                    <div key={item.label} className="flex items-center justify-between p-4 rounded-lg border border-surface-200 dark:border-surface-700">
                      <div className="flex items-center gap-3">
                        <Shield className="w-5 h-5 text-surface-500 dark:text-surface-400" />
                        <div>
                          <p className="text-sm font-medium text-surface-900 dark:text-surface-100">{item.label}</p>
                          <p className="text-xs text-surface-500 dark:text-surface-400">{item.desc}</p>
                        </div>
                      </div>
                      <span className="flex items-center gap-1 text-xs font-medium text-success-700 bg-success-50 px-2 py-1 rounded-full">
                        <CheckCircle className="w-3 h-3" /> {item.status}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            settingsLoading ? (
              <CardSkeleton lines={5} />
            ) : settingsError ? (
              <ApiErrorDisplay error={settingsError} onRetry={refetchSettings} />
            ) : !appearance ? (
              <Card title="Appearance" subtitle="Customize the dashboard look and feel">
                <EmptyState title="Appearance unavailable" description="Could not load appearance settings." />
              </Card>
            ) : (
              <Card title="Appearance" subtitle="Customize the dashboard look and feel">
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-200 mb-3">Theme</label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: 'light' as const, label: 'Light', preview: 'bg-white dark:bg-surface-800 border-2 border-primary-500' },
                        { id: 'dark' as const, label: 'Dark', preview: 'bg-surface-900 border-2 border-surface-700' },
                        { id: 'system' as const, label: 'System', preview: 'bg-gradient-to-r from-white to-surface-900 border-2 border-surface-300' },
                      ].map(theme => (
                        <button
                          key={theme.id}
                          onClick={() => updateAppearance({ theme: theme.id })}
                          className="text-center"
                        >
                          <div className={`h-20 rounded-lg mb-2 ${theme.preview} ${
                            appearance.theme === theme.id ? 'ring-2 ring-primary-500 ring-offset-2' : ''
                          }`} />
                          <span className="text-sm font-medium text-surface-700 dark:text-surface-200">{theme.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-200 mb-3">Accent Color</label>
                    <div className="flex gap-3">
                      {['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'].map(color => (
                        <button
                          key={color}
                          onClick={() => updateAppearance({ accentColor: color })}
                          className={`w-8 h-8 rounded-full border-2 shadow-md hover:scale-110 transition-transform ${
                            appearance.accentColor === color ? 'border-surface-900 scale-110' : 'border-white'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-200 mb-1.5">Sidebar Position</label>
                    <div className="flex gap-3">
                      {(['left', 'right'] as const).map(pos => (
                        <button
                          key={pos}
                          onClick={() => updateAppearance({ sidebarPosition: pos })}
                          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium ${
                            appearance.sidebarPosition === pos
                              ? 'bg-primary-50 dark:bg-primary-500/10 border border-primary-300 dark:border-primary-500/30 text-primary-700 dark:text-primary-300'
                              : 'bg-white dark:bg-surface-800 border border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700'
                          }`}
                        >
                          {pos.charAt(0).toUpperCase() + pos.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-200 mb-1.5">Density</label>
                    <div className="flex gap-3">
                      {(['compact', 'comfortable', 'spacious'] as const).map(d => (
                        <button
                          key={d}
                          onClick={() => updateAppearance({ density: d })}
                          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium ${
                            appearance.density === d
                              ? 'bg-primary-50 dark:bg-primary-500/10 border border-primary-300 dark:border-primary-500/30 text-primary-700 dark:text-primary-300'
                              : 'bg-white dark:bg-surface-800 border border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700'
                          }`}
                        >
                          {d.charAt(0).toUpperCase() + d.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            )
          )}
        </div>
      </div>
    </div>
  );
}
