import { addTranslations } from './index';

const en: Record<string, string> = {
  // ---------------------------------------------------------------------------
  // Header
  // ---------------------------------------------------------------------------
  'header.search.placeholder': 'Search agents, campaigns, countries...',
  'header.mode.manual': 'Manual',
  'header.mode.semi': 'Semi-Auto',
  'header.mode.full': 'Full Auto',
  'header.toggle_sidebar': 'Toggle sidebar',
  'header.dark_mode.on': 'Switch to light mode',
  'header.dark_mode.off': 'Switch to dark mode',
  'header.security_status': 'Security status',
  'header.notifications': 'Notifications',

  // ---------------------------------------------------------------------------
  // Sidebar
  // ---------------------------------------------------------------------------
  'sidebar.brand.name': 'Growth Engine',
  'sidebar.brand.tagline': 'AI International',
  'sidebar.close': 'Close sidebar',
  'sidebar.system_active': 'System Active',
  'sidebar.agents_running': '{{count}} agents running',
  'sidebar.nav.dashboard': 'Dashboard',
  'sidebar.nav.market_intelligence': 'Market Intelligence',
  'sidebar.nav.country_strategy': 'Country Strategy',
  'sidebar.nav.paid_ads': 'Paid Ads',
  'sidebar.nav.organic_social': 'Organic Social',
  'sidebar.nav.content_blog': 'Content & Blog',
  'sidebar.nav.creative_studio': 'Creative Studio',
  'sidebar.nav.video_generation': 'Video Generation',
  'sidebar.nav.analytics': 'Analytics',
  'sidebar.nav.budget_optimizer': 'Budget Optimizer',
  'sidebar.nav.ab_testing': 'A/B Testing',
  'sidebar.nav.conversion': 'Conversion',
  'sidebar.nav.shopify': 'Shopify',
  'sidebar.nav.localization': 'Localization',
  'sidebar.nav.compliance': 'Compliance',
  'sidebar.nav.competitive_intel': 'Competitive Intel',
  'sidebar.nav.fraud_detection': 'Fraud Detection',
  'sidebar.nav.brand_consistency': 'Brand Consistency',
  'sidebar.nav.data_engineering': 'Data Engineering',
  'sidebar.nav.security': 'Security',
  'sidebar.nav.revenue_forecast': 'Revenue Forecast',
  'sidebar.nav.orchestrator': 'Orchestrator',
  'sidebar.nav.kill_switch': 'Kill Switch',
  'sidebar.nav.settings': 'Settings',

  // ---------------------------------------------------------------------------
  // ErrorBoundary / ApiErrorDisplay
  // ---------------------------------------------------------------------------
  'error.something_went_wrong': 'Something went wrong',
  'error.unexpected': 'An unexpected error occurred. Please try again.',
  'error.try_again': 'Try again',
  'error.request_failed': 'Request failed',
  'error.access_denied': 'Access denied',
  'error.not_found': 'Not found',
  'error.too_many_requests': 'Too many requests',
  'error.server_error': 'Server error',
  'error.retry': 'Retry',
  'error.dismiss': 'Dismiss error',

  // ---------------------------------------------------------------------------
  // ConfirmDialog
  // ---------------------------------------------------------------------------
  'dialog.confirm': 'Confirm',
  'dialog.cancel': 'Cancel',
  'dialog.close': 'Close dialog',

  // ---------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------
  'dashboard.title': 'Command Center',
  'dashboard.subtitle': 'AI International Growth Engine - Real-time Overview',
  'dashboard.system.operational': 'All systems operational',
  'dashboard.system.connecting': 'Connecting...',
  'dashboard.kpi.total_revenue': 'Total Revenue',
  'dashboard.kpi.active_campaigns': 'Active Campaigns',
  'dashboard.kpi.global_roas': 'Global ROAS',
  'dashboard.kpi.active_countries': 'Active Countries',
  'dashboard.kpi.markets_suffix': ' markets',
  'dashboard.chart.revenue_trends': 'Revenue Trends',
  'dashboard.chart.last_6_months': 'Last 6 months',
  'dashboard.chart.channel_performance': 'Channel Performance',
  'dashboard.chart.spend_vs_revenue': 'Spend vs Revenue by channel',
  'dashboard.agents.title': 'Agent Status',
  'dashboard.agents.subtitle': '{{count}} AI agents',
  'dashboard.agents.active': 'Active',
  'dashboard.agents.idle': 'Idle',
  'dashboard.agents.error': 'Error',
  'dashboard.countries.title': 'Top Countries by Revenue',
  'dashboard.countries.subtitle': 'Current month',
  'dashboard.alerts.title': 'Recent Alerts',
  'dashboard.alerts.subtitle': 'Requires attention',
  'dashboard.alerts.critical_count': '{{count}} critical',
  'dashboard.confidence.title': 'System Confidence',
  'dashboard.confidence.subtitle': 'AI engine health',
  'dashboard.confidence.overall': 'Overall Confidence',
  'dashboard.confidence.weighted_avg': 'Weighted average across all metrics',

  // ---------------------------------------------------------------------------
  // Common / Shared
  // ---------------------------------------------------------------------------
  'common.save': 'Save',
  'common.save_changes': 'Save Changes',
  'common.saved': 'Saved',
  'common.saving': 'Saving...',
  'common.loading': 'Loading...',
  'common.close': 'Close',
  'common.notifications': 'Notifications',
};

addTranslations('en', en);

export default en;
