import { useState, useEffect, useCallback } from 'react';
import {
  Power, AlertTriangle, Shield, ShieldOff, Globe, Megaphone,
  Cpu, Key, Activity, Clock, CheckCircle, XCircle, Wifi, WifiOff
} from 'lucide-react';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import StatusBadge from '../components/shared/StatusBadge';
import { KPISkeleton, CardSkeleton } from '../components/shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../components/shared/ErrorBoundary';
import EmptyState from '../components/shared/EmptyState';
import { useApiQuery, useApiMutation } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { useApp } from '../context/AppContext';

interface KillSwitchStatus {
  global: boolean;
  campaigns: boolean;
  automation: boolean;
  apiKeys: boolean;
  newCampaigns: boolean;
  scaling: boolean;
  countries: CountryState[];
}

interface CountryState {
  code: string;
  name: string;
  flag: string;
  active: boolean;
}

interface TriggerConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  lastTriggered: string;
  severity: string;
}

interface HistoryEvent {
  time: string;
  action: string;
  detail: string;
  type: string;
  status: string;
}

interface ActivateResult {
  success: boolean;
  message: string;
}

export default function KillSwitch() {
  const [confirmGlobal, setConfirmGlobal] = useState(false);
  const { setKillSwitch } = useApp();

  // API queries
  const {
    data: killSwitchStatus,
    loading: statusLoading,
    error: statusError,
    refetch: refetchStatus,
  } = useApiQuery<KillSwitchStatus>('/v1/killswitch/status');

  const {
    data: triggers,
    loading: triggersLoading,
    error: triggersError,
    refetch: refetchTriggers,
  } = useApiQuery<TriggerConfig[]>('/v1/killswitch/triggers');

  const {
    data: history,
    loading: historyLoading,
    error: historyError,
    refetch: refetchHistory,
  } = useApiQuery<HistoryEvent[]>('/v1/killswitch/history');

  // Mutations
  const { mutate: activateKillSwitch, loading: activating } = useApiMutation<ActivateResult>('/v1/killswitch/activate', 'POST');
  const { mutate: deactivateKillSwitch, loading: deactivating } = useApiMutation<ActivateResult>('/v1/killswitch/deactivate', 'POST');

  // WebSocket for instant state propagation
  const { connected, subscribe } = useWebSocket();

  useEffect(() => {
    const unsubStatus = subscribe('killswitch_update', () => {
      refetchStatus();
      refetchHistory();
    });
    const unsubTrigger = subscribe('killswitch_trigger', () => {
      refetchStatus();
      refetchTriggers();
      refetchHistory();
    });
    return () => {
      unsubStatus();
      unsubTrigger();
    };
  }, [subscribe, refetchStatus, refetchTriggers, refetchHistory]);

  // Sync kill switch state with AppContext
  useEffect(() => {
    if (killSwitchStatus) {
      const countrySpecific: Record<string, boolean> = {};
      killSwitchStatus.countries.forEach(c => {
        countrySpecific[c.code] = c.active;
      });
      setKillSwitch({
        global: killSwitchStatus.global,
        campaigns: killSwitchStatus.campaigns,
        automation: killSwitchStatus.automation,
        apiKeys: killSwitchStatus.apiKeys,
        countrySpecific,
      });
    }
  }, [killSwitchStatus, setKillSwitch]);

  // Derived state
  const switches = killSwitchStatus || {
    global: false,
    campaigns: false,
    automation: false,
    apiKeys: false,
    newCampaigns: false,
    scaling: false,
    countries: [],
  };

  const handleToggleSwitch = useCallback(async (key: string) => {
    if (key === 'global' && !switches.global) {
      setConfirmGlobal(true);
      return;
    }

    const currentlyActive = switches[key as keyof typeof switches];
    if (currentlyActive) {
      await deactivateKillSwitch({ level: key, scope: 'system' });
    } else {
      await activateKillSwitch({ level: key, scope: 'system' });
    }
    refetchStatus();
    refetchHistory();
  }, [switches, activateKillSwitch, deactivateKillSwitch, refetchStatus, refetchHistory]);

  const handleConfirmGlobalKill = useCallback(async () => {
    await activateKillSwitch({ level: 'global', scope: 'system' });
    setConfirmGlobal(false);
    refetchStatus();
    refetchHistory();
  }, [activateKillSwitch, refetchStatus, refetchHistory]);

  const handleToggleCountry = useCallback(async (code: string, currentlyActive: boolean) => {
    if (currentlyActive) {
      await activateKillSwitch({ level: 'country', scope: code });
    } else {
      await deactivateKillSwitch({ level: 'country', scope: code });
    }
    refetchStatus();
    refetchHistory();
  }, [activateKillSwitch, deactivateKillSwitch, refetchStatus, refetchHistory]);

  const handleToggleTrigger = useCallback(async (trigger: TriggerConfig) => {
    // Use a dynamic endpoint for updating trigger
    const endpoint = `/v1/killswitch/triggers/${trigger.id}`;
    try {
      await fetch(`/api${endpoint}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...trigger, enabled: !trigger.enabled }),
      });
      refetchTriggers();
    } catch {
      // Error handled by refetch
      refetchTriggers();
    }
  }, [refetchTriggers]);

  const mutationInProgress = activating || deactivating;

  const switchControls = [
    { key: 'global' as const, label: 'Global Kill Switch', desc: 'Stop everything immediately', icon: Power, critical: true },
    { key: 'campaigns' as const, label: 'Pause All Campaigns', desc: 'Stop all ad campaigns across platforms', icon: Megaphone, critical: true },
    { key: 'automation' as const, label: 'Pause Automation', desc: 'Stop autonomous agent actions', icon: Cpu, critical: false },
    { key: 'apiKeys' as const, label: 'Lock API Keys', desc: 'Disable all external API connections', icon: Key, critical: true },
    { key: 'newCampaigns' as const, label: 'Block New Campaigns', desc: 'Prevent launching new campaigns', icon: Shield, critical: false },
    { key: 'scaling' as const, label: 'Pause Scaling', desc: 'Stop budget scaling operations', icon: Activity, critical: false },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kill Switch Architecture"
        subtitle="Multi-Level Emergency Controls & Automated Triggers"
        icon={<Power className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1 px-2 py-1 text-xs rounded-full ${
              connected ? 'bg-success-50 text-success-700' : 'bg-surface-100 text-surface-500'
            }`}>
              {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {connected ? 'Live' : 'Offline'}
            </span>
            {switches.global ? (
              <span className="flex items-center gap-2 px-4 py-2 bg-danger-600 text-white rounded-lg text-sm font-bold animate-pulse">
                <ShieldOff className="w-4 h-4" /> SYSTEM HALTED
              </span>
            ) : (
              <span className="flex items-center gap-2 px-4 py-2 bg-success-600 text-white rounded-lg text-sm font-medium">
                <Shield className="w-4 h-4" /> System Active
              </span>
            )}
          </div>
        }
      />

      {confirmGlobal && (
        <div className="bg-danger-50 border-2 border-danger-300 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-danger-100 rounded-full flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-danger-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-danger-800 mb-1">Confirm Global Kill Switch</h3>
              <p className="text-sm text-danger-700 mb-4">
                This will immediately stop ALL campaigns, pause ALL automation, and lock ALL API keys across every market.
                This action affects all 20 agents and cannot be undone without manual re-activation.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleConfirmGlobalKill}
                  disabled={activating}
                  className="px-6 py-2.5 bg-danger-600 text-white rounded-lg text-sm font-bold hover:bg-danger-700 transition-colors disabled:opacity-50"
                >
                  {activating ? 'ACTIVATING...' : 'ACTIVATE GLOBAL KILL SWITCH'}
                </button>
                <button
                  onClick={() => setConfirmGlobal(false)}
                  className="px-6 py-2.5 bg-white border border-surface-300 text-surface-700 rounded-lg text-sm font-medium hover:bg-surface-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Manual Kill Switches */}
        {statusLoading ? (
          <CardSkeleton lines={6} />
        ) : statusError ? (
          <ApiErrorDisplay error={statusError} onRetry={refetchStatus} />
        ) : (
          <Card title="Manual Kill Switches" subtitle="Immediate system-level controls">
            <div className="space-y-3">
              {switchControls.map(item => {
                const isActive = switches[item.key as keyof KillSwitchStatus] as boolean;
                return (
                  <div key={item.key} className={`flex items-center justify-between p-4 rounded-lg border ${
                    isActive ? 'border-danger-200 bg-danger-50' : 'border-surface-200 bg-white'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        isActive ? 'bg-danger-100' : 'bg-surface-100'
                      }`}>
                        <item.icon className={`w-5 h-5 ${isActive ? 'text-danger-600' : 'text-surface-600'}`} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-surface-900 flex items-center gap-2">
                          {item.label}
                          {item.critical && <span className="text-[10px] text-danger-600 bg-danger-50 px-1.5 py-0.5 rounded font-medium border border-danger-200">CRITICAL</span>}
                        </p>
                        <p className="text-xs text-surface-500">{item.desc}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleSwitch(item.key)}
                      disabled={mutationInProgress}
                      className={`relative w-12 h-6 rounded-full transition-colors disabled:opacity-50 ${
                        isActive ? 'bg-danger-500' : 'bg-surface-300'
                      }`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        isActive ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Country-Specific Controls */}
        {statusLoading ? (
          <CardSkeleton lines={6} />
        ) : statusError ? (
          <ApiErrorDisplay error={statusError} onRetry={refetchStatus} />
        ) : (
          <Card title="Country-Specific Controls" subtitle="Pause operations per market">
            {switches.countries.length === 0 ? (
              <EmptyState
                icon={<Globe className="w-6 h-6 text-surface-400" />}
                title="No countries configured"
                description="Country-specific controls are not yet available."
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {switches.countries.map(country => (
                  <div key={country.code} className={`flex items-center justify-between p-3 rounded-lg border ${
                    !country.active ? 'border-warning-200 bg-warning-50/50' : 'border-surface-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{country.flag}</span>
                      <div>
                        <p className="text-sm font-medium text-surface-900">{country.code}</p>
                        <p className="text-[10px] text-surface-500">{country.name}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleCountry(country.code, country.active)}
                      disabled={mutationInProgress}
                      className={`relative w-10 h-5 rounded-full transition-colors disabled:opacity-50 ${
                        country.active ? 'bg-success-500' : 'bg-surface-300'
                      }`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        country.active ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Automated Triggers */}
      {triggersLoading ? (
        <CardSkeleton lines={7} />
      ) : triggersError ? (
        <ApiErrorDisplay error={triggersError} onRetry={refetchTriggers} />
      ) : (
        <Card title="Automated Triggers" subtitle="Rules that auto-activate kill switches">
          {!triggers || triggers.length === 0 ? (
            <EmptyState
              icon={<Activity className="w-6 h-6 text-surface-400" />}
              title="No triggers configured"
              description="Set up automated triggers to activate kill switches based on conditions."
            />
          ) : (
            <div className="space-y-2">
              {triggers.map((trigger) => (
                <div key={trigger.id} className={`flex items-center justify-between p-4 rounded-lg border ${
                  trigger.enabled ? 'border-surface-200' : 'border-surface-100 bg-surface-50 opacity-60'
                }`}>
                  <div className="flex items-center gap-3 flex-1">
                    <div className={`w-2.5 h-2.5 rounded-full ${
                      trigger.severity === 'critical' ? 'bg-danger-500' : 'bg-warning-500'
                    }`} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-surface-900">{trigger.name}</p>
                      <p className="text-xs text-surface-500">{trigger.description}</p>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 text-xs text-surface-500">
                      <Clock className="w-3 h-3" />
                      Last: {trigger.lastTriggered}
                    </div>
                    <StatusBadge status={trigger.severity} />
                  </div>
                  <button
                    onClick={() => handleToggleTrigger(trigger)}
                    className={`ml-4 relative w-10 h-5 rounded-full transition-colors ${
                      trigger.enabled ? 'bg-success-500' : 'bg-surface-300'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      trigger.enabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Kill Switch Activity Log */}
      {historyLoading ? (
        <CardSkeleton lines={4} />
      ) : historyError ? (
        <ApiErrorDisplay error={historyError} onRetry={refetchHistory} />
      ) : (
        <Card title="Kill Switch Activity Log" subtitle="Recent trigger events and manual actions">
          {!history || history.length === 0 ? (
            <EmptyState
              icon={<Clock className="w-6 h-6 text-surface-400" />}
              title="No activity yet"
              description="Kill switch events will appear here as they occur."
            />
          ) : (
            <div className="space-y-3">
              {history.map((action, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-surface-100 hover:bg-surface-50">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    action.status === 'resolved' ? 'bg-success-50' : 'bg-warning-50'
                  }`}>
                    {action.status === 'resolved' ?
                      <CheckCircle className="w-4 h-4 text-success-600" /> :
                      <XCircle className="w-4 h-4 text-warning-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-surface-900">{action.action}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        action.type === 'auto' ? 'bg-primary-50 text-primary-700' : 'bg-surface-100 text-surface-600'
                      }`}>
                        {action.type === 'auto' ? 'Automated' : 'Manual'}
                      </span>
                      <StatusBadge status={action.status} />
                    </div>
                    <p className="text-xs text-surface-600">{action.detail}</p>
                  </div>
                  <span className="text-xs text-surface-400 flex-shrink-0">{action.time}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Multi-Layer Halt Levels (static reference) */}
      <Card title="Multi-Layer Halt Levels" subtitle="Escalating response levels">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { level: 'Level 1', label: 'Pause Scaling', desc: 'Stop budget increases and new campaign launches', color: 'bg-warning-50 border-warning-200 text-warning-800', icon: '🟡' },
            { level: 'Level 2', label: 'Pause New Campaigns', desc: 'Block all new campaign creation across platforms', color: 'bg-warning-50 border-warning-300 text-warning-800', icon: '🟠' },
            { level: 'Level 3', label: 'Pause Country', desc: 'Halt all operations in specific markets', color: 'bg-danger-50 border-danger-200 text-danger-800', icon: '🔴' },
            { level: 'Level 4', label: 'Full Shutdown', desc: 'Complete system halt - all agents, campaigns, and APIs', color: 'bg-danger-50 border-danger-300 text-danger-800', icon: '⛔' },
          ].map((l, i) => (
            <div key={i} className={`p-4 rounded-lg border ${l.color}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{l.icon}</span>
                <span className="text-xs font-bold uppercase">{l.level}</span>
              </div>
              <p className="text-sm font-semibold mb-1">{l.label}</p>
              <p className="text-xs opacity-80">{l.desc}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
