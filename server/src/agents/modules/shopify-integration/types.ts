// ============================================================
// Shopify Integration Agent - Type Definitions
// ============================================================

export interface SyncError {
  productId: string;
  error: string;
  retryable: boolean;
}

export interface SyncResult {
  synced: number;
  failed: number;
  skipped: number;
  errors: SyncError[];
  duration: number;
}

export interface ProductSyncResult {
  productId: string;
  shopifyId: string;
  status: 'created' | 'updated' | 'unchanged' | 'failed';
  changes: string[];
}

export interface Discrepancy {
  productId: string;
  field: string;
  localValue: unknown;
  shopifyValue: unknown;
  resolution?: string;
}

export interface InventorySyncResult {
  updated: number;
  discrepancies: Discrepancy[];
  timestamp: string;
}

export interface BlogPublishResult {
  contentId: string;
  shopifyBlogId: string;
  url: string;
  publishedAt: string;
}

export interface PixelValidation {
  pixelId: string;
  status: 'active' | 'inactive' | 'error';
  eventsTracked: string[];
  issues: string[];
  lastFiredAt?: string;
}

export interface ConversionValidation {
  trackingActive: boolean;
  eventsConfigured: string[];
  missingEvents: string[];
  accuracy: number;
}

export interface WebhookRegistration {
  id: string;
  topic: string;
  address: string;
  createdAt: string;
}

export interface FunnelStep {
  step: number;
  type: 'upsell' | 'cross_sell' | 'downsell';
  productId: string;
  discount?: number;
}

export interface UpsellConfig {
  primaryProductId: string;
  upsellProducts: string[];
  funnelSteps: FunnelStep[];
  expectedRevenueLift: number;
}

export interface SyncStatus {
  lastSync: string;
  productsInSync: number;
  productsOutOfSync: number;
  inventoryAccuracy: number;
}

export interface ResolutionResult {
  discrepancy: Discrepancy;
  resolved: boolean;
  action: string;
}
