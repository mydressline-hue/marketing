import { Bell, Menu, Moon, Search, Shield, Sun } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export default function Header() {
  const { toggleSidebar, autonomyMode, setAutonomyMode, alerts, darkMode, toggleDarkMode } = useApp();
  const unreadAlerts = alerts.filter(a => !a.acknowledged).length;

  return (
    <header className="h-16 bg-white dark:bg-surface-900 border-b border-surface-200 dark:border-surface-700 flex items-center justify-between px-6 sticky top-0 z-20" role="banner">
      <div className="flex items-center gap-4">
        <button onClick={toggleSidebar} className="lg:hidden p-2 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg" aria-label="Toggle sidebar">
          <Menu className="w-5 h-5 text-surface-600 dark:text-surface-400" />
        </button>
        <div className="relative hidden sm:block">
          <Search className="w-4 h-4 text-surface-400 dark:text-surface-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search agents, campaigns, countries..."
            className="pl-9 pr-4 py-2 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-sm w-80
              text-surface-900 dark:text-surface-100 placeholder:text-surface-400 dark:placeholder:text-surface-500
              focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            aria-label="Search"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 bg-surface-50 dark:bg-surface-800 rounded-lg p-1">
          {(['manual', 'semi', 'full'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setAutonomyMode(mode)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize
                ${autonomyMode === mode
                  ? 'bg-white dark:bg-surface-700 text-primary-700 dark:text-primary-300 shadow-sm'
                  : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200'
                }`}
            >
              {mode === 'semi' ? 'Semi-Auto' : mode === 'full' ? 'Full Auto' : 'Manual'}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-surface-200 dark:bg-surface-700" />

        <button
          onClick={toggleDarkMode}
          className="p-2 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg transition-colors"
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? <Sun className="w-5 h-5 text-warning-500" /> : <Moon className="w-5 h-5 text-surface-600 dark:text-surface-400" />}
        </button>

        <button className="p-2 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg relative" aria-label="Security status">
          <Shield className="w-5 h-5 text-success-600" />
        </button>

        <button className="p-2 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg relative" aria-label="Notifications">
          <Bell className="w-5 h-5 text-surface-600 dark:text-surface-400" />
          {unreadAlerts > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-danger-500 text-white text-[10px] font-bold
              rounded-full flex items-center justify-center">
              {unreadAlerts > 9 ? '9+' : unreadAlerts}
            </span>
          )}
        </button>

        <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
          <span className="text-xs font-bold text-white">AI</span>
        </div>
      </div>
    </header>
  );
}
