// ============================================================
// AI International Growth Engine - TypeScript Type Definitions
// Single source of truth for all backend types
// ============================================================

// ---- Common Types ----

export type ID = string;
export type SortOrder = 'asc' | 'desc';
export type DateRange = { startDate: string; endDate: string };

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

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

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: SortOrder;
}

// ---- User & Auth Types ----

export type RoleName = 'admin' | 'analyst' | 'campaign_manager' | 'viewer';

export interface User {
  id: ID;
  email: string;
  password_hash?: string;
  name: string;
  role: RoleName;
  mfa_enabled: boolean;
  mfa_secret?: string;
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: ID;
  name: RoleName;
  permissions: string[];
  created_at: string;
}

export interface Session {
  id: ID;
  user_id: ID;
  token_hash: string;
  ip_address: string;
  user_agent: string;
  expires_at: string;
  created_at: string;
}

export interface ApiKey {
  id: ID;
  user_id: ID;
  key_hash: string;
  name: string;
  scopes: string[];
  encrypted_key: string;
  is_active: boolean;
  expires_at?: string;
  last_used_at?: string;
  created_at: string;
}

export interface AuditLogEntry {
  id: ID;
  user_id?: ID;
  action: string;
  resource_type: string;
  resource_id?: ID;
  details?: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
}

export interface MFAConfig {
  enabled: boolean;
  secret?: string;
  backup_codes?: string[];
}

export interface AuthTokens {
  token: string;
  refreshToken: string;
}

// ---- Country Types ----

export interface Country {
  id: ID;
  name: string;
  code: string;
  region: string;
  language: string;
  currency: string;
  timezone: string;
  gdp?: number;
  internet_penetration?: number;
  ecommerce_adoption?: number;
  social_platforms?: Record<string, number>;
  ad_costs?: Record<string, number>;
  cultural_behavior?: Record<string, string>;
  opportunity_score?: number;
  entry_strategy?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCountryInput {
  name: string;
  code: string;
  region: string;
  language: string;
  currency: string;
  timezone: string;
  gdp?: number;
  internet_penetration?: number;
  ecommerce_adoption?: number;
  social_platforms?: Record<string, number>;
  ad_costs?: Record<string, number>;
  cultural_behavior?: Record<string, string>;
}

// ---- Campaign Types ----

export type Platform = 'google' | 'bing' | 'meta' | 'tiktok' | 'snapchat';
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';

export interface Campaign {
  id: ID;
  name: string;
  country_id: ID;
  platform: Platform;
  type: string;
  status: CampaignStatus;
  budget: number;
  spent: number;
  start_date: string;
  end_date?: string;
  targeting?: Record<string, unknown>;
  metrics?: CampaignMetrics;
  created_by: ID;
  created_at: string;
  updated_at: string;
  country_name?: string;
}

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

export interface CreateCampaignInput {
  name: string;
  country_id: ID;
  platform: Platform;
  type: string;
  budget: number;
  start_date: string;
  end_date?: string;
  targeting?: Record<string, unknown>;
}

export interface UpdateCampaignInput extends Partial<CreateCampaignInput> {
  status?: CampaignStatus;
}

export interface RetargetingConfig {
  enabled: boolean;
  audience_ids: string[];
  lookback_days: number;
  exclusions: string[];
}

export interface SpendSummary {
  total_budget: number;
  total_spent: number;
  by_platform: Record<Platform, { budget: number; spent: number }>;
  by_country: Array<{ country_id: ID; country_name: string; budget: number; spent: number }>;
}

// ---- Creative Types ----

export type CreativeType = 'ad_copy' | 'video_script' | 'ugc_script' | 'image' | 'thumbnail';

export interface Creative {
  id: ID;
  name: string;
  type: CreativeType;
  campaign_id: ID;
  content: string;
  media_urls?: string[];
  performance?: CreativePerformance;
  fatigue_score: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreativePerformance {
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  engagement_rate: number;
}

export interface FatigueScore {
  score: number;
  factors: Record<string, number>;
  recommendation: string;
}

// ---- Content Types ----

export type ContentStatus = 'draft' | 'review' | 'published';

export interface Content {
  id: ID;
  title: string;
  body: string;
  status: ContentStatus;
  seo_data?: SEOData;
  country_id: ID;
  language: string;
  shopify_id?: string;
  published_at?: string;
  created_by: ID;
  created_at: string;
  updated_at: string;
}

export interface SEOData {
  keywords: string[];
  meta_title: string;
  meta_description: string;
  schema_markup?: Record<string, unknown>;
  internal_links: string[];
  readability_score: number;
}

export interface BlogPost extends Content {
  slug: string;
  featured_image?: string;
  category?: string;
  tags?: string[];
}

// ---- Product Types ----

export interface Product {
  id: ID;
  title: string;
  description: string;
  shopify_id?: string;
  images: string[];
  variants: ProductVariant[];
  inventory_level: number;
  is_active: boolean;
  synced_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ProductVariant {
  id?: string;
  title: string;
  sku: string;
  price: number;
  compare_at_price?: number;
  stock: number;
  weight?: number;
  option1?: string;
  option2?: string;
}

export interface InventoryLevel {
  product_id: ID;
  variant_id?: string;
  available: number;
  reserved: number;
  incoming: number;
}

// ---- Translation Types ----

export interface Translation {
  id: ID;
  source_content_id: ID;
  language: string;
  translated_text: string;
  cultural_adaptations?: CulturalAdaptation;
  currency_pair?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export type Language = 'en' | 'es' | 'fr' | 'de' | 'ja' | 'ko' | 'pt' | 'ar';

export interface CulturalAdaptation {
  tone_adjustments: string[];
  imagery_notes: string[];
  taboo_topics: string[];
  local_references: string[];
}

export interface CurrencyPair {
  from: string;
  to: string;
  rate: number;
  last_updated: string;
}

// ---- Compliance Types ----

export type RegulationType = 'gdpr' | 'ccpa' | 'lgpd' | 'pipa' | 'appi' | 'privacy_act' | 'pipeda' | 'it_act' | 'pdpl' | 'eprivacy';

export interface ComplianceRule {
  id: ID;
  name: string;
  regulation: RegulationType;
  country_id: ID;
  rule_definition: Record<string, unknown>;
  severity: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ComplianceStatus = 'compliant' | 'non_compliant' | 'pending_review' | 'exempted';

export interface RiskFlag {
  id: ID;
  resource_type: string;
  resource_id: ID;
  rule_id: ID;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  status: ComplianceStatus;
}

// ---- Competitor Types ----

export interface Competitor {
  id: ID;
  name: string;
  website: string;
  platforms: Record<string, unknown>;
  metrics: CompetitorMetric;
  last_analyzed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CompetitorMetric {
  estimated_spend?: number;
  market_share?: number;
  ad_frequency?: number;
  top_keywords?: string[];
  creative_count?: number;
}

export interface GapAnalysis {
  competitor_id: ID;
  gaps: Array<{ area: string; our_score: number; their_score: number; opportunity: string }>;
  generated_at: string;
}

export interface TrendSignal {
  id: ID;
  source: string;
  signal_type: string;
  description: string;
  confidence: number;
  detected_at: string;
}

// ---- Fraud Types ----

export type FraudType = 'click_fraud' | 'bot_traffic' | 'conversion_anomaly' | 'budget_misuse';

export interface FraudAlert {
  id: ID;
  type: FraudType;
  campaign_id?: ID;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence_score: number;
  details: Record<string, unknown>;
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  resolved_by?: ID;
  resolved_at?: string;
  created_at: string;
}

export interface AnomalyRule {
  id: ID;
  name: string;
  type: FraudType;
  condition: Record<string, unknown>;
  threshold: number;
  is_active: boolean;
}

// ---- A/B Test Types ----

export type ABTestStatus = 'draft' | 'running' | 'paused' | 'completed';

export interface ABTest {
  id: ID;
  name: string;
  type: string;
  campaign_id: ID;
  variants: TestVariant[];
  status: ABTestStatus;
  statistical_results?: StatisticalResult;
  confidence_level?: number;
  winner_variant?: string;
  started_at?: string;
  completed_at?: string;
  created_by: ID;
  created_at: string;
  updated_at: string;
}

export interface TestVariant {
  id: string;
  name: string;
  config: Record<string, unknown>;
  traffic_split: number;
  impressions?: number;
  conversions?: number;
  conversion_rate?: number;
}

export interface StatisticalResult {
  method: 'bayesian' | 'frequentist';
  confidence: number;
  p_value?: number;
  lift?: number;
  sample_size: number;
  is_significant: boolean;
}

export type ConfidenceLevel = 'low' | 'medium' | 'high' | 'very_high';

// ---- Budget Types ----

export interface BudgetAllocation {
  id: ID;
  country_id: ID;
  channel_allocations: Record<string, number>;
  period_start: string;
  period_end: string;
  total_budget: number;
  total_spent: number;
  risk_guardrails?: RiskGuardrail[];
  created_by: ID;
  created_at: string;
  updated_at: string;
}

export interface SpendRecord {
  id: ID;
  allocation_id: ID;
  channel: string;
  amount: number;
  date: string;
  created_at: string;
}

export interface ROASMetric {
  channel: string;
  spend: number;
  revenue: number;
  roas: number;
  trend: 'up' | 'down' | 'stable';
}

export interface AllocationRule {
  id: ID;
  name: string;
  condition: string;
  action: string;
  is_active: boolean;
}

export interface RiskGuardrail {
  type: string;
  threshold: number;
  action: 'alert' | 'pause' | 'reduce';
  description: string;
}

// ---- Agent Types ----

export type AgentType =
  | 'market_intelligence'
  | 'country_strategy'
  | 'paid_ads'
  | 'organic_social'
  | 'content_blog'
  | 'creative_generation'
  | 'performance_analytics'
  | 'budget_optimization'
  | 'ab_testing'
  | 'conversion_optimization'
  | 'shopify_integration'
  | 'localization'
  | 'compliance'
  | 'competitive_intelligence'
  | 'fraud_detection'
  | 'brand_consistency'
  | 'data_engineering'
  | 'enterprise_security'
  | 'revenue_forecasting'
  | 'master_orchestrator';

export type AgentStatus = 'idle' | 'running' | 'paused' | 'error';

export interface AgentState {
  id: ID;
  agent_type: AgentType;
  status: AgentStatus;
  last_run_at?: string;
  next_run_at?: string;
  config: Record<string, unknown>;
  metrics: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AgentDecision {
  id: ID;
  agent_type: AgentType;
  decision_type: string;
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown>;
  confidence_score: number;
  reasoning: string;
  challenged_by?: AgentType[];
  challenge_results?: CrossChallengeResult[];
  is_approved: boolean;
  approved_by?: ID;
  created_at: string;
}

export interface ConfidenceScore {
  score: number;
  factors: Record<string, number>;
  level: ConfidenceLevel;
}

export interface CrossChallengeResult {
  challenger: AgentType;
  challenged: AgentType;
  finding: string;
  severity: 'info' | 'warning' | 'critical';
  confidence: number;
  resolved: boolean;
}

// ---- Kill Switch Types ----

export type HaltLevel = 0 | 1 | 2 | 3 | 4;

export type TriggerType =
  | 'manual'
  | 'roas_drop'
  | 'spend_anomaly'
  | 'conversion_failure'
  | 'cpc_spike'
  | 'api_error_storm'
  | 'fraud_alert';

export interface KillSwitchState {
  id: ID;
  level: HaltLevel;
  is_active: boolean;
  activated_by?: ID;
  trigger_type?: TriggerType;
  trigger_details?: Record<string, unknown>;
  affected_countries?: ID[];
  affected_campaigns?: ID[];
  activated_at?: string;
  deactivated_at?: string;
  created_at: string;
}

export interface KillSwitchTrigger {
  type: TriggerType;
  threshold: number;
  current_value: number;
  is_enabled: boolean;
  last_triggered_at?: string;
}

// ---- Analytics Types ----

export interface KPI {
  name: string;
  value: number;
  previous_value: number;
  change_percent: number;
  trend: 'up' | 'down' | 'stable';
  period: string;
}

export type FunnelStage = 'awareness' | 'interest' | 'consideration' | 'intent' | 'purchase' | 'loyalty';

export type AttributionModel = 'last_click' | 'linear' | 'time_decay' | 'position_based';

export interface ChannelMetric {
  channel: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  revenue: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
}

// ---- Settings Types ----

export interface SystemSettings {
  notifications: NotificationConfig;
  appearance: AppearanceConfig;
  api_keys: Record<string, boolean>;
  ai_config: {
    opus_model: string;
    sonnet_model: string;
    max_tokens: number;
    temperature: number;
  };
}

export interface NotificationConfig {
  email_alerts: boolean;
  slack_webhook?: string;
  alert_threshold: 'low' | 'medium' | 'high' | 'critical';
  digest_frequency: 'realtime' | 'hourly' | 'daily';
}

export interface AppearanceConfig {
  theme: 'light' | 'dark' | 'system';
  density: 'compact' | 'comfortable' | 'spacious';
  sidebar_collapsed: boolean;
}
