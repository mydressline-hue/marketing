import { NavLink } from 'react-router-dom';
import {
  Globe, Target, Megaphone, Share2, FileText, Palette, BarChart3,
  DollarSign, FlaskConical, MousePointerClick, ShoppingBag, Languages,
  Shield, Eye, AlertTriangle, Fingerprint, Database, Lock,
  TrendingUp, Cpu, Settings, Power, LayoutDashboard, X, Video
} from 'lucide-react';
import { useApp } from '../../context/useApp';

const navItems = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Market Intelligence', path: '/market-intelligence', icon: Globe },
  { label: 'Country Strategy', path: '/country-strategy', icon: Target },
  { label: 'Paid Ads', path: '/paid-ads', icon: Megaphone },
  { label: 'Organic Social', path: '/organic-social', icon: Share2 },
  { label: 'Content & Blog', path: '/content-blog', icon: FileText },
  { label: 'Creative Studio', path: '/creative-studio', icon: Palette },
  { label: 'Video Generation', path: '/video-generation', icon: Video },
  { label: 'Analytics', path: '/analytics', icon: BarChart3 },
  { label: 'Budget Optimizer', path: '/budget-optimizer', icon: DollarSign },
  { label: 'A/B Testing', path: '/ab-testing', icon: FlaskConical },
  { label: 'Conversion', path: '/conversion', icon: MousePointerClick },
  { label: 'Shopify', path: '/shopify', icon: ShoppingBag },
  { label: 'Localization', path: '/localization', icon: Languages },
  { label: 'Compliance', path: '/compliance', icon: Shield },
  { label: 'Competitive Intel', path: '/competitive-intel', icon: Eye },
  { label: 'Fraud Detection', path: '/fraud-detection', icon: AlertTriangle },
  { label: 'Brand Consistency', path: '/brand-consistency', icon: Fingerprint },
  { label: 'Data Engineering', path: '/data-engineering', icon: Database },
  { label: 'Security', path: '/security', icon: Lock },
  { label: 'Revenue Forecast', path: '/revenue-forecast', icon: TrendingUp },
  { label: 'Orchestrator', path: '/orchestrator', icon: Cpu },
  { label: 'Kill Switch', path: '/kill-switch', icon: Power },
  { label: 'Settings', path: '/settings', icon: Settings },
];

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useApp();

  return (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 z-30 lg:hidden" onClick={toggleSidebar} />
      )}
      <aside className={`
        fixed top-0 left-0 z-40 h-full bg-white dark:bg-surface-900 border-r border-surface-200 dark:border-surface-700
        transition-transform duration-300 w-[260px] flex flex-col
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        <div className="flex items-center justify-between h-16 px-5 border-b border-surface-100 dark:border-surface-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center">
              <Globe className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-surface-900 dark:text-surface-100 leading-tight">Growth Engine</h1>
              <p className="text-[10px] text-surface-500 dark:text-surface-400 leading-tight">AI International</p>
            </div>
          </div>
          <button onClick={toggleSidebar} className="lg:hidden p-1 hover:bg-surface-100 dark:hover:bg-surface-800 rounded" aria-label="Close sidebar">
            <X className="w-4 h-4 text-surface-500 dark:text-surface-400" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3" role="navigation" aria-label="Main navigation">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `
                flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium
                transition-colors mb-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                ${isActive
                  ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300'
                  : 'text-surface-600 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-100'
                }
              `}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-surface-100 dark:border-surface-800">
          <div className="bg-surface-50 dark:bg-surface-800 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 bg-success-500 rounded-full animate-pulse" />
              <span className="text-xs font-medium text-surface-700 dark:text-surface-300">System Active</span>
            </div>
            <p className="text-[10px] text-surface-500 dark:text-surface-400">20 agents running</p>
          </div>
        </div>
      </aside>
    </>
  );
}
