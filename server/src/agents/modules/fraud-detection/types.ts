// ============================================================
// Fraud Detection Agent - Type Definitions
// ============================================================

/**
 * A single fraud indicator contributing to the overall fraud score.
 * Each signal captures a metric, its observed value, the expected threshold,
 * and whether it is considered suspicious.
 */
export interface FraudSignal {
  /** Type of fraud signal (e.g. 'high_ctr', 'geo_concentration', 'rapid_clicks') */
  type: string;
  /** Observed value for this signal */
  value: number;
  /** Threshold above which the signal is deemed suspicious */
  threshold: number;
  /** Whether this signal exceeded its threshold */
  suspicious: boolean;
  /** Human-readable description of the signal */
  description: string;
}

/**
 * Result of click fraud detection analysis for a campaign.
 */
export interface FraudDetectionResult {
  /** The campaign analyzed */
  campaignId: string;
  /** Composite fraud score (0-100) */
  fraudScore: number;
  /** Individual fraud signals detected */
  signals: FraudSignal[];
  /** Actionable recommendation based on the fraud score */
  recommendation: string;
  /** Whether the campaign was auto-blocked due to high fraud score */
  blocked: boolean;
}

/**
 * Result of bot traffic detection analysis.
 */
export interface BotDetectionResult {
  /** The campaign analyzed */
  campaignId: string;
  /** Estimated percentage of traffic attributed to bots (0-100) */
  botPercentage: number;
  /** Behavioral indicators suggesting bot activity */
  indicators: string[];
  /** Confidence in the bot detection result (0-100) */
  confidence: number;
}

/**
 * Result of conversion anomaly detection.
 */
export interface AnomalyDetectionResult {
  /** The campaign analyzed */
  campaignId: string;
  /** Detected anomalies in conversion metrics */
  anomalies: Anomaly[];
  /** Overall severity of detected anomalies */
  severity: string;
}

/**
 * A single detected anomaly in a metric.
 */
export interface Anomaly {
  /** The metric that deviated (e.g. 'conversion_rate', 'cpa') */
  metric: string;
  /** Expected value based on historical patterns */
  expected: number;
  /** Actual observed value */
  actual: number;
  /** Standard deviations from expected (z-score) */
  deviation: number;
  /** ISO-8601 timestamp of the anomaly */
  timestamp: string;
}

/**
 * Result of budget misuse detection for an allocation.
 */
export interface BudgetMisuseResult {
  /** The budget allocation analyzed */
  allocationId: string;
  /** Specific misuse issues identified */
  issues: string[];
  /** Severity classification */
  severity: string;
  /** Supporting evidence for the findings */
  evidence: Record<string, unknown>;
}

/**
 * Traffic pattern breakdown for a campaign.
 */
export interface TrafficPattern {
  /** Total traffic volume */
  total: number;
  /** Organic traffic count */
  organic: number;
  /** Paid traffic count */
  paid: number;
  /** Suspicious traffic count */
  suspicious: number;
  /** Traffic distribution by hour of day (0-23) */
  byHour: Record<number, number>;
  /** Traffic distribution by geographic region */
  byGeo: Record<string, number>;
}

/**
 * Result of evaluating a single anomaly rule against data.
 */
export interface RuleEvaluation {
  /** ID of the rule evaluated */
  ruleId: string;
  /** Whether the rule's condition was triggered */
  triggered: boolean;
  /** The observed value for the rule's metric */
  value: number;
  /** The rule's threshold */
  threshold: number;
}
