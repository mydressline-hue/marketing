// ============================================================
// @marketing/shared - Shared Type Definitions
// Types used by both the server and UI packages
// ============================================================

// ---- Primitive Aliases ----

/** Canonical string-based identifier used across all entities. */
export type ID = string;

/** Sort direction for list/table queries. */
export type SortOrder = 'asc' | 'desc';

/** A start/end date pair used in range-based queries and filters. */
export type DateRange = { startDate: string; endDate: string };

// ---- API Envelope Types ----

/**
 * Standard API response wrapper.
 * Server sends this shape; UI consumes it.
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
    statusCode: number;
  };
  meta?: {
    page?: number;
    totalPages?: number;
    total?: number;
  };
}

/**
 * Paginated list response returned by collection endpoints.
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

/**
 * Pagination query parameters sent from UI to server.
 */
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: SortOrder;
}

// ---- Platform & Campaign Types ----

/** Advertising platforms supported by the system. */
export type Platform = 'google' | 'bing' | 'meta' | 'tiktok' | 'snapchat';

/**
 * Lifecycle status of a campaign.
 * Used by server Campaign entity and UI CampaignData.
 */
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';

/**
 * Core performance metrics associated with a campaign.
 * Server stores these on the Campaign entity; UI displays them in campaign views.
 */
export interface CampaignMetrics {
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
}

// ---- User & Auth Types ----

/** User role names for role-based access control. */
export type RoleName = 'admin' | 'analyst' | 'campaign_manager' | 'viewer';

// ---- Creative & Content Types ----

/** Types of creative assets that can be generated. */
export type CreativeType = 'ad_copy' | 'video_script' | 'ugc_script' | 'image' | 'thumbnail';

/**
 * Publishing status for content items.
 * Used by server Content entity and UI ContentItem.
 */
export type ContentStatus = 'draft' | 'review' | 'published';

// ---- Fraud Types ----

/**
 * Categories of fraud detected by the system.
 * Used by both server FraudAlert entity and UI FraudAlert view model.
 */
export type FraudType = 'click_fraud' | 'bot_traffic' | 'conversion_anomaly' | 'budget_misuse';

/** Severity levels shared across fraud alerts, compliance, and security events. */
export type Severity = 'low' | 'medium' | 'high' | 'critical';

// ---- Compliance Types ----

/** Privacy/data regulation frameworks tracked by the system. */
export type RegulationType = 'gdpr' | 'ccpa' | 'lgpd' | 'pipa' | 'appi' | 'privacy_act' | 'pipeda' | 'it_act' | 'pdpl' | 'eprivacy';

/** Review status for compliance checks. */
export type ComplianceStatus = 'compliant' | 'non_compliant' | 'pending_review' | 'exempted';

// ---- A/B Test Types ----

/** Lifecycle status of an A/B test. */
export type ABTestStatus = 'draft' | 'running' | 'paused' | 'completed';
