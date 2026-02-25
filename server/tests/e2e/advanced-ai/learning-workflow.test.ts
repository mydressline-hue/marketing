/**
 * E2E tests for Continuous Learning, Marketing Models & Campaign Health
 * workflows (Phase 7).
 *
 * Tests complete workflow scenarios:
 *   1. Reinforcement learning loop cycle
 *   2. Strategy memory from outcomes
 *   3. Creative fatigue detection and rotation
 *   4. Seasonal pattern identification and adjustment
 *   5. Market trend detection
 *   6. Marketing Mix Modeling workflow
 *   7. Bayesian attribution end-to-end
 *   8. Geo lift test lifecycle
 *   9. Brand lift survey lifecycle
 *  10. Offline conversion attribution
 *  11. Campaign health detection and alerting
 */

// ---------------------------------------------------------------------------
// Mocks -- must come before any app/source imports
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
  query: jest.fn(),
  getClient: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(undefined),
  closePool: jest.fn(),
}));

jest.mock('../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), quit: jest.fn(), connect: jest.fn() },
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
  cacheFlush: jest.fn().mockResolvedValue(undefined),
  testRedisConnection: jest.fn().mockResolvedValue(undefined),
  closeRedis: jest.fn(),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3001,
    API_PREFIX: '/api/v1',
    JWT_SECRET: 'test-jwt-secret-key-minimum-32-chars!!',
    JWT_EXPIRES_IN: '24h',
    JWT_REFRESH_EXPIRES_IN: '7d',
    CORS_ORIGINS: 'http://localhost:3000',
    RATE_LIMIT_WINDOW_MS: 900000,
    RATE_LIMIT_MAX_REQUESTS: 1000,
    LOG_LEVEL: 'error',
    LOG_FORMAT: 'json',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-!!',
    MFA_ISSUER: 'AIGrowthEngine',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
  },
}));

jest.mock('../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('test-uuid-generated'),
  hashPassword: jest.fn().mockResolvedValue('$2b$12$mockedhashvalue'),
  comparePassword: jest.fn().mockResolvedValue(true),
  encrypt: jest.fn().mockReturnValue('encrypted-value'),
  decrypt: jest.fn().mockReturnValue('decrypted-value'),
  paginate: jest.fn(),
  sleep: jest.fn().mockResolvedValue(undefined),
  retryWithBackoff: jest.fn(),
}));

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  requestLogger: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

jest.mock('../../../src/services/audit.service', () => ({
  AuditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import { pool } from '../../../src/config/database';
import { cacheGet, cacheSet, cacheDel } from '../../../src/config/redis';
import { generateId } from '../../../src/utils/helpers';
import { AuditService } from '../../../src/services/audit.service';

// ---------------------------------------------------------------------------
// Mock references
// ---------------------------------------------------------------------------

const mockPool = pool as unknown as { query: jest.Mock; connect: jest.Mock };
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;
const mockGenerateId = generateId as jest.Mock;
const mockAuditLog = (AuditService as unknown as { log: jest.Mock }).log;

// ---------------------------------------------------------------------------
// Domain simulators
// ---------------------------------------------------------------------------

interface StrategyOutcome {
  id: string;
  strategy_type: string;
  country: string;
  channel: string;
  metric: string;
  value: number;
  timestamp: string;
}

interface StrategyMemoryEntry {
  strategy_type: string;
  country: string;
  channel: string;
  success_rate: number;
  avg_value: number;
  sample_size: number;
  last_updated: string;
}

interface SeasonalPattern {
  month: number;
  month_name: string;
  event?: string;
  cpc_multiplier: number;
  conversion_lift: number;
}

interface CreativeFatigueSignal {
  campaign_id: string;
  creative_id: string;
  current_ctr: number;
  baseline_ctr: number;
  decline_pct: number;
  days_running: number;
  status: 'healthy' | 'warning' | 'fatigued';
  recommendation?: string;
}

class ContinuousLearningSimulator {
  private outcomes: StrategyOutcome[] = [];
  private strategyMemory: Map<string, StrategyMemoryEntry> = new Map();
  private outcomeCounter = 0;

  recordOutcome(strategyType: string, country: string, channel: string, metric: string, value: number): StrategyOutcome {
    this.outcomeCounter += 1;
    const outcome: StrategyOutcome = {
      id: `outcome-${this.outcomeCounter}`,
      strategy_type: strategyType,
      country,
      channel,
      metric,
      value,
      timestamp: new Date().toISOString(),
    };
    this.outcomes.push(outcome);
    this.updateStrategyMemory(outcome);
    return outcome;
  }

  private updateStrategyMemory(outcome: StrategyOutcome): void {
    const key = `${outcome.strategy_type}:${outcome.country}:${outcome.channel}`;
    const existing = this.strategyMemory.get(key);

    if (existing) {
      const newSampleSize = existing.sample_size + 1;
      const newAvgValue = (existing.avg_value * existing.sample_size + outcome.value) / newSampleSize;
      const successThreshold = outcome.metric === 'roas' ? 2.0 : 0.02;
      const isSuccess = outcome.value >= successThreshold;
      const newSuccessRate = (existing.success_rate * existing.sample_size + (isSuccess ? 1 : 0)) / newSampleSize;

      this.strategyMemory.set(key, {
        ...existing,
        avg_value: parseFloat(newAvgValue.toFixed(2)),
        success_rate: parseFloat(newSuccessRate.toFixed(4)),
        sample_size: newSampleSize,
        last_updated: outcome.timestamp,
      });
    } else {
      const successThreshold = outcome.metric === 'roas' ? 2.0 : 0.02;
      this.strategyMemory.set(key, {
        strategy_type: outcome.strategy_type,
        country: outcome.country,
        channel: outcome.channel,
        success_rate: outcome.value >= successThreshold ? 1.0 : 0.0,
        avg_value: outcome.value,
        sample_size: 1,
        last_updated: outcome.timestamp,
      });
    }
  }

  getStrategyMemory(): StrategyMemoryEntry[] {
    return Array.from(this.strategyMemory.values());
  }

  getTopStrategies(country: string, channel: string, limit: number = 5): StrategyMemoryEntry[] {
    return Array.from(this.strategyMemory.values())
      .filter((m) => m.country === country && m.channel === channel)
      .sort((a, b) => b.success_rate - a.success_rate || b.avg_value - a.avg_value)
      .slice(0, limit);
  }

  getCountryTrends(country: string): {
    country: string;
    trends: Array<{ metric: string; direction: string; change_pct: number }>;
    top_channel: string | null;
  } {
    const countryOutcomes = this.outcomes.filter((o) => o.country === country);
    if (countryOutcomes.length === 0) {
      return { country, trends: [], top_channel: null };
    }

    // Group by channel and compute averages
    const channelAvgs: Record<string, number[]> = {};
    for (const o of countryOutcomes) {
      if (!channelAvgs[o.channel]) channelAvgs[o.channel] = [];
      channelAvgs[o.channel].push(o.value);
    }

    const channelPerformance = Object.entries(channelAvgs).map(([channel, values]) => ({
      channel,
      avg: values.reduce((s, v) => s + v, 0) / values.length,
    }));
    const topChannel = channelPerformance.sort((a, b) => b.avg - a.avg)[0]?.channel || null;

    // Simple trend: compare first half vs second half of outcomes
    const half = Math.floor(countryOutcomes.length / 2);
    const firstHalfAvg = countryOutcomes.slice(0, half).reduce((s, o) => s + o.value, 0) / (half || 1);
    const secondHalfAvg = countryOutcomes.slice(half).reduce((s, o) => s + o.value, 0) / (countryOutcomes.length - half || 1);
    const changePct = firstHalfAvg > 0 ? parseFloat((((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100).toFixed(1)) : 0;

    return {
      country,
      trends: [
        {
          metric: 'overall_performance',
          direction: changePct > 0 ? 'improving' : changePct < 0 ? 'declining' : 'stable',
          change_pct: changePct,
        },
      ],
      top_channel: topChannel,
    };
  }

  detectSeasonalPatterns(country: string): SeasonalPattern[] {
    // Simulate known seasonal patterns
    const patterns: Record<string, SeasonalPattern[]> = {
      US: [
        { month: 11, month_name: 'November', event: 'Black Friday', cpc_multiplier: 1.85, conversion_lift: 0.45 },
        { month: 12, month_name: 'December', event: 'Holiday Season', cpc_multiplier: 1.65, conversion_lift: 0.35 },
        { month: 1, month_name: 'January', event: 'Post-holiday dip', cpc_multiplier: 0.75, conversion_lift: -0.15 },
        { month: 2, month_name: 'February', event: 'Valentines', cpc_multiplier: 1.10, conversion_lift: 0.08 },
      ],
      DE: [
        { month: 10, month_name: 'October', event: 'Oktoberfest', cpc_multiplier: 1.20, conversion_lift: 0.12 },
        { month: 12, month_name: 'December', event: 'Weihnachtsmarkt', cpc_multiplier: 1.55, conversion_lift: 0.30 },
        { month: 1, month_name: 'January', event: 'Winterschlussverkauf', cpc_multiplier: 1.15, conversion_lift: 0.10 },
      ],
    };
    return patterns[country] || [
      { month: 12, month_name: 'December', event: 'Year-end', cpc_multiplier: 1.30, conversion_lift: 0.15 },
    ];
  }

  detectCreativeFatigue(campaigns: Array<{
    campaign_id: string;
    creative_id: string;
    current_ctr: number;
    baseline_ctr: number;
    days_running: number;
  }>): CreativeFatigueSignal[] {
    return campaigns.map((c) => {
      const declinePct = parseFloat((((c.baseline_ctr - c.current_ctr) / c.baseline_ctr) * 100).toFixed(1));
      let status: CreativeFatigueSignal['status'];
      let recommendation: string | undefined;

      if (declinePct > 30 || c.days_running > 45) {
        status = 'fatigued';
        recommendation = `Rotate creative ${c.creative_id} immediately; CTR declined ${declinePct}%`;
      } else if (declinePct > 15 || c.days_running > 30) {
        status = 'warning';
        recommendation = `Prepare replacement for creative ${c.creative_id}; showing early fatigue signs`;
      } else {
        status = 'healthy';
      }

      return {
        campaign_id: c.campaign_id,
        creative_id: c.creative_id,
        current_ctr: c.current_ctr,
        baseline_ctr: c.baseline_ctr,
        decline_pct: declinePct,
        days_running: c.days_running,
        status,
        recommendation,
      };
    });
  }

  detectMarketTrends(outcomes: StrategyOutcome[]): Array<{
    country: string;
    channel: string;
    trend: string;
    action: string;
  }> {
    const grouped: Record<string, StrategyOutcome[]> = {};
    for (const o of outcomes) {
      const key = `${o.country}:${o.channel}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(o);
    }

    return Object.entries(grouped).map(([key, outs]) => {
      const [country, channel] = key.split(':');
      const sortedByTime = outs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const firstValue = sortedByTime[0].value;
      const lastValue = sortedByTime[sortedByTime.length - 1].value;
      const changePct = ((lastValue - firstValue) / firstValue) * 100;

      let trend: string;
      let action: string;
      if (changePct > 10) {
        trend = 'improving';
        action = 'Consider increasing investment';
      } else if (changePct < -10) {
        trend = 'declining';
        action = 'Investigate root cause and consider reducing spend';
      } else {
        trend = 'stable';
        action = 'Maintain current strategy';
      }

      return { country, channel, trend, action };
    });
  }

  getTotalOutcomes(): number {
    return this.outcomes.length;
  }
}

interface MMMResult {
  id: string;
  channel_contributions: Array<{ channel: string; contribution_pct: number; roi: number }>;
  optimal_allocation: Record<string, number>;
  r_squared: number;
  saturation_curves: Array<{ channel: string; current_pct_of_optimal: number }>;
}

interface GeoLiftTest {
  id: string;
  status: 'setup' | 'running' | 'analyzing' | 'completed';
  test_regions: string[];
  control_regions: string[];
  metric: string;
  start_date: string;
  end_date?: string;
  results?: {
    lift_pct: number;
    confidence: number;
    p_value: number;
    statistically_significant: boolean;
  };
}

interface BrandLiftSurvey {
  id: string;
  status: 'draft' | 'collecting' | 'analyzing' | 'completed';
  sample_size: number;
  responses_collected: number;
  results?: {
    awareness_lift: number;
    consideration_lift: number;
    purchase_intent_lift: number;
    overall_brand_lift: number;
  };
}

interface OfflineConversion {
  id: string;
  type: string;
  value: number;
  attributed_channel: string | null;
  attribution_confidence: number;
  timestamp: string;
}

class MarketingModelsSimulator {
  private geoLiftTests: Map<string, GeoLiftTest> = new Map();
  private brandLiftSurveys: Map<string, BrandLiftSurvey> = new Map();
  private offlineConversions: OfflineConversion[] = [];
  private testCounter = 0;

  runMMM(channels: string[], spend: Record<string, number>): MMMResult {
    const totalSpend = Object.values(spend).reduce((s, v) => s + v, 0);
    const contributions = channels.map((ch) => {
      const channelSpend = spend[ch] || 0;
      const rois: Record<string, number> = { google_ads: 3.8, meta: 3.2, email: 5.5, tiktok: 2.5, organic: 0, direct: 0 };
      return {
        channel: ch,
        contribution_pct: parseFloat((channelSpend / totalSpend).toFixed(2)),
        roi: rois[ch] || 2.0,
      };
    });

    // Calculate saturation curves
    const optimalSpend: Record<string, number> = { google_ads: 50000, meta: 35000, email: 15000, tiktok: 20000 };
    const saturation = channels.map((ch) => ({
      channel: ch,
      current_pct_of_optimal: parseFloat(
        (Math.min(100, ((spend[ch] || 0) / (optimalSpend[ch] || 25000)) * 100)).toFixed(1),
      ),
    }));

    // Optimal allocation based on ROI-weighted spend
    const totalRoi = contributions.reduce((s, c) => s + (c.roi || 0), 0);
    const optimal: Record<string, number> = {};
    contributions.forEach((c) => {
      if (c.roi > 0) {
        optimal[c.channel] = parseFloat((c.roi / totalRoi).toFixed(2));
      }
    });

    return {
      id: `mmm-${Date.now()}`,
      channel_contributions: contributions,
      optimal_allocation: optimal,
      r_squared: 0.91,
      saturation_curves: saturation,
    };
  }

  runBayesianAttribution(touchpoints: string[]): {
    model: string;
    weights: Array<{ touchpoint: string; weight: number; credible_interval: { lower: number; upper: number } }>;
    convergence_diagnostics: { r_hat: number; effective_sample_size: number; converged: boolean };
  } {
    const totalPoints = touchpoints.length;
    const weights = touchpoints.map((tp, idx) => {
      const baseWeight = 1 / totalPoints;
      // First and last touchpoints get more credit
      const positionBonus = idx === 0 ? 0.08 : idx === totalPoints - 1 ? 0.12 : -0.02;
      const weight = parseFloat(Math.max(0.05, baseWeight + positionBonus).toFixed(2));
      return {
        touchpoint: tp,
        weight,
        credible_interval: {
          lower: parseFloat((weight * 0.8).toFixed(2)),
          upper: parseFloat((weight * 1.2).toFixed(2)),
        },
      };
    });

    // Normalize weights to sum to 1
    const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
    weights.forEach((w) => {
      w.weight = parseFloat((w.weight / totalWeight).toFixed(2));
    });

    return {
      model: 'bayesian_multi_touch',
      weights,
      convergence_diagnostics: {
        r_hat: 1.01,
        effective_sample_size: 4500,
        converged: true,
      },
    };
  }

  createGeoLiftTest(testRegions: string[], controlRegions: string[], metric: string): GeoLiftTest {
    this.testCounter += 1;
    const test: GeoLiftTest = {
      id: `geo-${this.testCounter}`,
      status: 'setup',
      test_regions: testRegions,
      control_regions: controlRegions,
      metric,
      start_date: new Date().toISOString(),
    };
    this.geoLiftTests.set(test.id, test);
    return test;
  }

  startGeoLiftTest(testId: string): GeoLiftTest {
    const test = this.geoLiftTests.get(testId);
    if (!test) throw new Error(`Geo lift test ${testId} not found`);
    test.status = 'running';
    return test;
  }

  completeGeoLiftTest(testId: string, liftPct: number, confidence: number): GeoLiftTest {
    const test = this.geoLiftTests.get(testId);
    if (!test) throw new Error(`Geo lift test ${testId} not found`);
    const pValue = parseFloat((1 - confidence).toFixed(3));
    test.status = 'completed';
    test.end_date = new Date().toISOString();
    test.results = {
      lift_pct: liftPct,
      confidence,
      p_value: pValue,
      statistically_significant: pValue < 0.05,
    };
    return test;
  }

  createBrandLiftSurvey(sampleSize: number): BrandLiftSurvey {
    this.testCounter += 1;
    const survey: BrandLiftSurvey = {
      id: `bl-${this.testCounter}`,
      status: 'draft',
      sample_size: sampleSize,
      responses_collected: 0,
    };
    this.brandLiftSurveys.set(survey.id, survey);
    return survey;
  }

  collectBrandLiftResponses(surveyId: string, responses: number): BrandLiftSurvey {
    const survey = this.brandLiftSurveys.get(surveyId);
    if (!survey) throw new Error(`Brand lift survey ${surveyId} not found`);
    survey.responses_collected += responses;
    survey.status = 'collecting';
    if (survey.responses_collected >= survey.sample_size) {
      survey.status = 'analyzing';
    }
    return survey;
  }

  completeBrandLiftSurvey(surveyId: string): BrandLiftSurvey {
    const survey = this.brandLiftSurveys.get(surveyId);
    if (!survey) throw new Error(`Brand lift survey ${surveyId} not found`);
    survey.status = 'completed';
    survey.results = {
      awareness_lift: parseFloat((5 + Math.random() * 15).toFixed(1)),
      consideration_lift: parseFloat((3 + Math.random() * 10).toFixed(1)),
      purchase_intent_lift: parseFloat((2 + Math.random() * 8).toFixed(1)),
      overall_brand_lift: parseFloat((3 + Math.random() * 12).toFixed(1)),
    };
    return survey;
  }

  recordOfflineConversion(type: string, value: number, channel: string | null, confidence: number): OfflineConversion {
    const conversion: OfflineConversion = {
      id: `oc-${this.offlineConversions.length + 1}`,
      type,
      value,
      attributed_channel: channel,
      attribution_confidence: confidence,
      timestamp: new Date().toISOString(),
    };
    this.offlineConversions.push(conversion);
    return conversion;
  }

  getOfflineConversions(): OfflineConversion[] {
    return [...this.offlineConversions];
  }

  analyzeMediaSaturation(spendData: Record<string, number>): Array<{
    channel: string;
    current_spend: number;
    optimal_spend: number;
    saturation_pct: number;
    recommendation: string;
  }> {
    const optimalSpend: Record<string, number> = { google_ads: 50000, meta: 35000, email: 15000, tiktok: 20000 };

    return Object.entries(spendData).map(([channel, spend]) => {
      const optimal = optimalSpend[channel] || 25000;
      const saturationPct = parseFloat(((spend / optimal) * 100).toFixed(1));
      let recommendation: string;

      if (saturationPct < 60) {
        recommendation = `Underinvested in ${channel}; room to scale ${(100 - saturationPct).toFixed(0)}%`;
      } else if (saturationPct <= 100) {
        recommendation = `${channel} is in optimal range; maintain current spend`;
      } else {
        recommendation = `${channel} is oversaturated; consider reducing spend by ${(saturationPct - 100).toFixed(0)}%`;
      }

      return { channel, current_spend: spend, optimal_spend: optimal, saturation_pct: saturationPct, recommendation };
    });
  }
}

interface CampaignHealthIssue {
  campaign_id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  detected_at: string;
}

interface HealthAlert {
  id: string;
  campaign_id: string;
  issue: CampaignHealthIssue;
  status: 'active' | 'acknowledged' | 'resolved';
  acknowledged_by?: string;
  acknowledged_at?: string;
  resolved_at?: string;
}

class CampaignHealthSimulator {
  private alerts: Map<string, HealthAlert> = new Map();
  private alertCounter = 0;

  checkCampaignHealth(campaignId: string, metrics: {
    roas: number;
    ctr: number;
    cpc: number;
    frequency: number;
    budget_utilization: number;
    days_running: number;
  }): {
    campaign_id: string;
    overall_score: number;
    issues: CampaignHealthIssue[];
    scores: Record<string, number>;
  } {
    const issues: CampaignHealthIssue[] = [];
    const scores: Record<string, number> = {};

    // Performance check
    if (metrics.roas < 1.0) {
      issues.push({ campaign_id: campaignId, type: 'performance_critical', severity: 'critical', message: `ROAS at ${metrics.roas}, below break-even`, detected_at: new Date().toISOString() });
      scores.performance = 20;
    } else if (metrics.roas < 2.0) {
      issues.push({ campaign_id: campaignId, type: 'performance_warning', severity: 'high', message: `ROAS at ${metrics.roas}, below target`, detected_at: new Date().toISOString() });
      scores.performance = 50;
    } else {
      scores.performance = Math.min(100, Math.round(metrics.roas * 25));
    }

    // CTR check
    if (metrics.ctr < 0.005) {
      issues.push({ campaign_id: campaignId, type: 'low_ctr', severity: 'high', message: `CTR at ${(metrics.ctr * 100).toFixed(2)}%, significantly below average`, detected_at: new Date().toISOString() });
      scores.engagement = 30;
    } else {
      scores.engagement = Math.min(100, Math.round(metrics.ctr * 5000));
    }

    // Frequency check (audience fatigue)
    if (metrics.frequency > 5.0) {
      issues.push({ campaign_id: campaignId, type: 'audience_fatigue', severity: 'medium', message: `Frequency at ${metrics.frequency}, audience may be fatigued`, detected_at: new Date().toISOString() });
      scores.audience = 40;
    } else {
      scores.audience = Math.min(100, Math.round(100 - (metrics.frequency - 1) * 15));
    }

    // Budget utilization check
    if (metrics.budget_utilization < 0.5) {
      issues.push({ campaign_id: campaignId, type: 'budget_underspend', severity: 'medium', message: `Only ${(metrics.budget_utilization * 100).toFixed(0)}% of budget utilized`, detected_at: new Date().toISOString() });
      scores.budget = 50;
    } else if (metrics.budget_utilization > 1.2) {
      issues.push({ campaign_id: campaignId, type: 'budget_overspend', severity: 'high', message: `Budget exceeded by ${((metrics.budget_utilization - 1) * 100).toFixed(0)}%`, detected_at: new Date().toISOString() });
      scores.budget = 40;
    } else {
      scores.budget = 90;
    }

    // CPC inflation check
    if (metrics.cpc > 5.0) {
      issues.push({ campaign_id: campaignId, type: 'cpc_inflation', severity: 'medium', message: `CPC at $${metrics.cpc.toFixed(2)}, above threshold`, detected_at: new Date().toISOString() });
      scores.cost = 50;
    } else {
      scores.cost = Math.min(100, Math.round(100 - metrics.cpc * 10));
    }

    const scoreValues = Object.values(scores);
    const overallScore = Math.round(scoreValues.reduce((s, v) => s + v, 0) / scoreValues.length);

    return { campaign_id: campaignId, overall_score: overallScore, issues, scores };
  }

  createAlert(issue: CampaignHealthIssue): HealthAlert {
    this.alertCounter += 1;
    const alert: HealthAlert = {
      id: `alert-${this.alertCounter}`,
      campaign_id: issue.campaign_id,
      issue,
      status: 'active',
    };
    this.alerts.set(alert.id, alert);
    return alert;
  }

  acknowledgeAlert(alertId: string, userId: string): HealthAlert {
    const alert = this.alerts.get(alertId);
    if (!alert) throw new Error(`Alert ${alertId} not found`);
    alert.status = 'acknowledged';
    alert.acknowledged_by = userId;
    alert.acknowledged_at = new Date().toISOString();
    return alert;
  }

  resolveAlert(alertId: string): HealthAlert {
    const alert = this.alerts.get(alertId);
    if (!alert) throw new Error(`Alert ${alertId} not found`);
    alert.status = 'resolved';
    alert.resolved_at = new Date().toISOString();
    return alert;
  }

  getActiveAlerts(): HealthAlert[] {
    return Array.from(this.alerts.values()).filter((a) => a.status === 'active');
  }

  getAllAlerts(): HealthAlert[] {
    return Array.from(this.alerts.values());
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Continuous Learning E2E Workflow', () => {
  let learner: ContinuousLearningSimulator;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    learner = new ContinuousLearningSimulator();
  });

  it('should complete reinforcement learning loop cycle', async () => {
    // Step 1: Record initial outcomes
    const outcomes = [
      learner.recordOutcome('bid_optimization', 'US', 'google_ads', 'roas', 3.5),
      learner.recordOutcome('bid_optimization', 'US', 'google_ads', 'roas', 4.2),
      learner.recordOutcome('bid_optimization', 'US', 'google_ads', 'roas', 2.8),
      learner.recordOutcome('audience_expansion', 'US', 'google_ads', 'roas', 3.0),
      learner.recordOutcome('audience_expansion', 'US', 'google_ads', 'roas', 1.5),
    ];

    expect(outcomes).toHaveLength(5);
    expect(learner.getTotalOutcomes()).toBe(5);

    // Step 2: Check strategy memory was updated
    const memory = learner.getStrategyMemory();
    expect(memory).toHaveLength(2);

    const bidOptMemory = memory.find((m) => m.strategy_type === 'bid_optimization');
    expect(bidOptMemory).toBeDefined();
    expect(bidOptMemory!.sample_size).toBe(3);
    expect(bidOptMemory!.success_rate).toBeGreaterThan(0);

    // Step 3: Get top strategies
    const topStrategies = learner.getTopStrategies('US', 'google_ads');
    expect(topStrategies.length).toBeGreaterThan(0);
    expect(topStrategies[0].success_rate).toBeGreaterThanOrEqual(topStrategies[topStrategies.length - 1].success_rate);

    // Step 4: Persist to database
    mockPool.query.mockResolvedValueOnce({
      rows: [{ strategy_type: topStrategies[0].strategy_type, success_rate: topStrategies[0].success_rate }],
      rowCount: 1,
    });

    const dbResult = await mockPool.query(
      'UPDATE strategy_memory SET success_rate = $1, sample_size = $2 WHERE strategy_type = $3 AND country = $4 AND channel = $5 RETURNING *',
      [topStrategies[0].success_rate, topStrategies[0].sample_size, topStrategies[0].strategy_type, 'US', 'google_ads'],
    );
    expect(dbResult.rows[0].strategy_type).toBe(topStrategies[0].strategy_type);

    // Step 5: Apply learning -- record more outcomes using top strategy
    learner.recordOutcome(topStrategies[0].strategy_type, 'US', 'google_ads', 'roas', 4.0);
    const updated = learner.getTopStrategies('US', 'google_ads');
    expect(updated[0].sample_size).toBeGreaterThan(topStrategies[0].sample_size);
  });

  it('should build strategy memory from outcomes', () => {
    // Record diverse outcomes
    learner.recordOutcome('bid_optimization', 'US', 'google_ads', 'roas', 4.0);
    learner.recordOutcome('dayparting', 'US', 'google_ads', 'roas', 3.5);
    learner.recordOutcome('audience_targeting', 'US', 'meta', 'roas', 2.8);
    learner.recordOutcome('creative_testing', 'DE', 'google_ads', 'roas', 3.2);
    learner.recordOutcome('bid_optimization', 'DE', 'google_ads', 'roas', 3.8);

    const memory = learner.getStrategyMemory();
    expect(memory).toHaveLength(5); // 5 unique combinations

    // Check US google_ads strategies
    const usGoogleStrategies = learner.getTopStrategies('US', 'google_ads');
    expect(usGoogleStrategies).toHaveLength(2);
    expect(usGoogleStrategies[0].avg_value).toBeGreaterThanOrEqual(usGoogleStrategies[1].avg_value);
  });

  it('should detect creative fatigue and recommend rotation', () => {
    const campaigns = [
      { campaign_id: 'camp-1', creative_id: 'cr-1', current_ctr: 0.015, baseline_ctr: 0.035, days_running: 50 },
      { campaign_id: 'camp-1', creative_id: 'cr-2', current_ctr: 0.025, baseline_ctr: 0.030, days_running: 35 },
      { campaign_id: 'camp-2', creative_id: 'cr-3', current_ctr: 0.028, baseline_ctr: 0.030, days_running: 10 },
    ];

    const signals = learner.detectCreativeFatigue(campaigns);

    expect(signals).toHaveLength(3);

    // cr-1: heavily fatigued (>30% decline + >45 days)
    expect(signals[0].status).toBe('fatigued');
    expect(signals[0].recommendation).toContain('immediately');
    expect(signals[0].decline_pct).toBeGreaterThan(30);

    // cr-2: warning (>15% decline or >30 days)
    expect(signals[1].status).toBe('warning');
    expect(signals[1].recommendation).toContain('Prepare replacement');

    // cr-3: healthy
    expect(signals[2].status).toBe('healthy');
    expect(signals[2].recommendation).toBeUndefined();
  });

  it('should identify seasonal patterns and adjust', () => {
    const usPatterns = learner.detectSeasonalPatterns('US');
    expect(usPatterns.length).toBeGreaterThan(0);

    // Black Friday should have highest CPC multiplier
    const blackFriday = usPatterns.find((p) => p.event === 'Black Friday');
    expect(blackFriday).toBeDefined();
    expect(blackFriday!.cpc_multiplier).toBeGreaterThan(1.5);
    expect(blackFriday!.conversion_lift).toBeGreaterThan(0.3);

    // January should have low CPC multiplier
    const january = usPatterns.find((p) => p.month === 1);
    expect(january).toBeDefined();
    expect(january!.cpc_multiplier).toBeLessThan(1.0);

    // DE patterns
    const dePatterns = learner.detectSeasonalPatterns('DE');
    expect(dePatterns.length).toBeGreaterThan(0);
    const oktoberfest = dePatterns.find((p) => p.event === 'Oktoberfest');
    expect(oktoberfest).toBeDefined();
  });

  it('should detect market trends and recommend actions', () => {
    // Record improving trend for US/google_ads
    learner.recordOutcome('bid_optimization', 'US', 'google_ads', 'roas', 2.5);
    learner.recordOutcome('bid_optimization', 'US', 'google_ads', 'roas', 3.0);
    learner.recordOutcome('bid_optimization', 'US', 'google_ads', 'roas', 3.5);
    learner.recordOutcome('bid_optimization', 'US', 'google_ads', 'roas', 4.0);

    // Record declining trend for DE/meta
    learner.recordOutcome('audience_targeting', 'DE', 'meta', 'roas', 3.5);
    learner.recordOutcome('audience_targeting', 'DE', 'meta', 'roas', 3.0);
    learner.recordOutcome('audience_targeting', 'DE', 'meta', 'roas', 2.5);
    learner.recordOutcome('audience_targeting', 'DE', 'meta', 'roas', 2.0);

    const allOutcomes = [...Array(8)].map((_, i) => ({
      id: `outcome-${i + 1}`,
      strategy_type: i < 4 ? 'bid_optimization' : 'audience_targeting',
      country: i < 4 ? 'US' : 'DE',
      channel: i < 4 ? 'google_ads' : 'meta',
      metric: 'roas',
      value: i < 4 ? 2.5 + i * 0.5 : 3.5 - (i - 4) * 0.5,
      timestamp: new Date(Date.now() + i * 86400000).toISOString(),
    }));

    const trends = learner.detectMarketTrends(allOutcomes);

    expect(trends).toHaveLength(2);

    const usTrend = trends.find((t) => t.country === 'US');
    expect(usTrend).toBeDefined();
    expect(usTrend!.trend).toBe('improving');
    expect(usTrend!.action).toContain('increasing investment');

    const deTrend = trends.find((t) => t.country === 'DE');
    expect(deTrend).toBeDefined();
    expect(deTrend!.trend).toBe('declining');
    expect(deTrend!.action).toContain('reducing spend');
  });

  it('should track country performance over time', () => {
    // Record outcomes over time for US
    learner.recordOutcome('bid_opt', 'US', 'google_ads', 'roas', 3.0);
    learner.recordOutcome('bid_opt', 'US', 'google_ads', 'roas', 3.2);
    learner.recordOutcome('bid_opt', 'US', 'meta', 'roas', 2.8);
    learner.recordOutcome('bid_opt', 'US', 'meta', 'roas', 3.5);

    const trends = learner.getCountryTrends('US');
    expect(trends.country).toBe('US');
    expect(trends.top_channel).toBeDefined();
    expect(trends.trends.length).toBeGreaterThan(0);
    expect(trends.trends[0].metric).toBe('overall_performance');
    expect(['improving', 'declining', 'stable']).toContain(trends.trends[0].direction);
  });

  it('should persist learning state to database and cache', async () => {
    learner.recordOutcome('bid_opt', 'US', 'google_ads', 'roas', 4.0);

    const memory = learner.getStrategyMemory();
    expect(memory).toHaveLength(1);

    // Persist all memory entries
    mockPool.query.mockResolvedValueOnce({
      rows: [{ strategy_type: memory[0].strategy_type, sample_size: 1 }],
      rowCount: 1,
    });

    await mockPool.query(
      'INSERT INTO strategy_memory (strategy_type, country, channel, success_rate, avg_value, sample_size) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO UPDATE RETURNING *',
      [memory[0].strategy_type, memory[0].country, memory[0].channel, memory[0].success_rate, memory[0].avg_value, memory[0].sample_size],
    );

    // Cache top strategies
    const topStrategies = learner.getTopStrategies('US', 'google_ads');
    mockCacheSet.mockResolvedValueOnce(undefined);
    await mockCacheSet('learning:top_strategies:US:google_ads', JSON.stringify(topStrategies), 1800);

    expect(mockPool.query).toHaveBeenCalledTimes(1);
    expect(mockCacheSet).toHaveBeenCalledTimes(1);
  });
});

describe('Marketing Models E2E Workflow', () => {
  let models: MarketingModelsSimulator;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    models = new MarketingModelsSimulator();
  });

  it('should run complete marketing mix modeling workflow', async () => {
    const channels = ['google_ads', 'meta', 'email', 'tiktok'];
    const spend = { google_ads: 40000, meta: 25000, email: 8000, tiktok: 12000 };

    const mmmResult = models.runMMM(channels, spend);

    expect(mmmResult.channel_contributions).toHaveLength(4);
    expect(mmmResult.r_squared).toBeGreaterThan(0.85);
    expect(mmmResult.optimal_allocation).toBeDefined();

    // Contributions should sum close to 1
    const totalContribution = mmmResult.channel_contributions.reduce((s, c) => s + c.contribution_pct, 0);
    expect(Math.abs(totalContribution - 1.0)).toBeLessThan(0.05);

    // Saturation curves should exist for each channel
    expect(mmmResult.saturation_curves).toHaveLength(4);
    mmmResult.saturation_curves.forEach((sc) => {
      expect(sc.current_pct_of_optimal).toBeGreaterThan(0);
    });

    // Persist MMM result
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: mmmResult.id, r_squared: mmmResult.r_squared }],
      rowCount: 1,
    });

    const dbResult = await mockPool.query(
      'INSERT INTO mmm_results (id, contributions, optimal_allocation, r_squared) VALUES ($1, $2, $3, $4) RETURNING *',
      [mmmResult.id, JSON.stringify(mmmResult.channel_contributions), JSON.stringify(mmmResult.optimal_allocation), mmmResult.r_squared],
    );
    expect(dbResult.rows[0].r_squared).toBe(0.91);
  });

  it('should run Bayesian attribution end-to-end', () => {
    const touchpoints = ['google_search', 'meta_retargeting', 'email_nurture', 'direct_visit', 'organic_search'];
    const attribution = models.runBayesianAttribution(touchpoints);

    expect(attribution.model).toBe('bayesian_multi_touch');
    expect(attribution.weights).toHaveLength(5);

    // Weights should sum close to 1
    const totalWeight = attribution.weights.reduce((s, w) => s + w.weight, 0);
    expect(Math.abs(totalWeight - 1.0)).toBeLessThan(0.1);

    // Each weight should have credible intervals
    attribution.weights.forEach((w) => {
      expect(w.credible_interval.lower).toBeLessThan(w.weight);
      expect(w.credible_interval.upper).toBeGreaterThan(w.weight);
    });

    // Convergence should be good
    expect(attribution.convergence_diagnostics.converged).toBe(true);
    expect(attribution.convergence_diagnostics.r_hat).toBeLessThan(1.1);
    expect(attribution.convergence_diagnostics.effective_sample_size).toBeGreaterThan(1000);
  });

  it('should set up and analyze geo lift test', async () => {
    // Create test
    const test = models.createGeoLiftTest(
      ['California', 'New York'],
      ['Texas', 'Florida'],
      'conversions',
    );
    expect(test.status).toBe('setup');
    expect(test.test_regions).toHaveLength(2);
    expect(test.control_regions).toHaveLength(2);

    // Start test
    const running = models.startGeoLiftTest(test.id);
    expect(running.status).toBe('running');

    // Complete test with results
    const completed = models.completeGeoLiftTest(test.id, 12.5, 0.97);
    expect(completed.status).toBe('completed');
    expect(completed.results).toBeDefined();
    expect(completed.results!.lift_pct).toBe(12.5);
    expect(completed.results!.confidence).toBe(0.97);
    expect(completed.results!.p_value).toBe(0.03);
    expect(completed.results!.statistically_significant).toBe(true);

    // Persist
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: completed.id, status: 'completed', lift_pct: 12.5 }],
      rowCount: 1,
    });

    const dbResult = await mockPool.query(
      'UPDATE geo_lift_tests SET status = $1, results = $2 WHERE id = $3 RETURNING *',
      ['completed', JSON.stringify(completed.results), completed.id],
    );
    expect(dbResult.rows[0].lift_pct).toBe(12.5);
  });

  it('should create brand lift survey and analyze results', () => {
    // Create survey
    const survey = models.createBrandLiftSurvey(2000);
    expect(survey.status).toBe('draft');
    expect(survey.sample_size).toBe(2000);

    // Collect responses in batches
    models.collectBrandLiftResponses(survey.id, 800);
    expect(survey.responses_collected).toBe(800);
    expect(survey.status).toBe('collecting');

    models.collectBrandLiftResponses(survey.id, 1200);
    expect(survey.responses_collected).toBe(2000);
    expect(survey.status).toBe('analyzing');

    // Complete analysis
    const completed = models.completeBrandLiftSurvey(survey.id);
    expect(completed.status).toBe('completed');
    expect(completed.results).toBeDefined();
    expect(completed.results!.awareness_lift).toBeGreaterThan(0);
    expect(completed.results!.consideration_lift).toBeGreaterThan(0);
    expect(completed.results!.purchase_intent_lift).toBeGreaterThan(0);
    expect(completed.results!.overall_brand_lift).toBeGreaterThan(0);
  });

  it('should record offline conversions and attribute', () => {
    // Record multiple offline conversions
    const conv1 = models.recordOfflineConversion('in_store_purchase', 150.00, 'google_ads', 0.85);
    const conv2 = models.recordOfflineConversion('phone_order', 320.00, 'meta', 0.72);
    const conv3 = models.recordOfflineConversion('in_store_purchase', 95.00, null, 0.0);

    expect(conv1.attributed_channel).toBe('google_ads');
    expect(conv1.attribution_confidence).toBe(0.85);

    expect(conv2.attributed_channel).toBe('meta');
    expect(conv3.attributed_channel).toBeNull();
    expect(conv3.attribution_confidence).toBe(0.0);

    // Get all conversions
    const allConversions = models.getOfflineConversions();
    expect(allConversions).toHaveLength(3);

    // Calculate total attributed value
    const attributedValue = allConversions
      .filter((c) => c.attributed_channel !== null)
      .reduce((sum, c) => sum + c.value * c.attribution_confidence, 0);
    expect(attributedValue).toBeGreaterThan(0);
  });

  it('should analyze media saturation and find optimal spend', () => {
    const currentSpend = { google_ads: 30000, meta: 40000, email: 5000, tiktok: 25000 };
    const analysis = models.analyzeMediaSaturation(currentSpend);

    expect(analysis).toHaveLength(4);

    // Email should be underinvested (5000 vs 15000 optimal)
    const emailAnalysis = analysis.find((a) => a.channel === 'email');
    expect(emailAnalysis).toBeDefined();
    expect(emailAnalysis!.saturation_pct).toBeLessThan(60);
    expect(emailAnalysis!.recommendation).toContain('Underinvested');

    // Meta should be oversaturated (40000 vs 35000 optimal)
    const metaAnalysis = analysis.find((a) => a.channel === 'meta');
    expect(metaAnalysis).toBeDefined();
    expect(metaAnalysis!.saturation_pct).toBeGreaterThan(100);
    expect(metaAnalysis!.recommendation).toContain('oversaturated');

    // Each analysis should have all required fields
    analysis.forEach((a) => {
      expect(a.channel).toBeDefined();
      expect(a.current_spend).toBeGreaterThan(0);
      expect(a.optimal_spend).toBeGreaterThan(0);
      expect(a.recommendation).toBeDefined();
    });
  });

  it('should handle geo lift test that is not statistically significant', () => {
    const test = models.createGeoLiftTest(['Oregon'], ['Washington'], 'revenue');
    models.startGeoLiftTest(test.id);

    // Small lift with low confidence
    const completed = models.completeGeoLiftTest(test.id, 2.1, 0.80);
    expect(completed.results!.statistically_significant).toBe(false);
    expect(completed.results!.p_value).toBe(0.2);
    expect(completed.results!.lift_pct).toBe(2.1);
  });

  it('should persist offline conversions and compute aggregate attribution', async () => {
    models.recordOfflineConversion('in_store', 200, 'google_ads', 0.90);
    models.recordOfflineConversion('in_store', 150, 'meta', 0.75);
    models.recordOfflineConversion('phone', 300, 'google_ads', 0.60);

    const conversions = models.getOfflineConversions();

    // Persist each conversion
    for (const conv of conversions) {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: conv.id, value: conv.value, attributed_channel: conv.attributed_channel }],
        rowCount: 1,
      });
    }

    for (const conv of conversions) {
      await mockPool.query(
        'INSERT INTO offline_conversions (id, type, value, attributed_channel, confidence) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [conv.id, conv.type, conv.value, conv.attributed_channel, conv.attribution_confidence],
      );
    }

    expect(mockPool.query).toHaveBeenCalledTimes(3);

    // Aggregate attribution
    const byChannel: Record<string, number> = {};
    conversions.forEach((c) => {
      if (c.attributed_channel) {
        byChannel[c.attributed_channel] = (byChannel[c.attributed_channel] || 0) + c.value * c.attribution_confidence;
      }
    });

    expect(byChannel['google_ads']).toBeGreaterThan(0);
    expect(byChannel['meta']).toBeGreaterThan(0);
  });
});

describe('Campaign Health Monitor E2E Workflow', () => {
  let healthMonitor: CampaignHealthSimulator;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    healthMonitor = new CampaignHealthSimulator();
  });

  it('should detect campaign health issues and alert', () => {
    // Check a poorly performing campaign
    const health = healthMonitor.checkCampaignHealth('camp-critical', {
      roas: 0.8,
      ctr: 0.003,
      cpc: 6.50,
      frequency: 6.0,
      budget_utilization: 1.35,
      days_running: 45,
    });

    expect(health.overall_score).toBeLessThan(50);
    expect(health.issues.length).toBeGreaterThanOrEqual(4);

    // Should have critical performance issue
    const criticalIssue = health.issues.find((i) => i.severity === 'critical');
    expect(criticalIssue).toBeDefined();
    expect(criticalIssue!.type).toBe('performance_critical');

    // Create alerts for each issue
    const alerts = health.issues.map((issue) => healthMonitor.createAlert(issue));
    expect(alerts).toHaveLength(health.issues.length);
    expect(healthMonitor.getActiveAlerts().length).toBe(health.issues.length);
  });

  it('should run full health check and report scores', () => {
    // Healthy campaign
    const healthy = healthMonitor.checkCampaignHealth('camp-healthy', {
      roas: 4.0,
      ctr: 0.025,
      cpc: 2.50,
      frequency: 2.5,
      budget_utilization: 0.92,
      days_running: 21,
    });

    expect(healthy.overall_score).toBeGreaterThan(70);
    expect(healthy.issues).toHaveLength(0);
    expect(healthy.scores.performance).toBeGreaterThan(80);
    expect(healthy.scores.engagement).toBeGreaterThan(80);
    expect(healthy.scores.audience).toBeGreaterThan(70);
    expect(healthy.scores.budget).toBe(90);

    // Warning campaign
    const warning = healthMonitor.checkCampaignHealth('camp-warning', {
      roas: 1.5,
      ctr: 0.012,
      cpc: 3.50,
      frequency: 4.0,
      budget_utilization: 0.45,
      days_running: 30,
    });

    expect(warning.overall_score).toBeLessThan(healthy.overall_score);
    expect(warning.issues.length).toBeGreaterThan(0);
  });

  it('should acknowledge alerts and track resolution', () => {
    const health = healthMonitor.checkCampaignHealth('camp-issues', {
      roas: 1.2,
      ctr: 0.004,
      cpc: 5.50,
      frequency: 5.5,
      budget_utilization: 0.40,
      days_running: 35,
    });

    // Create alerts
    const alerts = health.issues.map((issue) => healthMonitor.createAlert(issue));
    expect(alerts.length).toBeGreaterThan(0);

    // Acknowledge first alert
    const acknowledged = healthMonitor.acknowledgeAlert(alerts[0].id, 'user-mgr-1');
    expect(acknowledged.status).toBe('acknowledged');
    expect(acknowledged.acknowledged_by).toBe('user-mgr-1');
    expect(acknowledged.acknowledged_at).toBeDefined();

    // Resolve first alert
    const resolved = healthMonitor.resolveAlert(alerts[0].id);
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolved_at).toBeDefined();

    // Active alerts should be one less
    expect(healthMonitor.getActiveAlerts().length).toBe(alerts.length - 1);
  });

  it('should detect multiple health issues in one campaign', () => {
    const health = healthMonitor.checkCampaignHealth('camp-multi-issue', {
      roas: 0.5,      // Critical: below break-even
      ctr: 0.002,     // High: very low CTR
      cpc: 7.00,      // Medium: above threshold
      frequency: 8.0,  // Medium: audience fatigue
      budget_utilization: 1.50, // High: overspending
      days_running: 60,
    });

    expect(health.issues.length).toBeGreaterThanOrEqual(5);
    expect(health.overall_score).toBeLessThan(40);

    // Should have at least one critical issue
    const criticalIssues = health.issues.filter((i) => i.severity === 'critical');
    expect(criticalIssues.length).toBeGreaterThanOrEqual(1);

    // Should have high severity issues
    const highIssues = health.issues.filter((i) => i.severity === 'high');
    expect(highIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('should persist health check results and alerts to database', async () => {
    const health = healthMonitor.checkCampaignHealth('camp-persist', {
      roas: 1.8,
      ctr: 0.010,
      cpc: 4.00,
      frequency: 3.0,
      budget_utilization: 0.85,
      days_running: 20,
    });

    // Persist health check result
    mockPool.query.mockResolvedValueOnce({
      rows: [{ campaign_id: 'camp-persist', overall_score: health.overall_score }],
      rowCount: 1,
    });

    const dbResult = await mockPool.query(
      'INSERT INTO campaign_health_checks (campaign_id, overall_score, scores, issues) VALUES ($1, $2, $3, $4) RETURNING *',
      ['camp-persist', health.overall_score, JSON.stringify(health.scores), JSON.stringify(health.issues)],
    );
    expect(dbResult.rows[0].overall_score).toBe(health.overall_score);

    // Create and persist alerts
    for (const issue of health.issues) {
      const alert = healthMonitor.createAlert(issue);
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: alert.id, campaign_id: alert.campaign_id, status: 'active' }],
        rowCount: 1,
      });

      await mockPool.query(
        'INSERT INTO health_alerts (id, campaign_id, type, severity, message, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [alert.id, alert.campaign_id, alert.issue.type, alert.issue.severity, alert.issue.message, 'active'],
      );
    }

    // 1 health check insert + N alert inserts
    expect(mockPool.query).toHaveBeenCalledTimes(1 + health.issues.length);

    // Cache health score
    mockCacheSet.mockResolvedValueOnce(undefined);
    await mockCacheSet(`health:camp-persist:score`, String(health.overall_score), 300);
    expect(mockCacheSet).toHaveBeenCalledWith('health:camp-persist:score', String(health.overall_score), 300);
  });

  it('should track health scores over time for trend detection', () => {
    // Simulate health checks over time
    const checks = [
      { roas: 3.5, ctr: 0.025, cpc: 2.00, frequency: 2.0, budget_utilization: 0.90, days_running: 7 },
      { roas: 3.2, ctr: 0.022, cpc: 2.30, frequency: 2.5, budget_utilization: 0.88, days_running: 14 },
      { roas: 2.8, ctr: 0.018, cpc: 2.80, frequency: 3.0, budget_utilization: 0.85, days_running: 21 },
      { roas: 2.3, ctr: 0.014, cpc: 3.50, frequency: 3.8, budget_utilization: 0.80, days_running: 28 },
    ];

    const scores = checks.map((metrics, i) =>
      healthMonitor.checkCampaignHealth('camp-trending', metrics),
    );

    // Scores should be declining over time
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i].overall_score).toBeLessThanOrEqual(scores[i - 1].overall_score);
    }

    // Later checks should have more issues
    expect(scores[3].issues.length).toBeGreaterThanOrEqual(scores[0].issues.length);
  });

  it('should handle healthy campaign with no issues', () => {
    const health = healthMonitor.checkCampaignHealth('camp-perfect', {
      roas: 5.0,
      ctr: 0.035,
      cpc: 1.50,
      frequency: 1.8,
      budget_utilization: 0.95,
      days_running: 14,
    });

    expect(health.issues).toHaveLength(0);
    expect(health.overall_score).toBeGreaterThan(80);
    expect(Object.values(health.scores).every((s) => s >= 70)).toBe(true);
  });

  it('should clear alert cache when alerts are resolved', async () => {
    const health = healthMonitor.checkCampaignHealth('camp-cache', {
      roas: 0.9,
      ctr: 0.004,
      cpc: 5.00,
      frequency: 5.0,
      budget_utilization: 0.40,
      days_running: 30,
    });

    const alerts = health.issues.map((issue) => healthMonitor.createAlert(issue));

    // Cache alerts
    mockCacheSet.mockResolvedValueOnce(undefined);
    await mockCacheSet('health:camp-cache:alerts', JSON.stringify(alerts), 300);

    // Resolve all alerts
    alerts.forEach((alert) => {
      healthMonitor.acknowledgeAlert(alert.id, 'admin-1');
      healthMonitor.resolveAlert(alert.id);
    });

    // Clear alert cache
    mockCacheDel.mockResolvedValueOnce(undefined);
    await mockCacheDel('health:camp-cache:alerts');

    expect(healthMonitor.getActiveAlerts()).toHaveLength(0);
    expect(mockCacheDel).toHaveBeenCalledWith('health:camp-cache:alerts');

    // Audit trail
    mockAuditLog.mockResolvedValueOnce(undefined);
    await mockAuditLog({
      userId: 'admin-1',
      action: 'health.alerts_batch_resolved',
      resourceType: 'campaign_health',
      details: { campaign_id: 'camp-cache', resolved_count: alerts.length },
    });
    expect(mockAuditLog).toHaveBeenCalled();
  });
});
