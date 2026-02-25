export interface AgentStatus {
  id: string;
  name: string;
  status: 'active' | 'idle' | 'warning' | 'error' | 'paused';
  confidence: number;
  lastAction: string;
  lastUpdated: string;
  tasksCompleted: number;
  tasksPending: number;
}

export interface CountryData {
  code: string;
  name: string;
  flag: string;
  opportunityScore: number;
  gdp: string;
  internetPenetration: number;
  ecommerceAdoption: number;
  adCostIndex: number;
  entryStrategy: string;
  status: 'active' | 'planned' | 'research';
}

export interface CampaignData {
  id: string;
  name: string;
  platform: 'google' | 'meta' | 'tiktok' | 'bing' | 'snapchat';
  country: string;
  status: 'active' | 'paused' | 'draft' | 'completed';
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number;
  cpc: number;
  ctr: number;
}

export interface KPIData {
  label: string;
  value: string | number;
  change: number;
  trend: 'up' | 'down' | 'stable';
  prefix?: string;
  suffix?: string;
}

export interface BudgetAllocation {
  channel: string;
  allocated: number;
  spent: number;
  remaining: number;
  roas: number;
  recommendation: 'increase' | 'maintain' | 'decrease' | 'pause';
}

export interface ABTest {
  id: string;
  name: string;
  type: 'creative' | 'landing_page' | 'pricing' | 'offer';
  status: 'running' | 'completed' | 'paused';
  variants: number;
  confidence: number;
  winner?: string;
  improvement: number;
  startDate: string;
  endDate?: string;
}

export interface ContentItem {
  id: string;
  title: string;
  type: 'blog' | 'social' | 'ad_copy' | 'video_script';
  status: 'published' | 'draft' | 'scheduled' | 'review';
  language: string;
  country: string;
  seoScore: number;
  publishDate?: string;
}

export interface AlertItem {
  id: string;
  type: 'critical' | 'warning' | 'info';
  source: string;
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

export interface ComplianceItem {
  id: string;
  country: string;
  regulation: string;
  status: 'compliant' | 'warning' | 'violation' | 'review';
  details: string;
  lastChecked: string;
}

export interface FraudAlert {
  id: string;
  type: 'click_fraud' | 'bot_traffic' | 'conversion_anomaly' | 'budget_misuse';
  severity: 'critical' | 'high' | 'medium' | 'low';
  campaign: string;
  description: string;
  timestamp: string;
  resolved: boolean;
}

export interface RevenueProjection {
  month: string;
  projected: number;
  actual?: number;
  conservative: number;
  aggressive: number;
}

export interface CompetitorData {
  name: string;
  adSpend: number;
  topChannels: string[];
  marketShare: number;
  trend: 'growing' | 'declining' | 'stable';
  threat: 'high' | 'medium' | 'low';
}

export interface ShopifyProduct {
  id: string;
  title: string;
  status: 'active' | 'draft' | 'archived';
  inventory: number;
  synced: boolean;
  lastSync: string;
  variants: number;
}

export interface LocalizationEntry {
  language: string;
  country: string;
  completeness: number;
  status: 'complete' | 'in_progress' | 'pending';
  lastUpdated: string;
}

export interface SecurityEvent {
  id: string;
  type: 'api_key_rotation' | 'access_violation' | 'threat_detected' | 'audit_log';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  timestamp: string;
  resolved: boolean;
}

export interface DataPipelineStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  throughput: number;
  errors: number;
  lastRun: string;
}

export interface KillSwitchState {
  global: boolean;
  campaigns: boolean;
  automation: boolean;
  apiKeys: boolean;
  countrySpecific: Record<string, boolean>;
}

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  badge?: number;
  children?: NavItem[];
}
