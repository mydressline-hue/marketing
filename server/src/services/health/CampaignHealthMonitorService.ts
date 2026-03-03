/**
 * Campaign Health AI Monitor Service (Phase 7E).
 *
 * Provides comprehensive campaign health monitoring with five core detection
 * capabilities: CPA volatility, spend velocity anomalies, creative fatigue,
 * CTR collapse early warning, and pixel signal loss alerting.
 */

import { pool } from '../../config/database';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { AuditService } from '../audit.service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'campaign_health';
const CACHE_TTL_HEALTH = 120;
const CACHE_TTL_DASHBOARD = 120;
const CACHE_TTL_CONFIG = 300;
const HEALTH_WEIGHTS = { cpa: 0.25, spend: 0.20, creative: 0.20, ctr: 0.20, pixel: 0.15 };

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface CampaignHealthScore {
  campaign_id: string;
  campaign_name: string;
  overall_health: number;
  health_grade: 'A' | 'B' | 'C' | 'D' | 'F';
  cpa_health: MetricHealth;
  spend_health: MetricHealth;
  creative_health: MetricHealth;
  ctr_health: MetricHealth;
  pixel_health: MetricHealth;
  alerts: HealthAlert[];
  recommendations: string[];
  last_checked: string;
}

export interface MetricHealth {
  score: number;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  current_value: number;
  baseline_value: number;
  deviation_pct: number;
  trend: 'improving' | 'stable' | 'declining';
  details: string;
}

export interface HealthAlert {
  id: string;
  campaign_id: string;
  alert_type: HealthAlertType;
  severity: 'info' | 'warning' | 'critical' | 'emergency';
  title: string;
  description: string;
  metric_name: string;
  current_value: number;
  threshold_value: number;
  recommended_action: string;
  auto_action_taken: string | null;
  acknowledged: boolean;
  acknowledged_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

export type HealthAlertType = 'cpa_volatility' | 'spend_anomaly' | 'creative_fatigue' | 'ctr_collapse' | 'pixel_loss';

export interface CPAVolatilityReport {
  campaign_id: string;
  current_cpa: number;
  average_cpa_7d: number;
  average_cpa_30d: number;
  std_deviation: number;
  coefficient_of_variation: number;
  volatility_score: number;
  is_volatile: boolean;
  trend: 'increasing' | 'stable' | 'decreasing';
  daily_cpa_history: { date: string; cpa: number }[];
  anomalous_days: { date: string; cpa: number; z_score: number }[];
  recommendations: string[];
}

export interface SpendVelocityReport {
  campaign_id: string;
  current_daily_spend: number;
  average_daily_spend_7d: number;
  average_daily_spend_30d: number;
  velocity_ratio: number;
  burn_rate: number;
  projected_budget_exhaustion_date: string | null;
  is_anomalous: boolean;
  anomaly_type: 'overspend' | 'underspend' | 'spike' | 'drop' | 'normal';
  hourly_spend_pattern: { hour: number; spend: number; expected: number }[];
  recommendations: string[];
}

export interface CreativeFatigueReport {
  campaign_id: string;
  creatives: CreativeFatigueItem[];
  overall_fatigue_score: number;
  rotation_urgency: 'none' | 'low' | 'medium' | 'high' | 'critical';
  estimated_performance_loss_pct: number;
  recommendations: string[];
}

export interface CreativeFatigueItem {
  creative_id: string;
  creative_name: string;
  days_active: number;
  impressions: number;
  frequency: number;
  fatigue_score: number;
  ctr_trend: number[];
  conversion_trend: number[];
  peak_ctr: number;
  current_ctr: number;
  decline_from_peak_pct: number;
  status: 'fresh' | 'performing' | 'aging' | 'fatigued' | 'exhausted';
}

export interface CTRCollapseWarning {
  campaign_id: string;
  current_ctr: number;
  baseline_ctr: number;
  decline_rate_per_day: number;
  days_of_decline: number;
  projected_ctr_7d: number;
  collapse_probability: number;
  severity: 'none' | 'watch' | 'warning' | 'imminent';
  contributing_factors: string[];
  recommendations: string[];
}

export interface PixelHealthReport {
  campaign_id: string;
  pixel_id: string;
  status: 'active' | 'degraded' | 'failing' | 'dead';
  last_fire_timestamp: string | null;
  fires_last_hour: number;
  fires_last_24h: number;
  expected_fires_24h: number;
  signal_loss_pct: number;
  error_rate: number;
  latency_ms: number;
  events_tracked: { event_type: string; count: number; last_seen: string }[];
  issues: { issue: string; severity: string; recommendation: string }[];
}

export interface HealthDashboard {
  total_campaigns: number;
  healthy_campaigns: number;
  warning_campaigns: number;
  critical_campaigns: number;
  average_health_score: number;
  active_alerts: number;
  unacknowledged_alerts: number;
  top_issues: { type: HealthAlertType; count: number }[];
  worst_performing: CampaignHealthScore[];
  recent_alerts: HealthAlert[];
}

export interface HealthConfig {
  cpa_volatility_threshold: number;
  spend_velocity_threshold: number;
  creative_fatigue_threshold: number;
  ctr_decline_threshold: number;
  pixel_signal_loss_threshold: number;
  check_interval_minutes: number;
  auto_pause_on_critical: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function grade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function status(score: number): MetricHealth['status'] {
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'warning';
  if (score >= 0) return 'critical';
  return 'unknown';
}

function trend(values: number[]): MetricHealth['trend'] {
  if (values.length < 2) return 'stable';
  const recent = values.slice(-3);
  const earlier = values.slice(0, Math.max(1, values.length - 3));
  const rAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const eAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
  const pct = eAvg !== 0 ? ((rAvg - eAvg) / eAvg) * 100 : 0;
  return pct > 5 ? 'improving' : pct < -5 ? 'declining' : 'stable';
}

function linReg(vals: number[]): { slope: number; intercept: number } {
  const n = vals.length;
  if (n < 2) return { slope: 0, intercept: vals[0] || 0 };
  let sX = 0, sY = 0, sXY = 0, sXX = 0;
  for (let i = 0; i < n; i++) { sX += i; sY += vals[i]; sXY += i * vals[i]; sXX += i * i; }
  const d = n * sXX - sX * sX;
  if (d === 0) return { slope: 0, intercept: sY / n };
  const slope = (n * sXY - sX * sY) / d;
  return { slope, intercept: (sY - slope * sX) / n };
}

function mapAlert(row: Record<string, unknown>): HealthAlert {
  return {
    id: row.id as string, campaign_id: row.campaign_id as string,
    alert_type: row.alert_type as HealthAlertType,
    severity: row.severity as HealthAlert['severity'],
    title: row.title as string, description: row.description as string,
    metric_name: row.metric_name as string,
    current_value: Number(row.current_value), threshold_value: Number(row.threshold_value),
    recommended_action: row.recommended_action as string,
    auto_action_taken: (row.auto_action_taken as string) || null,
    acknowledged: row.acknowledged as boolean,
    acknowledged_by: (row.acknowledged_by as string) || null,
    created_at: row.created_at as string, resolved_at: (row.resolved_at as string) || null,
  };
}

function clamp(v: number, lo = 0, hi = 100): number { return Math.max(lo, Math.min(hi, v)); }
function r2(v: number): number { return Number(v.toFixed(2)); }

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CampaignHealthMonitorService {

  /** Full health check for a single campaign. Cached 2 min. */
  static async checkCampaignHealth(campaignId: string): Promise<CampaignHealthScore> {
    const ck = `${CACHE_PREFIX}:score:${campaignId}`;
    const cached = await cacheGet<CampaignHealthScore>(ck);
    if (cached) return cached;

    const cRes = await pool.query(`SELECT id, name FROM campaigns WHERE id = $1`, [campaignId]);
    if (cRes.rows.length === 0) throw new NotFoundError(`Campaign not found: ${campaignId}`);
    const campaign = cRes.rows[0];

    const [cpaR, spendR, creativeR, ctrR, pixelR] = await Promise.all([
      CampaignHealthMonitorService.detectCPAVolatility(campaignId),
      CampaignHealthMonitorService.detectSpendVelocityAnomaly(campaignId),
      CampaignHealthMonitorService.scoreCreativeFatigue(campaignId),
      CampaignHealthMonitorService.detectCTRCollapse(campaignId),
      CampaignHealthMonitorService.checkPixelHealth(campaignId),
    ]);

    const ch = CampaignHealthMonitorService.buildCPAHealth(cpaR);
    const sh = CampaignHealthMonitorService.buildSpendHealth(spendR);
    const crh = CampaignHealthMonitorService.buildCreativeHealth(creativeR);
    const ctrh = CampaignHealthMonitorService.buildCTRHealth(ctrR);
    const ph = CampaignHealthMonitorService.buildPixelHealth(pixelR);

    const overall = Math.round(
      ch.score * HEALTH_WEIGHTS.cpa + sh.score * HEALTH_WEIGHTS.spend +
      crh.score * HEALTH_WEIGHTS.creative + ctrh.score * HEALTH_WEIGHTS.ctr +
      ph.score * HEALTH_WEIGHTS.pixel,
    );

    const aRes = await pool.query(
      `SELECT id, campaign_id, alert_type, severity, title, description, metric_name, current_value, threshold_value, recommended_action, auto_action_taken, acknowledged, acknowledged_by, created_at, resolved_at FROM campaign_health_alerts WHERE campaign_id = $1 AND resolved_at IS NULL ORDER BY created_at DESC`,
      [campaignId],
    );

    const recs = [...cpaR.recommendations, ...spendR.recommendations,
      ...creativeR.recommendations, ...ctrR.recommendations].slice(0, 10);

    const result: CampaignHealthScore = {
      campaign_id: campaignId, campaign_name: campaign.name as string,
      overall_health: overall, health_grade: grade(overall),
      cpa_health: ch, spend_health: sh, creative_health: crh, ctr_health: ctrh, pixel_health: ph,
      alerts: aRes.rows.map(mapAlert), recommendations: recs,
      last_checked: new Date().toISOString(),
    };

    await pool.query(
      `INSERT INTO campaign_health_history (id, campaign_id, health_score, grade, checked_at) VALUES ($1, $2, $3, $4, NOW())`,
      [generateId(), campaignId, overall, result.health_grade],
    );
    await cacheSet(ck, result, CACHE_TTL_HEALTH);
    logger.info('Campaign health check completed', { campaignId, overall, grade: result.health_grade });
    return result;
  }

  /** Health check for all active campaigns, sorted worst-first. */
  static async checkAllCampaignsHealth(): Promise<CampaignHealthScore[]> {
    const res = await pool.query(`SELECT id FROM campaigns WHERE status = 'active' ORDER BY name`);
    const scores: CampaignHealthScore[] = [];
    for (const row of res.rows) {
      try { scores.push(await CampaignHealthMonitorService.checkCampaignHealth(row.id as string)); }
      catch (e) { logger.error('Health check failed', { campaignId: row.id, error: e instanceof Error ? e.message : String(e) }); }
    }
    return scores.sort((a, b) => a.overall_health - b.overall_health);
  }

  /** CPA volatility analysis using coefficient of variation and z-scores. */
  static async detectCPAVolatility(campaignId: string): Promise<CPAVolatilityReport> {
    const res = await pool.query(
      `SELECT DATE(created_at) AS date,
         CASE WHEN SUM(conversions) > 0 THEN SUM(spend)/SUM(conversions) ELSE 0 END AS cpa
       FROM campaign_daily_metrics WHERE campaign_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at) ORDER BY date`, [campaignId]);

    const history = res.rows.map(r => ({ date: r.date as string, cpa: Number(r.cpa) }));
    const vals = history.map(d => d.cpa).filter(v => v > 0);
    const n = vals.length;
    const mean = n > 0 ? vals.reduce((a, b) => a + b, 0) / n : 0;
    const variance = n > 1 ? vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 0;
    const last7 = vals.slice(-7);
    const avg7d = last7.length > 0 ? last7.reduce((a, b) => a + b, 0) / last7.length : 0;
    const currentCpa = vals.length > 0 ? vals[vals.length - 1] : 0;

    const anomalous: CPAVolatilityReport['anomalous_days'] = [];
    if (stdDev > 0) {
      for (const d of history) {
        if (d.cpa <= 0) continue;
        const z = (d.cpa - mean) / stdDev;
        if (Math.abs(z) > 2) anomalous.push({ date: d.date, cpa: d.cpa, z_score: r2(z) });
      }
    }

    const volScore = clamp(Math.round(100 * (1 - Math.min(cv, 1))));
    const cfg = await CampaignHealthMonitorService.getHealthConfig();
    const isVolatile = cv > cfg.cpa_volatility_threshold;

    let cpaTrend: CPAVolatilityReport['trend'] = 'stable';
    if (last7.length >= 3) {
      const { slope } = linReg(last7);
      if (slope > 0.05 * mean) cpaTrend = 'increasing';
      else if (slope < -0.05 * mean) cpaTrend = 'decreasing';
    }

    const recs: string[] = [];
    if (isVolatile) recs.push('CPA is highly volatile. Review audience targeting and bid strategy.');
    if (cpaTrend === 'increasing') recs.push('CPA trending upward. Refresh creatives or narrow audiences.');
    if (anomalous.length > 3) recs.push('Multiple anomalous CPA days. Investigate external factors.');

    if (isVolatile) {
      await CampaignHealthMonitorService.createAlertIfNotExists(campaignId, 'cpa_volatility',
        cv > cfg.cpa_volatility_threshold * 2 ? 'critical' : 'warning',
        'CPA Volatility Detected', `CPA CV is ${(cv * 100).toFixed(1)}%, exceeding threshold.`,
        'cpa', cv, cfg.cpa_volatility_threshold, recs[0] || 'Review CPA stability.');
    }

    return {
      campaign_id: campaignId, current_cpa: r2(currentCpa), average_cpa_7d: r2(avg7d),
      average_cpa_30d: r2(mean), std_deviation: r2(stdDev), coefficient_of_variation: Number(cv.toFixed(4)),
      volatility_score: volScore, is_volatile: isVolatile, trend: cpaTrend,
      daily_cpa_history: history, anomalous_days: anomalous, recommendations: recs,
    };
  }

  /** Spend velocity analysis comparing current rate vs rolling averages. */
  static async detectSpendVelocityAnomaly(campaignId: string): Promise<SpendVelocityReport> {
    const res = await pool.query(
      `SELECT DATE(created_at) AS date, SUM(spend) AS daily_spend
       FROM campaign_daily_metrics WHERE campaign_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at) ORDER BY date`, [campaignId]);

    const spends = res.rows.map(r => Number(r.daily_spend));
    const current = spends.length > 0 ? spends[spends.length - 1] : 0;
    const last7 = spends.slice(-7);
    const avg7d = last7.length > 0 ? last7.reduce((a, b) => a + b, 0) / last7.length : 0;
    const avg30d = spends.length > 0 ? spends.reduce((a, b) => a + b, 0) / spends.length : 0;
    const velRatio = avg7d > 0 ? current / avg7d : 0;

    const budgetRes = await pool.query(`SELECT budget, total_spent FROM campaigns WHERE id = $1`, [campaignId]);
    const budget = budgetRes.rows.length > 0 ? Number(budgetRes.rows[0].budget) : 0;
    const totalSpent = budgetRes.rows.length > 0 ? Number(budgetRes.rows[0].total_spent) : 0;
    const remaining = Math.max(0, budget - totalSpent);
    const burnRate = budget > 0 ? totalSpent / budget : 0;

    let exhaustionDate: string | null = null;
    if (current > 0 && remaining > 0) {
      const d = new Date(); d.setDate(d.getDate() + Math.ceil(remaining / current));
      exhaustionDate = d.toISOString().split('T')[0];
    }

    const cfg = await CampaignHealthMonitorService.getHealthConfig();
    let anomalyType: SpendVelocityReport['anomaly_type'] = 'normal';
    let isAnomalous = false;
    if (avg7d > 0 && Math.abs(velRatio - 1) > cfg.spend_velocity_threshold) {
      isAnomalous = true;
      if (velRatio > 1 + cfg.spend_velocity_threshold) anomalyType = velRatio > 2 ? 'spike' : 'overspend';
      else anomalyType = velRatio < 0.3 ? 'drop' : 'underspend';
    }

    const hourlyRes = await pool.query(
      `SELECT EXTRACT(HOUR FROM created_at)::int AS hour, SUM(spend) AS spend
       FROM campaign_hourly_metrics WHERE campaign_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'
       GROUP BY EXTRACT(HOUR FROM created_at) ORDER BY hour`, [campaignId]);
    const expectedRes = await pool.query(
      `SELECT EXTRACT(HOUR FROM created_at)::int AS hour, AVG(spend) AS exp
       FROM campaign_hourly_metrics WHERE campaign_id = $1 AND created_at >= NOW() - INTERVAL '7 days'
         AND created_at < NOW() - INTERVAL '24 hours'
       GROUP BY EXTRACT(HOUR FROM created_at) ORDER BY hour`, [campaignId]);

    const expMap: Record<number, number> = {};
    for (const r of expectedRes.rows) expMap[Number(r.hour)] = Number(r.exp);
    const hourly = hourlyRes.rows.map(r => ({
      hour: Number(r.hour), spend: r2(Number(r.spend)), expected: r2(expMap[Number(r.hour)] || 0),
    }));

    const recs: string[] = [];
    if (anomalyType === 'overspend' || anomalyType === 'spike') {
      recs.push('Spend significantly above average. Verify bid caps and daily budgets.');
      if (exhaustionDate) recs.push(`Budget will exhaust by ${exhaustionDate}. Adjust pacing.`);
    }
    if (anomalyType === 'underspend' || anomalyType === 'drop')
      recs.push('Spend below expected. Check delivery issues or audience exhaustion.');
    if (burnRate > 0.9) recs.push('Budget nearly exhausted. Allocate more funds or pause.');

    if (isAnomalous) {
      await CampaignHealthMonitorService.createAlertIfNotExists(campaignId, 'spend_anomaly',
        anomalyType === 'spike' || anomalyType === 'drop' ? 'critical' : 'warning',
        `Spend Anomaly: ${anomalyType}`,
        `Daily spend ($${current.toFixed(2)}) deviates from 7d avg ($${avg7d.toFixed(2)}).`,
        'spend', velRatio, cfg.spend_velocity_threshold, recs[0] || 'Review spend pacing.');
    }

    return {
      campaign_id: campaignId, current_daily_spend: r2(current), average_daily_spend_7d: r2(avg7d),
      average_daily_spend_30d: r2(avg30d), velocity_ratio: Number(velRatio.toFixed(4)),
      burn_rate: Number(burnRate.toFixed(4)), projected_budget_exhaustion_date: exhaustionDate,
      is_anomalous: isAnomalous, anomaly_type: anomalyType, hourly_spend_pattern: hourly,
      recommendations: recs,
    };
  }

  /** Creative fatigue scoring using exponential decay model. */
  static async scoreCreativeFatigue(campaignId: string): Promise<CreativeFatigueReport> {
    const res = await pool.query(
      `SELECT c.id AS cid, c.name AS cname, EXTRACT(DAY FROM NOW()-c.created_at)::int AS days,
         COALESCE(SUM(m.impressions),0) AS impr,
         CASE WHEN COALESCE(SUM(m.impressions),0)>0
           THEN SUM(m.impressions)::float/NULLIF(COUNT(DISTINCT m.user_reach),0) ELSE 0 END AS freq,
         CASE WHEN COALESCE(SUM(m.impressions),0)>0
           THEN SUM(m.clicks)::float/SUM(m.impressions)*100 ELSE 0 END AS ctr,
         MAX(CASE WHEN m.impressions>0 THEN m.clicks::float/m.impressions*100 ELSE 0 END) AS peak
       FROM creatives c LEFT JOIN creative_daily_metrics m ON m.creative_id=c.id
         AND m.created_at >= NOW()-INTERVAL '30 days'
       WHERE c.campaign_id=$1 GROUP BY c.id,c.name,c.created_at`, [campaignId]);

    const cfg = await CampaignHealthMonitorService.getHealthConfig();
    const creatives: CreativeFatigueItem[] = [];
    let totalFatigue = 0, totalLoss = 0;

    for (const row of res.rows) {
      const cid = row.cid as string;
      const days = Number(row.days), freq = Number(row.freq) || 1;
      const curCtr = Number(row.ctr), peakCtr = Number(row.peak);

      const tRes = await pool.query(
        `SELECT DATE(created_at) AS d,
           CASE WHEN SUM(impressions)>0 THEN SUM(clicks)::float/SUM(impressions)*100 ELSE 0 END AS ctr,
           CASE WHEN SUM(clicks)>0 THEN SUM(conversions)::float/SUM(clicks)*100 ELSE 0 END AS cvr
         FROM creative_daily_metrics WHERE creative_id=$1 AND created_at>=NOW()-INTERVAL '14 days'
         GROUP BY DATE(created_at) ORDER BY d`, [cid]);

      const ctrT = tRes.rows.map(r => r2(Number(r.ctr)));
      const cvT = tRes.rows.map(r => r2(Number(r.cvr)));
      const fatigue = r2((1 - Math.exp(-0.03 * freq * Math.sqrt(Math.max(days, 1)))) * 100);
      const decline = peakCtr > 0 ? ((peakCtr - curCtr) / peakCtr) * 100 : 0;

      let st: CreativeFatigueItem['status'] = 'fresh';
      if (fatigue >= 80) st = 'exhausted'; else if (fatigue >= 60) st = 'fatigued';
      else if (fatigue >= 40) st = 'aging'; else if (days >= 3) st = 'performing';

      totalFatigue += fatigue; if (decline > 0) totalLoss += decline;
      creatives.push({
        creative_id: cid, creative_name: row.cname as string, days_active: days,
        impressions: Number(row.impr), frequency: r2(freq), fatigue_score: fatigue,
        ctr_trend: ctrT, conversion_trend: cvT, peak_ctr: r2(peakCtr), current_ctr: r2(curCtr),
        decline_from_peak_pct: r2(decline), status: st,
      });
    }

    const overallFatigue = creatives.length > 0 ? r2(totalFatigue / creatives.length) : 0;
    const estLoss = creatives.length > 0 ? r2(totalLoss / creatives.length) : 0;
    const fatiguedR = creatives.filter(c => c.fatigue_score >= 60).length / (creatives.length || 1);
    let urgency: CreativeFatigueReport['rotation_urgency'] = 'none';
    if (fatiguedR >= 0.8) urgency = 'critical'; else if (fatiguedR >= 0.6) urgency = 'high';
    else if (fatiguedR >= 0.4) urgency = 'medium'; else if (fatiguedR >= 0.2) urgency = 'low';

    const recs: string[] = [];
    const exhausted = creatives.filter(c => c.status === 'exhausted');
    const fatigued = creatives.filter(c => c.status === 'fatigued');
    if (exhausted.length > 0) recs.push(`${exhausted.length} creative(s) exhausted. Replace immediately.`);
    if (fatigued.length > 0) recs.push(`${fatigued.length} creative(s) fatigued. Prepare replacements within 48h.`);
    if (overallFatigue > cfg.creative_fatigue_threshold * 100)
      recs.push('Overall fatigue exceeds threshold. Consider full creative refresh.');
    if (creatives.length < 3) recs.push('Low creative diversity. Add more variants.');

    if (overallFatigue > cfg.creative_fatigue_threshold * 100) {
      await CampaignHealthMonitorService.createAlertIfNotExists(campaignId, 'creative_fatigue',
        urgency === 'critical' ? 'critical' : 'warning', 'Creative Fatigue Alert',
        `Fatigue score: ${overallFatigue}%. ${exhausted.length} exhausted, ${fatigued.length} fatigued.`,
        'creative_fatigue', overallFatigue, cfg.creative_fatigue_threshold * 100,
        recs[0] || 'Refresh creatives.');
    }

    return { campaign_id: campaignId, creatives, overall_fatigue_score: overallFatigue,
      rotation_urgency: urgency, estimated_performance_loss_pct: estLoss, recommendations: recs };
  }

  /** CTR collapse early warning using linear regression projection. */
  static async detectCTRCollapse(campaignId: string): Promise<CTRCollapseWarning> {
    const res = await pool.query(
      `SELECT DATE(created_at) AS date,
         CASE WHEN SUM(impressions)>0 THEN SUM(clicks)::float/SUM(impressions)*100 ELSE 0 END AS ctr
       FROM campaign_daily_metrics WHERE campaign_id=$1 AND created_at>=NOW()-INTERVAL '14 days'
       GROUP BY DATE(created_at) ORDER BY date`, [campaignId]);

    const vals = res.rows.map(r => Number(r.ctr));
    const cur = vals.length > 0 ? vals[vals.length - 1] : 0;
    const baseVals = vals.slice(0, 7);
    const baseline = baseVals.length > 0 ? baseVals.reduce((a, b) => a + b, 0) / baseVals.length : 0;
    const { slope } = linReg(vals);
    const declineRate = slope < 0 ? Math.abs(slope) : 0;

    let daysDecline = 0;
    for (let i = vals.length - 1; i > 0; i--) { if (vals[i] < vals[i - 1]) daysDecline++; else break; }

    const projected7d = Math.max(0, cur - declineRate * 7);
    const declinePct = baseline > 0 ? ((baseline - cur) / baseline) * 100 : 0;
    const prob = r2(clamp((Math.min(daysDecline / 7, 1) * 0.5 + Math.min(declinePct / 50, 1) * 0.5) * 100));

    const cfg = await CampaignHealthMonitorService.getHealthConfig();
    let sev: CTRCollapseWarning['severity'] = 'none';
    if (prob >= 80) sev = 'imminent'; else if (prob >= 50) sev = 'warning'; else if (prob >= 25) sev = 'watch';

    const factors: string[] = [];
    if (daysDecline >= 5) factors.push(`${daysDecline} consecutive days of decline`);
    if (declinePct > cfg.ctr_decline_threshold * 100) factors.push(`CTR declined ${r2(declinePct)}% from baseline`);
    if (declineRate > 0.1) factors.push(`Declining at ${declineRate.toFixed(3)}%/day`);
    if (projected7d < baseline * 0.5) factors.push('Projected 7d CTR below 50% of baseline');

    const recs: string[] = [];
    if (sev === 'imminent') {
      recs.push('CTR collapse imminent. Refresh creatives and reassess targeting immediately.');
      recs.push('Consider pausing underperforming ad sets.');
    } else if (sev === 'warning') recs.push('CTR declining significantly. Introduce new creatives.');
    else if (sev === 'watch') recs.push('CTR showing early decline. Monitor and prepare alternatives.');

    if (sev === 'warning' || sev === 'imminent') {
      await CampaignHealthMonitorService.createAlertIfNotExists(campaignId, 'ctr_collapse',
        sev === 'imminent' ? 'critical' : 'warning', 'CTR Collapse Warning',
        `CTR declined ${r2(declinePct)}% from baseline. Collapse probability: ${prob}%.`,
        'ctr', cur, baseline * (1 - cfg.ctr_decline_threshold),
        recs[0] || 'Review CTR performance.');
    }

    return { campaign_id: campaignId, current_ctr: Number(cur.toFixed(4)),
      baseline_ctr: Number(baseline.toFixed(4)), decline_rate_per_day: Number(declineRate.toFixed(4)),
      days_of_decline: daysDecline, projected_ctr_7d: Number(projected7d.toFixed(4)),
      collapse_probability: prob, severity: sev, contributing_factors: factors, recommendations: recs };
  }

  /** Pixel/conversion tracking health check. */
  static async checkPixelHealth(campaignId: string): Promise<PixelHealthReport> {
    const pRes = await pool.query(
      `SELECT id, pixel_id, last_fire_at FROM campaign_pixels WHERE campaign_id=$1 LIMIT 1`, [campaignId]);
    const pixelId = pRes.rows.length > 0 ? pRes.rows[0].pixel_id as string : 'unknown';
    const lastFire = pRes.rows.length > 0 ? (pRes.rows[0].last_fire_at as string) || null : null;

    const fRes = await pool.query(
      `SELECT SUM(CASE WHEN created_at>=NOW()-INTERVAL '1 hour' THEN fire_count ELSE 0 END) AS f1h,
         SUM(CASE WHEN created_at>=NOW()-INTERVAL '24 hours' THEN fire_count ELSE 0 END) AS f24h,
         SUM(CASE WHEN created_at>=NOW()-INTERVAL '24 hours' THEN error_count ELSE 0 END) AS err,
         AVG(CASE WHEN created_at>=NOW()-INTERVAL '24 hours' THEN latency_ms ELSE NULL END) AS lat
       FROM pixel_events WHERE pixel_id=$1`, [pixelId]);

    const f1h = Number(fRes.rows[0]?.f1h) || 0;
    const f24h = Number(fRes.rows[0]?.f24h) || 0;
    const err = Number(fRes.rows[0]?.err) || 0;
    const lat = Number(fRes.rows[0]?.lat) || 0;

    const expRes = await pool.query(
      `SELECT AVG(df) AS expected FROM (
         SELECT DATE(created_at) AS d, SUM(fire_count) AS df FROM pixel_events
         WHERE pixel_id=$1 AND created_at>=NOW()-INTERVAL '7 days' AND created_at<NOW()-INTERVAL '1 day'
         GROUP BY DATE(created_at)) daily`, [pixelId]);
    const expected = Number(expRes.rows[0]?.expected) || 0;

    const sigLoss = expected > 0 ? Math.max(0, ((expected - f24h) / expected) * 100) : 0;
    const errRate = f24h > 0 ? (err / f24h) * 100 : 0;

    const cfg = await CampaignHealthMonitorService.getHealthConfig();
    let pStatus: PixelHealthReport['status'] = 'active';
    if (f24h === 0 && expected > 0) pStatus = 'dead';
    else if (sigLoss > cfg.pixel_signal_loss_threshold * 100) pStatus = 'failing';
    else if (sigLoss > cfg.pixel_signal_loss_threshold * 50 || errRate > 10) pStatus = 'degraded';

    const evRes = await pool.query(
      `SELECT event_type, COUNT(*) AS cnt, MAX(created_at) AS ls
       FROM pixel_events WHERE pixel_id=$1 AND created_at>=NOW()-INTERVAL '24 hours'
       GROUP BY event_type ORDER BY cnt DESC`, [pixelId]);
    const events = evRes.rows.map(r => ({ event_type: r.event_type as string, count: Number(r.cnt), last_seen: r.ls as string }));

    const issues: PixelHealthReport['issues'] = [];
    if (pStatus === 'dead') issues.push({ issue: 'Pixel not fired in 24h', severity: 'critical',
      recommendation: 'Verify pixel installation and check for JS errors.' });
    if (sigLoss > 50) issues.push({ issue: `Signal loss ${r2(sigLoss)}%`, severity: 'critical',
      recommendation: 'Check ad blockers, consent managers, or pixel code changes.' });
    if (errRate > 20) issues.push({ issue: `Error rate ${r2(errRate)}%`, severity: 'warning',
      recommendation: 'Review pixel payload format and endpoint availability.' });
    if (lat > 3000) issues.push({ issue: `High latency ${Math.round(lat)}ms`, severity: 'warning',
      recommendation: 'Optimize pixel loading; consider async or CDN.' });

    if (pStatus === 'failing' || pStatus === 'dead') {
      await CampaignHealthMonitorService.createAlertIfNotExists(campaignId, 'pixel_loss',
        pStatus === 'dead' ? 'emergency' : 'critical', 'Pixel Signal Loss',
        `Pixel ${pixelId}: ${pStatus}. Loss: ${r2(sigLoss)}%. Fires 24h: ${f24h} (exp: ${Math.round(expected)}).`,
        'pixel_signal', sigLoss, cfg.pixel_signal_loss_threshold * 100,
        issues[0]?.recommendation || 'Investigate pixel tracking.');
    }

    return { campaign_id: campaignId, pixel_id: pixelId, status: pStatus,
      last_fire_timestamp: lastFire, fires_last_hour: f1h, fires_last_24h: f24h,
      expected_fires_24h: Number(expected.toFixed(0)), signal_loss_pct: r2(sigLoss),
      error_rate: r2(errRate), latency_ms: Number(lat.toFixed(0)),
      events_tracked: events, issues };
  }

  /** Overview dashboard with aggregate stats. Cached 2 min. */
  static async getHealthDashboard(): Promise<HealthDashboard> {
    const ck = `${CACHE_PREFIX}:dashboard`;
    const cached = await cacheGet<HealthDashboard>(ck);
    if (cached) return cached;

    const hc = await pool.query(
      `SELECT COUNT(*) AS total,
         SUM(CASE WHEN health_score>=80 THEN 1 ELSE 0 END) AS healthy,
         SUM(CASE WHEN health_score>=60 AND health_score<80 THEN 1 ELSE 0 END) AS warning,
         SUM(CASE WHEN health_score<60 THEN 1 ELSE 0 END) AS critical,
         AVG(health_score) AS avg FROM (
         SELECT DISTINCT ON(campaign_id) campaign_id, health_score
         FROM campaign_health_history ORDER BY campaign_id, checked_at DESC) latest`);
    const r = hc.rows[0] || {};

    const ac = await pool.query(
      `SELECT COUNT(*) AS active, SUM(CASE WHEN acknowledged=false THEN 1 ELSE 0 END) AS unack
       FROM campaign_health_alerts WHERE resolved_at IS NULL`);

    const ti = await pool.query(
      `SELECT alert_type AS type, COUNT(*) AS count FROM campaign_health_alerts
       WHERE resolved_at IS NULL GROUP BY alert_type ORDER BY count DESC LIMIT 5`);

    const wr = await pool.query(
      `SELECT DISTINCT ON(h.campaign_id) h.campaign_id, h.health_score
       FROM campaign_health_history h JOIN campaigns c ON c.id=h.campaign_id
       WHERE c.status='active' ORDER BY h.campaign_id, h.checked_at DESC`);
    const worstRows = wr.rows.sort((a, b) => Number(a.health_score) - Number(b.health_score)).slice(0, 5);

    const worst: CampaignHealthScore[] = [];
    for (const w of worstRows) {
      try { worst.push(await CampaignHealthMonitorService.checkCampaignHealth(w.campaign_id as string)); }
      catch { /* skip */ }
    }

    const ra = await pool.query(`SELECT id, campaign_id, alert_type, severity, title, description, metric_name, current_value, threshold_value, recommended_action, auto_action_taken, acknowledged, acknowledged_by, created_at, resolved_at FROM campaign_health_alerts ORDER BY created_at DESC LIMIT 10`);

    const dashboard: HealthDashboard = {
      total_campaigns: Number(r.total) || 0, healthy_campaigns: Number(r.healthy) || 0,
      warning_campaigns: Number(r.warning) || 0, critical_campaigns: Number(r.critical) || 0,
      average_health_score: Number(Number(r.avg || 0).toFixed(1)),
      active_alerts: Number(ac.rows[0]?.active) || 0,
      unacknowledged_alerts: Number(ac.rows[0]?.unack) || 0,
      top_issues: ti.rows.map(r => ({ type: r.type as HealthAlertType, count: Number(r.count) })),
      worst_performing: worst, recent_alerts: ra.rows.map(mapAlert),
    };

    await cacheSet(ck, dashboard, CACHE_TTL_DASHBOARD);
    logger.info('Health dashboard generated', { total: dashboard.total_campaigns, alerts: dashboard.active_alerts });
    return dashboard;
  }

  /** Get health alerts with optional filters. */
  static async getHealthAlerts(
    filters?: { type?: HealthAlertType; severity?: string; acknowledged?: boolean },
  ): Promise<HealthAlert[]> {
    const conds: string[] = []; const params: unknown[] = []; let pi = 1;
    if (filters?.type) { conds.push(`alert_type=$${pi++}`); params.push(filters.type); }
    if (filters?.severity) { conds.push(`severity=$${pi++}`); params.push(filters.severity); }
    if (filters?.acknowledged !== undefined) { conds.push(`acknowledged=$${pi++}`); params.push(filters.acknowledged); }
    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    const res = await pool.query(`SELECT id, campaign_id, alert_type, severity, title, description, metric_name, current_value, threshold_value, recommended_action, auto_action_taken, acknowledged, acknowledged_by, created_at, resolved_at FROM campaign_health_alerts ${where} ORDER BY created_at DESC LIMIT 200`, params);
    return res.rows.map(mapAlert);
  }

  /** Acknowledge an alert. */
  static async acknowledgeAlert(alertId: string, userId: string): Promise<HealthAlert> {
    const res = await pool.query(
      `UPDATE campaign_health_alerts SET acknowledged=true, acknowledged_by=$2 WHERE id=$1 RETURNING *`,
      [alertId, userId]);
    if (res.rows.length === 0) throw new NotFoundError(`Health alert not found: ${alertId}`);
    const alert = mapAlert(res.rows[0]);
    await cacheDel(`${CACHE_PREFIX}:dashboard`);
    await AuditService.log({ userId, action: 'health_alert.acknowledge', resourceType: 'health_alert',
      resourceId: alertId, details: { alertType: alert.alert_type, severity: alert.severity, campaignId: alert.campaign_id } });
    logger.info('Health alert acknowledged', { alertId, userId, alertType: alert.alert_type });
    return alert;
  }

  /** Resolve an alert with a resolution description. */
  static async resolveAlert(alertId: string, resolution: string): Promise<HealthAlert> {
    if (!resolution || resolution.trim().length === 0) throw new ValidationError('Resolution description is required');
    const res = await pool.query(
      `UPDATE campaign_health_alerts SET resolved_at=NOW(), auto_action_taken=$2 WHERE id=$1 RETURNING *`,
      [alertId, resolution]);
    if (res.rows.length === 0) throw new NotFoundError(`Health alert not found: ${alertId}`);
    const alert = mapAlert(res.rows[0]);
    await cacheDel(`${CACHE_PREFIX}:score:${alert.campaign_id}`);
    await cacheDel(`${CACHE_PREFIX}:dashboard`);
    await AuditService.log({ action: 'health_alert.resolve', resourceType: 'health_alert', resourceId: alertId,
      details: { alertType: alert.alert_type, severity: alert.severity, campaignId: alert.campaign_id, resolution } });
    logger.info('Health alert resolved', { alertId, alertType: alert.alert_type, resolution });
    return alert;
  }

  /** Get health monitoring configuration. Cached 5 min. */
  static async getHealthConfig(): Promise<HealthConfig> {
    const ck = `${CACHE_PREFIX}:config`;
    const cached = await cacheGet<HealthConfig>(ck);
    if (cached) return cached;
    const res = await pool.query(`SELECT cpa_volatility_threshold, spend_velocity_threshold, creative_fatigue_threshold, ctr_decline_threshold, pixel_signal_loss_threshold, check_interval_minutes, auto_pause_on_critical, updated_at FROM campaign_health_config ORDER BY updated_at DESC LIMIT 1`);
    let config: HealthConfig;
    if (res.rows.length > 0) {
      const r = res.rows[0];
      config = {
        cpa_volatility_threshold: Number(r.cpa_volatility_threshold),
        spend_velocity_threshold: Number(r.spend_velocity_threshold),
        creative_fatigue_threshold: Number(r.creative_fatigue_threshold),
        ctr_decline_threshold: Number(r.ctr_decline_threshold),
        pixel_signal_loss_threshold: Number(r.pixel_signal_loss_threshold),
        check_interval_minutes: Number(r.check_interval_minutes),
        auto_pause_on_critical: Boolean(r.auto_pause_on_critical),
      };
    } else {
      config = { cpa_volatility_threshold: 0.3, spend_velocity_threshold: 0.4,
        creative_fatigue_threshold: 0.6, ctr_decline_threshold: 0.25,
        pixel_signal_loss_threshold: 0.3, check_interval_minutes: 30, auto_pause_on_critical: false };
    }
    await cacheSet(ck, config, CACHE_TTL_CONFIG);
    return config;
  }

  /** Update health monitoring thresholds. Partial updates supported. */
  static async updateHealthConfig(updates: Partial<HealthConfig>): Promise<HealthConfig> {
    const cur = await CampaignHealthMonitorService.getHealthConfig();
    const merged: HealthConfig = {
      cpa_volatility_threshold: updates.cpa_volatility_threshold ?? cur.cpa_volatility_threshold,
      spend_velocity_threshold: updates.spend_velocity_threshold ?? cur.spend_velocity_threshold,
      creative_fatigue_threshold: updates.creative_fatigue_threshold ?? cur.creative_fatigue_threshold,
      ctr_decline_threshold: updates.ctr_decline_threshold ?? cur.ctr_decline_threshold,
      pixel_signal_loss_threshold: updates.pixel_signal_loss_threshold ?? cur.pixel_signal_loss_threshold,
      check_interval_minutes: updates.check_interval_minutes ?? cur.check_interval_minutes,
      auto_pause_on_critical: updates.auto_pause_on_critical ?? cur.auto_pause_on_critical,
    };

    for (const [k, v] of Object.entries(merged)) {
      if (k === 'check_interval_minutes') {
        if (v < 1 || v > 1440) throw new ValidationError('check_interval_minutes must be between 1 and 1440');
      } else if (k === 'auto_pause_on_critical') continue;
      else if (typeof v === 'number' && (v < 0 || v > 1))
        throw new ValidationError(`${k} must be between 0 and 1`);
    }

    await pool.query(
      `INSERT INTO campaign_health_config (id, cpa_volatility_threshold, spend_velocity_threshold,
         creative_fatigue_threshold, ctr_decline_threshold, pixel_signal_loss_threshold,
         check_interval_minutes, auto_pause_on_critical, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (id) DO UPDATE SET cpa_volatility_threshold=EXCLUDED.cpa_volatility_threshold,
         spend_velocity_threshold=EXCLUDED.spend_velocity_threshold,
         creative_fatigue_threshold=EXCLUDED.creative_fatigue_threshold,
         ctr_decline_threshold=EXCLUDED.ctr_decline_threshold,
         pixel_signal_loss_threshold=EXCLUDED.pixel_signal_loss_threshold,
         check_interval_minutes=EXCLUDED.check_interval_minutes,
         auto_pause_on_critical=EXCLUDED.auto_pause_on_critical, updated_at=NOW()`,
      ['default', merged.cpa_volatility_threshold, merged.spend_velocity_threshold,
       merged.creative_fatigue_threshold, merged.ctr_decline_threshold,
       merged.pixel_signal_loss_threshold, merged.check_interval_minutes, merged.auto_pause_on_critical]);

    await cacheDel(`${CACHE_PREFIX}:config`);
    await AuditService.log({ action: 'health_config.update', resourceType: 'health_config',
      resourceId: 'default', details: { previous: cur, updated: merged } });
    logger.info('Health config updated', { config: merged });
    return merged;
  }

  /** Historical health scores for a campaign over N days. */
  static async getHealthHistory(campaignId: string, days: number): Promise<{ date: string; health_score: number }[]> {
    if (days < 1 || days > 365) throw new ValidationError('Days must be between 1 and 365');
    const res = await pool.query(
      `SELECT DATE(checked_at) AS date, ROUND(AVG(health_score)::numeric,1) AS health_score
       FROM campaign_health_history WHERE campaign_id=$1 AND checked_at>=NOW()-MAKE_INTERVAL(days=>$2)
       GROUP BY DATE(checked_at) ORDER BY date`, [campaignId, days]);
    return res.rows.map(r => ({ date: r.date as string, health_score: Number(r.health_score) }));
  }

  /** Run full system health scan across all active campaigns. */
  static async runHealthScan(): Promise<{ scanned: number; alerts_generated: number; critical: number }> {
    logger.info('Starting full health scan');
    const campaigns = await pool.query(`SELECT id FROM campaigns WHERE status='active'`);
    const beforeCount = await pool.query(`SELECT COUNT(*) AS c FROM campaign_health_alerts WHERE resolved_at IS NULL`);
    const alertsBefore = Number(beforeCount.rows[0].c);
    let scanned = 0, critical = 0;

    for (const row of campaigns.rows) {
      const cid = row.id as string;
      try {
        const health = await CampaignHealthMonitorService.checkCampaignHealth(cid);
        scanned++;
        if (health.overall_health < 60) critical++;

        const cfg = await CampaignHealthMonitorService.getHealthConfig();
        if (cfg.auto_pause_on_critical && health.overall_health < 40) {
          const emergAlerts = health.alerts.filter(a => a.severity === 'emergency' || a.severity === 'critical');
          if (emergAlerts.length > 0) {
            await pool.query(`UPDATE campaigns SET status='paused' WHERE id=$1 AND status='active'`, [cid]);
            await AuditService.log({ action: 'health_scan.auto_pause', resourceType: 'campaign', resourceId: cid,
              details: { health_score: health.overall_health, alert_count: emergAlerts.length, reason: 'Auto-paused: critical health score' } });
            logger.warn('Campaign auto-paused', { campaignId: cid, healthScore: health.overall_health });
          }
        }
      } catch (e) { logger.error('Scan failed for campaign', { campaignId: cid, error: e instanceof Error ? e.message : String(e) }); }
    }

    const afterCount = await pool.query(`SELECT COUNT(*) AS c FROM campaign_health_alerts WHERE resolved_at IS NULL`);
    const alertsGenerated = Math.max(0, Number(afterCount.rows[0].c) - alertsBefore);

    if (critical > 0) {
      await AuditService.log({ action: 'health_scan.critical_detected', resourceType: 'health_scan',
        details: { scanned, alertsGenerated, critical } });
    }
    logger.info('Health scan completed', { scanned, alertsGenerated, critical });
    return { scanned, alerts_generated: alertsGenerated, critical };
  }

  // -----------------------------------------------------------------------
  // Private: MetricHealth builders
  // -----------------------------------------------------------------------

  private static buildCPAHealth(r: CPAVolatilityReport): MetricHealth {
    const score = r.volatility_score;
    const dev = r.average_cpa_30d > 0 ? ((r.current_cpa - r.average_cpa_30d) / r.average_cpa_30d) * 100 : 0;
    const t = trend(r.daily_cpa_history.map(d => d.cpa));
    const mt: MetricHealth['trend'] = t === 'improving' ? 'declining' : t === 'declining' ? 'improving' : 'stable';
    return { score, status: status(score), current_value: r.current_cpa, baseline_value: r.average_cpa_30d,
      deviation_pct: r2(dev), trend: mt,
      details: r.is_volatile ? `CPA volatile (CV: ${(r.coefficient_of_variation * 100).toFixed(1)}%). ${r.anomalous_days.length} anomalous day(s).`
        : `CPA stable (CV: ${(r.coefficient_of_variation * 100).toFixed(1)}%).` };
  }

  private static buildSpendHealth(r: SpendVelocityReport): MetricHealth {
    const dev = Math.abs(r.velocity_ratio - 1);
    const score = clamp(Math.round(100 * (1 - Math.min(dev * 2, 1))));
    const devPct = r.average_daily_spend_7d > 0 ? ((r.current_daily_spend - r.average_daily_spend_7d) / r.average_daily_spend_7d) * 100 : 0;
    return { score, status: status(score), current_value: r.current_daily_spend, baseline_value: r.average_daily_spend_7d,
      deviation_pct: r2(devPct), trend: trend(r.hourly_spend_pattern.map(h => h.spend)),
      details: r.is_anomalous ? `Spend anomaly: ${r.anomaly_type}. Velocity: ${r.velocity_ratio.toFixed(2)}x.`
        : `Spend normal. Velocity: ${r.velocity_ratio.toFixed(2)}x.` };
  }

  private static buildCreativeHealth(r: CreativeFatigueReport): MetricHealth {
    const score = clamp(Math.round(100 - r.overall_fatigue_score));
    const fatigued = r.creatives.filter(c => c.fatigue_score >= 60).length;
    const total = r.creatives.length || 1;
    const avgChg = r.creatives.filter(c => c.ctr_trend.length >= 2)
      .map(c => c.ctr_trend[c.ctr_trend.length - 1] - c.ctr_trend[0]);
    const avg = avgChg.length > 0 ? avgChg.reduce((a, b) => a + b, 0) / avgChg.length : 0;
    const t: MetricHealth['trend'] = avg > 0.1 ? 'improving' : avg < -0.1 ? 'declining' : 'stable';
    return { score, status: status(score), current_value: r.overall_fatigue_score, baseline_value: 0,
      deviation_pct: r.estimated_performance_loss_pct, trend: t,
      details: `${fatigued}/${total} fatigued. Urgency: ${r.rotation_urgency}. Loss: ${r.estimated_performance_loss_pct}%.` };
  }

  private static buildCTRHealth(w: CTRCollapseWarning): MetricHealth {
    const score = clamp(Math.round(100 - w.collapse_probability));
    const dev = w.baseline_ctr > 0 ? ((w.current_ctr - w.baseline_ctr) / w.baseline_ctr) * 100 : 0;
    const t: MetricHealth['trend'] = w.days_of_decline >= 3 ? 'declining' : w.decline_rate_per_day > 0 ? 'stable' : 'improving';
    return { score, status: status(score), current_value: w.current_ctr, baseline_value: w.baseline_ctr,
      deviation_pct: r2(dev), trend: t,
      details: w.severity !== 'none' ? `Collapse ${w.severity}. ${w.days_of_decline} declining day(s). Projected 7d: ${w.projected_ctr_7d.toFixed(2)}%.`
        : 'CTR stable. No collapse risk.' };
  }

  private static buildPixelHealth(r: PixelHealthReport): MetricHealth {
    const retention = Math.max(0, 100 - r.signal_loss_pct);
    const errPen = Math.min(20, r.error_rate * 0.5);
    const latPen = r.latency_ms > 2000 ? 10 : r.latency_ms > 1000 ? 5 : 0;
    const score = clamp(Math.round(retention - errPen - latPen));
    const t: MetricHealth['trend'] = r.status === 'active' ? 'stable' : 'declining';
    return { score, status: status(score), current_value: r.fires_last_24h, baseline_value: r.expected_fires_24h,
      deviation_pct: r2(-r.signal_loss_pct), trend: t,
      details: `Pixel ${r.status}. Loss: ${r.signal_loss_pct}%. Errors: ${r.error_rate}%. Latency: ${r.latency_ms}ms.` };
  }

  // -----------------------------------------------------------------------
  // Private: alert creation with deduplication
  // -----------------------------------------------------------------------

  private static async createAlertIfNotExists(
    campaignId: string, alertType: HealthAlertType, severity: HealthAlert['severity'],
    title: string, description: string, metricName: string,
    currentValue: number, thresholdValue: number, recommendedAction: string,
  ): Promise<void> {
    const existing = await pool.query(
      `SELECT id FROM campaign_health_alerts WHERE campaign_id=$1 AND alert_type=$2 AND resolved_at IS NULL LIMIT 1`,
      [campaignId, alertType]);

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE campaign_health_alerts SET severity = CASE
           WHEN severity='info' AND $2 IN ('warning','critical','emergency') THEN $2
           WHEN severity='warning' AND $2 IN ('critical','emergency') THEN $2
           WHEN severity='critical' AND $2='emergency' THEN $2 ELSE severity END,
         current_value=$3, description=$4 WHERE id=$1`,
        [existing.rows[0].id, severity, currentValue, description]);
      return;
    }

    const id = generateId();
    await pool.query(
      `INSERT INTO campaign_health_alerts (id, campaign_id, alert_type, severity, title, description,
         metric_name, current_value, threshold_value, recommended_action, auto_action_taken,
         acknowledged, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,false,NOW())`,
      [id, campaignId, alertType, severity, title, description, metricName,
       currentValue, thresholdValue, recommendedAction]);

    if (severity === 'critical' || severity === 'emergency') {
      await AuditService.log({ action: `health_alert.${severity}`, resourceType: 'health_alert',
        resourceId: id, details: { campaignId, alertType, title, currentValue, thresholdValue } });
    }
    logger.warn('Health alert created', { alertId: id, campaignId, alertType, severity, title });
  }
}
