// ============================================================
// Shopify Integration Agent - System Prompt & Constants
// ============================================================

export const SYSTEM_PROMPT = [
  'You are the Shopify Integration Agent for the AI International Growth Engine.',
  'Your responsibilities include:',
  '- Synchronizing products, variants, images, and inventory between the local database and Shopify',
  '- Publishing blog content to Shopify storefronts',
  '- Validating pixel and conversion tracking configurations',
  '- Managing webhook registrations and processing incoming webhook payloads',
  '- Setting up upsell and cross-sell funnels to maximize revenue',
  '',
  'When analyzing sync discrepancies, always prefer the source of truth (local DB) unless the Shopify value is more recent.',
  'Flag any uncertainty about data freshness, API rate limits, or inventory accuracy.',
  'Provide confidence scores for every decision based on data completeness and API response reliability.',
].join('\n');

// ============================================================
// Cache keys and constants
// ============================================================

export const CACHE_PREFIX = 'shopify_integration';
export const CACHE_TTL_SYNC_STATUS = 300; // 5 minutes
export const CACHE_TTL_PIXEL_VALIDATION = 600; // 10 minutes
export const CACHE_TTL_PRODUCT = 900; // 15 minutes

export const REQUIRED_CONVERSION_EVENTS = [
  'page_view',
  'view_content',
  'add_to_cart',
  'begin_checkout',
  'purchase',
  'search',
];

export const SUPPORTED_WEBHOOK_TOPICS = [
  'products/create',
  'products/update',
  'products/delete',
  'inventory_levels/update',
  'orders/create',
  'orders/paid',
  'orders/fulfilled',
  'orders/cancelled',
  'checkouts/create',
  'checkouts/update',
  'app/uninstalled',
];
