// ============================================================
// Performance Analytics Agent - Type Definitions
// All interfaces and internal types used by the agent module.
// ============================================================

import type { FunnelStage, DateRange, AttributionModel } from '../../../types';

// ---- Public Types ----

export interface MetricResult {
  /** The computed metric value */
  value: number;
  /** The metric value for the previous comparable period */
  previousValue: number;
  /** Percentage change from the previous period */
  changePercent: number;
  /** Trend direction derived from changePercent */
  trend: 'up' | 'down' | 'stable';
  /** Human-readable period label (e.g. '2026-01-01 to 2026-01-31') */
  period: string;
  /** Confidence score (0-1) indicating data reliability */
  confidence: number;
}

export interface FunnelStageData {
  stage: FunnelStage;
  visitors: number;
  conversions: number;
  conversionRate: number;
  dropOffRate: number;
  avgTimeInStage: number;
}

export interface FunnelAnalysis {
  stages: FunnelStageData[];
  overallConversionRate: number;
  totalDropOff: number;
  recommendations: string[];
}

export interface DropOffPoint {
  fromStage: FunnelStage;
  toStage: FunnelStage;
  dropOffRate: number;
  estimatedRevenueLoss: number;
  recommendations: string[];
}

export interface ChannelAttribution {
  channel: string;
  attributedConversions: number;
  attributedRevenue: number;
  percentOfTotal: number;
  roi: number;
}

export interface AttributionResult {
  model: AttributionModel;
  channels: ChannelAttribution[];
  period: DateRange;
  totalConversions: number;
  totalRevenue: number;
}

export interface AttributionComparison {
  models: Record<string, AttributionResult>;
  recommendations: string[];
  bestModelForGoal: Record<string, AttributionModel>;
}

// ---- Internal types for database rows ----

export interface ConversionTouchpoint {
  conversion_id: string;
  channel: string;
  touchpoint_time: string;
  revenue: number;
  position: number;
  total_touchpoints: number;
}

export interface FunnelRow {
  stage: FunnelStage;
  visitors: number;
  conversions: number;
  avg_time_seconds: number;
}

// ---- Attribution variance helper type ----

export interface AttributionVariance {
  highVariance: boolean;
  channelVariances: Record<string, number>;
}
