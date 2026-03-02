import { ChevronRight, Home } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface BreadcrumbProps {
  items?: BreadcrumbItem[];
  className?: string;
}

const routeLabels: Record<string, string> = {
  '': 'Dashboard',
  'market-intelligence': 'Market Intelligence',
  'country-strategy': 'Country Strategy',
  'paid-ads': 'Paid Ads',
  'organic-social': 'Organic Social',
  'content-blog': 'Content & Blog',
  'creative-studio': 'Creative Studio',
  'analytics': 'Analytics',
  'budget-optimizer': 'Budget Optimizer',
  'ab-testing': 'A/B Testing',
  'conversion': 'Conversion',
  'shopify': 'Shopify',
  'localization': 'Localization',
  'compliance': 'Compliance',
  'competitive-intel': 'Competitive Intel',
  'fraud-detection': 'Fraud Detection',
  'brand-consistency': 'Brand Consistency',
  'data-engineering': 'Data Engineering',
  'security': 'Security',
  'revenue-forecast': 'Revenue Forecast',
  'orchestrator': 'Orchestrator',
  'kill-switch': 'Kill Switch',
  'settings': 'Settings',
};

export default function Breadcrumb({ items, className = '' }: BreadcrumbProps) {
  const location = useLocation();

  const breadcrumbs: BreadcrumbItem[] = items ?? (() => {
    const segments = location.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return [{ label: 'Dashboard' }];
    return [
      { label: 'Dashboard', path: '/' },
      ...segments.map((seg, i) => ({
        label: routeLabels[seg] || seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' '),
        path: i < segments.length - 1 ? '/' + segments.slice(0, i + 1).join('/') : undefined,
      })),
    ];
  })();

  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-1.5 text-sm ${className}`}>
      <Link to="/" className="text-surface-400 dark:text-surface-500 hover:text-surface-600 dark:hover:text-surface-300 transition-colors" aria-label="Home">
        <Home className="w-4 h-4" />
      </Link>
      {breadcrumbs.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <ChevronRight className="w-3.5 h-3.5 text-surface-300 dark:text-surface-600" />
          {item.path ? (
            <Link
              to={item.path}
              className="text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-surface-800 dark:text-surface-200 font-medium">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
