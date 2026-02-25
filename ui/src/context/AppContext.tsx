import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { KillSwitchState, AlertItem } from '../types';

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
    darkMode: false,
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

  const toggleSidebar = useCallback(() => {
    setState(s => ({ ...s, sidebarOpen: !s.sidebarOpen }));
  }, []);

  const toggleDarkMode = useCallback(() => {
    setState(s => ({ ...s, darkMode: !s.darkMode }));
  }, []);

  const setKillSwitch = useCallback((partial: Partial<KillSwitchState>) => {
    setState(s => ({ ...s, killSwitch: { ...s.killSwitch, ...partial } }));
  }, []);

  const addAlert = useCallback((alert: AlertItem) => {
    setState(s => ({ ...s, alerts: [alert, ...s.alerts].slice(0, 100) }));
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setState(s => ({
      ...s,
      alerts: s.alerts.map(a => a.id === id ? { ...a, acknowledged: true } : a),
    }));
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
