import { createContext } from 'react';
import type { KillSwitchState, AlertItem } from '../types';

export interface AppContextType {
  sidebarOpen: boolean;
  darkMode: boolean;
  killSwitch: KillSwitchState;
  alerts: AlertItem[];
  selectedCountry: string | null;
  autonomyMode: 'full' | 'semi' | 'manual';
  toggleSidebar: () => void;
  toggleDarkMode: () => void;
  setKillSwitch: (state: Partial<KillSwitchState>) => void;
  addAlert: (alert: AlertItem) => void;
  dismissAlert: (id: string) => void;
  setSelectedCountry: (code: string | null) => void;
  setAutonomyMode: (mode: 'full' | 'semi' | 'manual') => void;
}

export const AppContext = createContext<AppContextType | null>(null);
