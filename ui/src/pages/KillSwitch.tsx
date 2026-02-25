import { useState } from 'react';
import {
  Power, AlertTriangle, Shield, ShieldOff, Globe, Megaphone,
  Cpu, Key, Activity, Clock, CheckCircle, XCircle
} from 'lucide-react';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import StatusBadge from '../components/shared/StatusBadge';

interface SwitchState {
  global: boolean;
  campaigns: boolean;
  automation: boolean;
  apiKeys: boolean;
  newCampaigns: boolean;
  scaling: boolean;
}

const countries = [
  { code: 'US', name: 'United States', flag: '🇺🇸', active: true },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', active: true },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', active: true },
  { code: 'JP', name: 'Japan', flag: '🇯🇵', active: true },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', active: true },
  { code: 'AE', name: 'UAE', flag: '🇦🇪', active: false },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', active: true },
  { code: 'FR', name: 'France', flag: '🇫🇷', active: true },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷', active: true },
  { code: 'IN', name: 'India', flag: '🇮🇳', active: false },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷', active: true },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', active: true },
];

const autoTriggers = [
  { name: 'ROAS Drop Below 1.5x', description: 'Pauses campaigns when ROAS drops below threshold for 24h', enabled: true, lastTriggered: 'Never', severity: 'critical' },
  { name: 'Spend Anomaly > 200%', description: 'Halts budget allocation when daily spend exceeds 2x normal', enabled: true, lastTriggered: '3 days ago', severity: 'critical' },
  { name: 'Conversion Tracking Failure', description: 'Pauses campaigns if pixel stops firing for > 1 hour', enabled: true, lastTriggered: 'Never', severity: 'critical' },
  { name: 'CPC Spike > 150%', description: 'Reduces bids when CPC exceeds 1.5x average', enabled: true, lastTriggered: '1 week ago', severity: 'warning' },
  { name: 'API Error Storm > 50/min', description: 'Locks API keys when error rate exceeds threshold', enabled: true, lastTriggered: 'Never', severity: 'warning' },
  { name: 'Fraud Alert Score > 90', description: 'Pauses affected campaigns on high fraud confidence', enabled: true, lastTriggered: '2 days ago', severity: 'critical' },
  { name: 'Budget Utilization > 95%', description: 'Slows spend pacing when near budget limits', enabled: false, lastTriggered: '5 days ago', severity: 'warning' },
];

const recentActions = [
  { time: '2 days ago', action: 'Spend anomaly trigger activated', detail: 'Meta US daily spend hit 215% of baseline. Campaigns paused for 4 hours.', type: 'auto', status: 'resolved' },
  { time: '2 days ago', action: 'Fraud alert trigger activated', detail: 'Click fraud detected on Google DE campaign. Budget locked.', type: 'auto', status: 'resolved' },
  { time: '1 week ago', action: 'CPC spike trigger activated', detail: 'TikTok UK CPC rose 162%. Bids reduced by 30%.', type: 'auto', status: 'resolved' },
  { time: '2 weeks ago', action: 'Manual country pause', detail: 'UAE paused pending compliance review.', type: 'manual', status: 'active' },
];

export default function KillSwitch() {
  const [switches, setSwitches] = useState<SwitchState>({
    global: false,
    campaigns: false,
    automation: false,
    apiKeys: false,
    newCampaigns: false,
    scaling: false,
  });

  const [countryStates, setCountryStates] = useState<Record<string, boolean>>(
    Object.fromEntries(countries.map(c => [c.code, c.active]))
  );

  const [triggers, setTriggers] = useState(autoTriggers);
  const [confirmGlobal, setConfirmGlobal] = useState(false);

  const toggleSwitch = (key: keyof SwitchState) => {
    if (key === 'global' && !switches.global) {
      setConfirmGlobal(true);
      return;
    }
    setSwitches(s => ({ ...s, [key]: !s[key] }));
  };

  const confirmGlobalKill = () => {
    setSwitches({
      global: true,
      campaigns: true,
      automation: true,
      apiKeys: true,
      newCampaigns: true,
      scaling: true,
    });
    setConfirmGlobal(false);
  };

  const toggleCountry = (code: string) => {
    setCountryStates(s => ({ ...s, [code]: !s[code] }));
  };

  const toggleTrigger = (index: number) => {
    setTriggers(t => t.map((tr, i) => i === index ? { ...tr, enabled: !tr.enabled } : tr));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kill Switch Architecture"
        subtitle="Multi-Level Emergency Controls & Automated Triggers"
        icon={<Power className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
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
                  onClick={confirmGlobalKill}
                  className="px-6 py-2.5 bg-danger-600 text-white rounded-lg text-sm font-bold hover:bg-danger-700 transition-colors"
                >
                  ACTIVATE GLOBAL KILL SWITCH
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
        <Card title="Manual Kill Switches" subtitle="Immediate system-level controls">
          <div className="space-y-3">
            {([
              { key: 'global' as const, label: 'Global Kill Switch', desc: 'Stop everything immediately', icon: Power, critical: true },
              { key: 'campaigns' as const, label: 'Pause All Campaigns', desc: 'Stop all ad campaigns across platforms', icon: Megaphone, critical: true },
              { key: 'automation' as const, label: 'Pause Automation', desc: 'Stop autonomous agent actions', icon: Cpu, critical: false },
              { key: 'apiKeys' as const, label: 'Lock API Keys', desc: 'Disable all external API connections', icon: Key, critical: true },
              { key: 'newCampaigns' as const, label: 'Block New Campaigns', desc: 'Prevent launching new campaigns', icon: Shield, critical: false },
              { key: 'scaling' as const, label: 'Pause Scaling', desc: 'Stop budget scaling operations', icon: Activity, critical: false },
            ]).map(item => (
              <div key={item.key} className={`flex items-center justify-between p-4 rounded-lg border ${
                switches[item.key] ? 'border-danger-200 bg-danger-50' : 'border-surface-200 bg-white'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    switches[item.key] ? 'bg-danger-100' : 'bg-surface-100'
                  }`}>
                    <item.icon className={`w-5 h-5 ${switches[item.key] ? 'text-danger-600' : 'text-surface-600'}`} />
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
                  onClick={() => toggleSwitch(item.key)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    switches[item.key] ? 'bg-danger-500' : 'bg-surface-300'
                  }`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    switches[item.key] ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Country-Specific Controls" subtitle="Pause operations per market">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {countries.map(country => (
              <div key={country.code} className={`flex items-center justify-between p-3 rounded-lg border ${
                !countryStates[country.code] ? 'border-warning-200 bg-warning-50/50' : 'border-surface-200'
              }`}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{country.flag}</span>
                  <div>
                    <p className="text-sm font-medium text-surface-900">{country.code}</p>
                    <p className="text-[10px] text-surface-500">{country.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => toggleCountry(country.code)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    countryStates[country.code] ? 'bg-success-500' : 'bg-surface-300'
                  }`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    countryStates[country.code] ? 'translate-x-5' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Automated Triggers" subtitle="Rules that auto-activate kill switches">
        <div className="space-y-2">
          {triggers.map((trigger, i) => (
            <div key={i} className={`flex items-center justify-between p-4 rounded-lg border ${
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
                onClick={() => toggleTrigger(i)}
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
      </Card>

      <Card title="Kill Switch Activity Log" subtitle="Recent trigger events and manual actions">
        <div className="space-y-3">
          {recentActions.map((action, i) => (
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
      </Card>

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
