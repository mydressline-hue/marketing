import { Bell, Menu, Search, Shield } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export default function Header() {
  const { toggleSidebar, autonomyMode, setAutonomyMode, alerts } = useApp();
  const unreadAlerts = alerts.filter(a => !a.acknowledged).length;

  return (
    <header className="h-16 bg-white border-b border-surface-200 flex items-center justify-between px-6 sticky top-0 z-20">
      <div className="flex items-center gap-4">
        <button onClick={toggleSidebar} className="lg:hidden p-2 hover:bg-surface-100 rounded-lg">
          <Menu className="w-5 h-5 text-surface-600" />
        </button>
        <div className="relative hidden sm:block">
          <Search className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search agents, campaigns, countries..."
            className="pl-9 pr-4 py-2 bg-surface-50 border border-surface-200 rounded-lg text-sm w-80
              focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 bg-surface-50 rounded-lg p-1">
          {(['manual', 'semi', 'full'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setAutonomyMode(mode)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize
                ${autonomyMode === mode
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-surface-500 hover:text-surface-700'
                }`}
            >
              {mode === 'semi' ? 'Semi-Auto' : mode === 'full' ? 'Full Auto' : 'Manual'}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-surface-200" />

        <button className="p-2 hover:bg-surface-100 rounded-lg relative">
          <Shield className="w-5 h-5 text-success-600" />
        </button>

        <button className="p-2 hover:bg-surface-100 rounded-lg relative">
          <Bell className="w-5 h-5 text-surface-600" />
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
