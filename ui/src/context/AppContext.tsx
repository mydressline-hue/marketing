import { useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import type { KillSwitchState, AlertItem } from '../types';
import { useApiQuery } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import api from '../services/api';
import { AppContext } from './appContextDef';

interface LocalState {
  sidebarOpen: boolean;
  darkMode: boolean;
  selectedCountry: string | null;
  autonomyMode: 'full' | 'semi' | 'manual';
}

/** Overrides accumulated from WebSocket events and optimistic user actions. */
interface KillSwitchOverrides {
  patches: Partial<KillSwitchState>[];
}

interface AlertOverrides {
  added: AlertItem[];
  dismissed: Set<string>;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [local, setLocal] = useState<LocalState>({
    sidebarOpen: true,
    darkMode: localStorage.getItem('darkMode') === 'true',
    selectedCountry: null,
    autonomyMode: 'semi',
  });

  // --- API-backed data ---

  const { data: killSwitchData } = useApiQuery<KillSwitchState>(
    '/v1/killswitch/status',
  );

  const { data: alertsData } = useApiQuery<AlertItem[]>(
    '/v1/alerts',
  );

  // --- Overlay state for WebSocket / optimistic updates ---

  const [ksOverrides, setKsOverrides] = useState<KillSwitchOverrides>({ patches: [] });
  const [alertOverrides, setAlertOverrides] = useState<AlertOverrides>({
    added: [],
    dismissed: new Set(),
  });

  // Derive final killSwitch by merging API data with accumulated patches
  const killSwitch = useMemo<KillSwitchState>(() => {
    const base: KillSwitchState = {
      global: false,
      campaigns: false,
      automation: false,
      apiKeys: false,
      countrySpecific: {},
      ...(killSwitchData ?? {}),
    };
    return ksOverrides.patches.reduce<KillSwitchState>(
      (acc, patch) => ({ ...acc, ...patch }),
      base,
    );
  }, [killSwitchData, ksOverrides]);

  // Derive final alerts by merging API data with added/dismissed overlays
  const alerts = useMemo<AlertItem[]>(() => {
    const base = alertsData ?? [];
    const merged = [...alertOverrides.added, ...base].slice(0, 100);
    if (alertOverrides.dismissed.size === 0) return merged;
    return merged.map((a) =>
      alertOverrides.dismissed.has(a.id) ? { ...a, acknowledged: true } : a,
    );
  }, [alertsData, alertOverrides]);

  // --- WebSocket subscription for real-time updates ---

  const { subscribe } = useWebSocket({ autoConnect: true });

  useEffect(() => {
    const unsubKillSwitch = subscribe('killswitch:update', (msg) => {
      const update = msg.data as Partial<KillSwitchState>;
      setKsOverrides((prev) => ({ patches: [...prev.patches, update] }));
    });

    const unsubAlert = subscribe('alert:new', (msg) => {
      const alert = msg.data as AlertItem;
      setAlertOverrides((prev) => ({
        ...prev,
        added: [alert, ...prev.added],
      }));
    });

    const unsubAlertDismiss = subscribe('alert:dismiss', (msg) => {
      const { id } = msg.data as { id: string };
      setAlertOverrides((prev) => ({
        ...prev,
        dismissed: new Set(prev.dismissed).add(id),
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
    setLocal(s => ({ ...s, sidebarOpen: !s.sidebarOpen }));
  }, []);

  const toggleDarkMode = useCallback(() => {
    setLocal(s => {
      const newDarkMode = !s.darkMode;
      localStorage.setItem('darkMode', String(newDarkMode));
      return { ...s, darkMode: newDarkMode };
    });
  }, []);

  const setKillSwitch = useCallback((partial: Partial<KillSwitchState>) => {
    // Optimistic local update
    setKsOverrides((prev) => ({ patches: [...prev.patches, partial] }));

    // Sync to backend
    api.post('/v1/killswitch/activate', partial).catch((err) => {
      console.error('[AppContext] Failed to sync kill switch state:', err);
    });
  }, []);

  const addAlert = useCallback((alert: AlertItem) => {
    // Optimistic local update
    setAlertOverrides((prev) => ({
      ...prev,
      added: [alert, ...prev.added],
    }));

    // Sync to backend
    api.post('/v1/alerts', alert).catch((err) => {
      console.error('[AppContext] Failed to sync alert:', err);
    });
  }, []);

  const dismissAlert = useCallback((id: string) => {
    // Optimistic local update
    setAlertOverrides((prev) => ({
      ...prev,
      dismissed: new Set(prev.dismissed).add(id),
    }));

    // Sync to backend (backend uses PATCH for dismiss)
    api.patch(`/v1/alerts/${id}/dismiss`, {}).catch((err) => {
      console.error('[AppContext] Failed to dismiss alert:', err);
    });
  }, []);

  const setSelectedCountry = useCallback((code: string | null) => {
    setLocal(s => ({ ...s, selectedCountry: code }));
  }, []);

  const setAutonomyMode = useCallback((mode: 'full' | 'semi' | 'manual') => {
    setLocal(s => ({ ...s, autonomyMode: mode }));
  }, []);

  return (
    <AppContext.Provider
      value={{
        ...local,
        killSwitch,
        alerts,
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
