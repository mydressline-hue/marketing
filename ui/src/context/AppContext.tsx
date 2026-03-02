import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { KillSwitchState, AlertItem } from '../types';
import { useApiQuery } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import api from '../services/api';

interface AppState {
  sidebarOpen: boolean;
  darkMode: boolean;
  killSwitch: KillSwitchState;
  alerts: AlertItem[];
  selectedCountry: string | null;
  autonomyMode: 'full' | 'semi' | 'manual';
}

interface AppContextType extends AppState {
  toggleSidebar: () => void;
  toggleDarkMode: () => void;
  setKillSwitch: (state: Partial<KillSwitchState>) => void;
  addAlert: (alert: AlertItem) => void;
  dismissAlert: (id: string) => void;
  setSelectedCountry: (code: string | null) => void;
  setAutonomyMode: (mode: 'full' | 'semi' | 'manual') => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    sidebarOpen: true,
    darkMode: localStorage.getItem('darkMode') === 'true',
    killSwitch: {
      global: false,
      campaigns: false,
      automation: false,
      apiKeys: false,
      countrySpecific: {},
    },
    alerts: [],
    selectedCountry: null,
    autonomyMode: 'semi',
  });

  // --- API-backed state sync ---

  // Fetch kill switch state on mount
  const { data: killSwitchData } = useApiQuery<KillSwitchState>(
    '/v1/killswitch/status',
  );

  // Sync kill switch data when it arrives
  useEffect(() => {
    if (killSwitchData) {
      setState((s) => ({ ...s, killSwitch: { ...s.killSwitch, ...killSwitchData } }));
    }
  }, [killSwitchData]);

  // Fetch alerts on mount
  const { data: alertsData } = useApiQuery<AlertItem[]>(
    '/v1/alerts',
  );

  // Sync alerts data when it arrives
  useEffect(() => {
    if (alertsData) {
      setState((s) => ({ ...s, alerts: alertsData }));
    }
  }, [alertsData]);

  // WebSocket subscription for real-time updates
  const { subscribe } = useWebSocket({ autoConnect: true });

  useEffect(() => {
    const unsubKillSwitch = subscribe('killswitch:update', (msg) => {
      const update = msg.data as Partial<KillSwitchState>;
      setState((s) => ({ ...s, killSwitch: { ...s.killSwitch, ...update } }));
    });

    const unsubAlert = subscribe('alert:new', (msg) => {
      const alert = msg.data as AlertItem;
      setState((s) => ({
        ...s,
        alerts: [alert, ...s.alerts].slice(0, 100),
      }));
    });

    const unsubAlertDismiss = subscribe('alert:dismiss', (msg) => {
      const { id } = msg.data as { id: string };
      setState((s) => ({
        ...s,
        alerts: s.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)),
      }));
    });

    return () => {
      unsubKillSwitch();
      unsubAlert();
      unsubAlertDismiss();
    };
  }, [subscribe]);

  // --- Actions (local + API sync) ---

  const toggleSidebar = useCallback(() => {
    setState(s => ({ ...s, sidebarOpen: !s.sidebarOpen }));
  }, []);

  const toggleDarkMode = useCallback(() => {
    setState(s => {
      const newDarkMode = !s.darkMode;
      localStorage.setItem('darkMode', String(newDarkMode));
      return { ...s, darkMode: newDarkMode };
    });
  }, []);

  const setKillSwitch = useCallback((partial: Partial<KillSwitchState>) => {
    // Optimistic local update
    setState(s => ({ ...s, killSwitch: { ...s.killSwitch, ...partial } }));

    // Sync to backend
    api.post('/v1/killswitch/activate', partial).catch((err) => {
      console.error('[AppContext] Failed to sync kill switch state:', err);
    });
  }, []);

  const addAlert = useCallback((alert: AlertItem) => {
    // Optimistic local update
    setState(s => ({ ...s, alerts: [alert, ...s.alerts].slice(0, 100) }));

    // Sync to backend
    api.post('/v1/alerts', alert).catch((err) => {
      console.error('[AppContext] Failed to sync alert:', err);
    });
  }, []);

  const dismissAlert = useCallback((id: string) => {
    // Optimistic local update
    setState(s => ({
      ...s,
      alerts: s.alerts.map(a => a.id === id ? { ...a, acknowledged: true } : a),
    }));

    // Sync to backend (backend uses PATCH for dismiss)
    api.put(`/v1/alerts/${id}/dismiss`, {}).catch((err) => {
      console.error('[AppContext] Failed to dismiss alert:', err);
    });
  }, []);

  const setSelectedCountry = useCallback((code: string | null) => {
    setState(s => ({ ...s, selectedCountry: code }));
  }, []);

  const setAutonomyMode = useCallback((mode: 'full' | 'semi' | 'manual') => {
    setState(s => ({ ...s, autonomyMode: mode }));
  }, []);

  return (
    <AppContext.Provider
      value={{
        ...state,
        toggleSidebar,
        toggleDarkMode,
        setKillSwitch,
        addAlert,
        dismissAlert,
        setSelectedCountry,
        setAutonomyMode,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
