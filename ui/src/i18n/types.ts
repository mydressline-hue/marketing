/**
 * Union type of all known translation keys.
 *
 * When adding new strings to `en.ts` (or any other locale file), add the
 * corresponding key literal here so that callers of `t()` can benefit from
 * autocompletion and compile-time checking when used with the typed helper.
 */
export type TranslationKey =
  // Header
  | 'header.search.placeholder'
  | 'header.mode.manual'
  | 'header.mode.semi'
  | 'header.mode.full'
  | 'header.toggle_sidebar'
  | 'header.dark_mode.on'
  | 'header.dark_mode.off'
  | 'header.security_status'
  | 'header.notifications'

  // Sidebar
  | 'sidebar.brand.name'
  | 'sidebar.brand.tagline'
  | 'sidebar.close'
  | 'sidebar.system_active'
  | 'sidebar.agents_running'
  | 'sidebar.nav.dashboard'
  | 'sidebar.nav.market_intelligence'
  | 'sidebar.nav.country_strategy'
  | 'sidebar.nav.paid_ads'
  | 'sidebar.nav.organic_social'
  | 'sidebar.nav.content_blog'
  | 'sidebar.nav.creative_studio'
  | 'sidebar.nav.video_generation'
  | 'sidebar.nav.analytics'
  | 'sidebar.nav.budget_optimizer'
  | 'sidebar.nav.ab_testing'
  | 'sidebar.nav.conversion'
  | 'sidebar.nav.shopify'
  | 'sidebar.nav.localization'
  | 'sidebar.nav.compliance'
  | 'sidebar.nav.competitive_intel'
  | 'sidebar.nav.fraud_detection'
  | 'sidebar.nav.brand_consistency'
  | 'sidebar.nav.data_engineering'
  | 'sidebar.nav.security'
  | 'sidebar.nav.revenue_forecast'
  | 'sidebar.nav.orchestrator'
  | 'sidebar.nav.kill_switch'
  | 'sidebar.nav.settings'

  // ErrorBoundary / ApiErrorDisplay
  | 'error.something_went_wrong'
  | 'error.unexpected'
  | 'error.try_again'
  | 'error.request_failed'
  | 'error.access_denied'
  | 'error.not_found'
  | 'error.too_many_requests'
  | 'error.server_error'
  | 'error.retry'
  | 'error.dismiss'

  // ConfirmDialog
  | 'dialog.confirm'
  | 'dialog.cancel'
  | 'dialog.close'

  // Dashboard
  | 'dashboard.title'
  | 'dashboard.subtitle'
  | 'dashboard.system.operational'
  | 'dashboard.system.connecting'
  | 'dashboard.kpi.total_revenue'
  | 'dashboard.kpi.active_campaigns'
  | 'dashboard.kpi.global_roas'
  | 'dashboard.kpi.active_countries'
  | 'dashboard.kpi.markets_suffix'
  | 'dashboard.chart.revenue_trends'
  | 'dashboard.chart.last_6_months'
  | 'dashboard.chart.channel_performance'
  | 'dashboard.chart.spend_vs_revenue'
  | 'dashboard.agents.title'
  | 'dashboard.agents.subtitle'
  | 'dashboard.agents.active'
  | 'dashboard.agents.idle'
  | 'dashboard.agents.error'
  | 'dashboard.countries.title'
  | 'dashboard.countries.subtitle'
  | 'dashboard.alerts.title'
  | 'dashboard.alerts.subtitle'
  | 'dashboard.alerts.critical_count'
  | 'dashboard.confidence.title'
  | 'dashboard.confidence.subtitle'
  | 'dashboard.confidence.overall'
  | 'dashboard.confidence.weighted_avg'

  // Common / Shared
  | 'common.save'
  | 'common.save_changes'
  | 'common.saved'
  | 'common.saving'
  | 'common.loading'
  | 'common.close'
  | 'common.notifications';

/**
 * Typed wrapper for the `t()` function.
 *
 * Usage:
 * ```ts
 * import { t } from '../i18n';
 * import type { TranslationKey } from '../i18n/types';
 *
 * const label = t('header.mode.manual' satisfies TranslationKey);
 * ```
 */
export type TranslationFn = (key: TranslationKey, params?: Record<string, string | number>) => string;
