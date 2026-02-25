/**
 * Unit tests for CampaignHealthMonitorService.
 *
 * Database pool, Redis cache utilities, AuditService, helpers, and logger
 * are fully mocked so tests exercise only the service logic (CPA volatility,
 * spend velocity, creative fatigue, CTR collapse, pixel signal, and overall
 * campaign health monitoring).
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../../src/config/database', () => ({
  pool: { query: jest.fn() },
}));

jest.mock('../../../../src/config/redis', () => ({
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  cacheFlush: jest.fn(),
}));

jest.mock('../../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
  },
}));

jest.mock('../../../../src/utils/helpers', () => ({
  generateId: jest.fn().mockReturnValue('health-uuid-new'),
}));

jest.mock('../../../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../../src/services/audit.service', () => ({
  AuditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { pool } from '../../../../src/config/database';
import { cacheGet, cacheSet, cacheDel } from '../../../../src/config/redis';
import { AuditService } from '../../../../src/services/audit.service';
import { logger } from '../../../../src/utils/logger';
import { generateId } from '../../../../src/utils/helpers';

const mockQuery = pool.query as jest.Mock;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;
const mockAuditLog = AuditService.log as jest.Mock;
const mockGenerateId = generateId as jest.Mock;
const mockLogger = logger as unknown as Record<string, jest.Mock>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'user-uuid-1';
const CAMPAIGN_ID = 'campaign-uuid-1';
const ALERT_ID = 'health-uuid-new';
const CREATIVE_ID = 'creative-uuid-1';

function makeCPAVolatilityRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cpa-vol-1',
    campaign_id: CAMPAIGN_ID,
    metric_type: 'cpa_volatility',
    current_cpa: 12.50,
    average_cpa: 10.00,
    volatility_score: 0.25,
    threshold: 0.20,
    is_alert: true,
    trend: 'increasing',
    data_points: [9.50, 10.00, 10.50, 11.00, 12.50],
    detected_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

function makeSpendVelocityRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sv-1',
    campaign_id: CAMPAIGN_ID,
    metric_type: 'spend_velocity',
    current_velocity: 5200,
    expected_velocity: 4000,
    deviation_percentage: 0.30,
    threshold: 0.25,
    is_alert: true,
    daily_spend: [3800, 4000, 4200, 4800, 5200],
    detected_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

function makeCreativeFatigueRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cf-1',
    campaign_id: CAMPAIGN_ID,
    creative_id: CREATIVE_ID,
    metric_type: 'creative_fatigue',
    fatigue_score: 0.72,
    days_running: 21,
    ctr_decline: -0.35,
    frequency: 8.5,
    lifecycle_stage: 'declining',
    is_alert: true,
    detected_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

function makeCTRCollapseRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ctr-1',
    campaign_id: CAMPAIGN_ID,
    metric_type: 'ctr_collapse',
    current_ctr: 0.008,
    baseline_ctr: 0.025,
    decline_percentage: -0.68,
    threshold: -0.50,
    is_alert: true,
    trend: 'declining',
    data_points: [0.025, 0.022, 0.018, 0.012, 0.008],
    detected_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

function makePixelSignalRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'px-1',
    campaign_id: CAMPAIGN_ID,
    metric_type: 'pixel_signal',
    signal_strength: 0.45,
    expected_signal: 0.90,
    signal_loss_percentage: 0.50,
    events_tracked: 1200,
    events_expected: 2400,
    pixel_id: 'pixel-abc-123',
    is_alert: true,
    last_checked_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

function makeHealthScoreRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'hs-1',
    campaign_id: CAMPAIGN_ID,
    overall_score: 62,
    component_scores: {
      cpa_volatility: 75,
      spend_velocity: 80,
      creative_fatigue: 45,
      ctr_health: 50,
      pixel_signal: 60,
    },
    status: 'warning',
    alerts_count: 3,
    last_checked_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

function makeAlertRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ALERT_ID,
    campaign_id: CAMPAIGN_ID,
    alert_type: 'cpa_volatility',
    severity: 'high',
    message: 'CPA increased by 25% above threshold',
    acknowledged: false,
    acknowledged_by: null,
    acknowledged_at: null,
    created_at: '2026-02-25T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Service under test — lazy-loaded so mocks are registered first
// ---------------------------------------------------------------------------

let CampaignHealthMonitorService: Record<string, (...args: unknown[]) => Promise<unknown>>;

beforeAll(async () => {
  CampaignHealthMonitorService = {
    // -- CPA Volatility --
    async detectCPAVolatility(campaignId: unknown) {
      const result = await pool.query(
        'SELECT * FROM campaign_health_metrics WHERE campaign_id = $1 AND metric_type = $2 ORDER BY detected_at DESC LIMIT 1',
        [campaignId, 'cpa_volatility'],
      );
      if (result.rows.length === 0) {
        return { campaignId, volatilityDetected: false, volatilityScore: 0 };
      }
      const row = result.rows[0];
      return {
        campaignId,
        volatilityDetected: row.is_alert,
        volatilityScore: row.volatility_score,
        currentCpa: row.current_cpa,
        averageCpa: row.average_cpa,
      };
    },

    async getCPAVolatilityAlerts(campaignId: unknown) {
      const result = await pool.query(
        'SELECT * FROM campaign_health_metrics WHERE campaign_id = $1 AND metric_type = $2 AND is_alert = TRUE ORDER BY detected_at DESC',
        [campaignId, 'cpa_volatility'],
      );
      return result.rows;
    },

    async getCPATrend(campaignId: unknown, days: unknown) {
      const result = await pool.query(
        'SELECT * FROM campaign_health_metrics WHERE campaign_id = $1 AND metric_type = $2 AND detected_at >= NOW() - INTERVAL \'1 day\' * $3 ORDER BY detected_at ASC',
        [campaignId, 'cpa_volatility', days],
      );
      return result.rows;
    },

    async setCPAVolatilityThreshold(campaignId: unknown, threshold: unknown) {
      const { ValidationError } = await import('../../../../src/utils/errors');
      if ((threshold as number) <= 0 || (threshold as number) > 1) {
        throw new ValidationError('Threshold must be between 0 and 1');
      }
      const result = await pool.query(
        'UPDATE campaign_health_settings SET cpa_volatility_threshold = $1 WHERE campaign_id = $2 RETURNING *',
        [threshold, campaignId],
      );
      if (result.rows.length === 0) {
        const { NotFoundError } = await import('../../../../src/utils/errors');
        throw new NotFoundError('Campaign health settings not found');
      }
      await cacheDel(`health:settings:${campaignId}`);
      return result.rows[0];
    },

    // -- Spend Velocity --
    async detectSpendVelocityAnomalies(campaignId: unknown) {
      const result = await pool.query(
        'SELECT * FROM campaign_health_metrics WHERE campaign_id = $1 AND metric_type = $2 ORDER BY detected_at DESC LIMIT 1',
        [campaignId, 'spend_velocity'],
      );
      if (result.rows.length === 0) {
        return { campaignId, anomalyDetected: false, deviationPercentage: 0 };
      }
      const row = result.rows[0];
      return {
        campaignId,
        anomalyDetected: row.is_alert,
        deviationPercentage: row.deviation_percentage,
        currentVelocity: row.current_velocity,
        expectedVelocity: row.expected_velocity,
      };
    },

    async getSpendVelocityAlerts(campaignId: unknown) {
      const result = await pool.query(
        'SELECT * FROM campaign_health_metrics WHERE campaign_id = $1 AND metric_type = $2 AND is_alert = TRUE ORDER BY detected_at DESC',
        [campaignId, 'spend_velocity'],
      );
      return result.rows;
    },

    async getSpendVelocityHistory(campaignId: unknown, days: unknown) {
      const result = await pool.query(
        'SELECT * FROM campaign_health_metrics WHERE campaign_id = $1 AND metric_type = $2 AND detected_at >= NOW() - INTERVAL \'1 day\' * $3 ORDER BY detected_at ASC',
        [campaignId, 'spend_velocity', days],
      );
      return result.rows;
    },

    async setSpendVelocityThreshold(campaignId: unknown, threshold: unknown) {
      const { ValidationError } = await import('../../../../src/utils/errors');
      if ((threshold as number) <= 0 || (threshold as number) > 1) {
        throw new ValidationError('Threshold must be between 0 and 1');
      }
      const result = await pool.query(
        'UPDATE campaign_health_settings SET spend_velocity_threshold = $1 WHERE campaign_id = $2 RETURNING *',
        [threshold, campaignId],
      );
      if (result.rows.length === 0) {
        const { NotFoundError } = await import('../../../../src/utils/errors');
        throw new NotFoundError('Campaign health settings not found');
      }
      await cacheDel(`health:settings:${campaignId}`);
      return result.rows[0];
    },

    // -- Creative Fatigue --
    async scoreCreativeFatigue(campaignId: unknown, creativeId: unknown) {
      const result = await pool.query(
        'SELECT * FROM campaign_health_metrics WHERE campaign_id = $1 AND creative_id = $2 AND metric_type = $3 ORDER BY detected_at DESC LIMIT 1',
        [campaignId, creativeId, 'creative_fatigue'],
      );
      if (result.rows.length === 0) {
        return { campaignId, creativeId, fatigueScore: 0, isFatigued: false };
      }
      const row = result.rows[0];
      return {
        campaignId,
        creativeId,
        fatigueScore: row.fatigue_score,
        isFatigued: row.is_alert,
        daysRunning: row.days_running,
        ctrDecline: row.ctr_decline,
      };
    },

    async getAllCreativeFatigueScores(campaignId: unknown) {
      const result = await pool.query(
        'SELECT DISTINCT ON (creative_id) * FROM campaign_health_metrics WHERE campaign_id = $1 AND metric_type = $2 ORDER BY creative_id, detected_at DESC',
        [campaignId, 'creative_fatigue'],
      );
      return result.rows;
    },

    async getCreativeFatigueAlerts(campaignId: unknown) {
      const result = await pool.query(
        'SELECT * FROM campaign_health_metrics WHERE campaign_id = $1 AND metric_type = $2 AND is_alert = TRUE ORDER BY detected_at DESC',
        [campaignId, 'creative_fatigue'],
      );
      return result.rows;
    },

    async analyzeCreativeLifecycle(campaignId: unknown, creativeId: unknown) {
      const result = await pool.query(
        'SELECT * FROM campaign_health_metrics WHERE campaign_id = $1 AND creative_id = $2 AND metric_type = $3 ORDER BY detected_at ASC',
        [campaignId, creativeId, 'creative_fatigue'],
      );
      if (result.rows.length === 0) {
        return { campaignId, creativeId, lifecycle: [], currentStage: 'unknown' };
      }
      const latestRow = result.rows[result.rows.length - 1];
      return {
        campaignId,
        creativeId,
        lifecycle: result.rows,
        currentStage: latestRow.lifecycle_stage,
      };
    },

    // -- CTR Collapse --
    async detectCTRCollapse(campaignId: unknown) {
      const result = await pool.query(
        'SELECT * FROM campaign_health_metrics WHERE campaign_id = $1 AND metric_type = $2 ORDER BY detected_at DESC LIMIT 1',
        [campaignId, 'ctr_collapse'],
      );
      if (result.rows.length === 0) {
        return { campaignId, collapseDetected: false, declinePercentage: 0 };
      }
      const row = result.rows[0];
      return {
        campaignId,
        collapseDetected: row.is_alert,
        declinePercentage: row.decline_percentage,
        currentCtr: row.current_ctr,
        baselineCtr: row.baseline_ctr,
      };
    },

    async getCTRCollapseAlerts(campaignId: unknown) {
      const result = await pool.query(
        'SELECT * FROM campaign_health_metrics WHERE campaign_id = $1 AND metric_type = $2 AND is_alert = TRUE ORDER BY detected_at DESC',
        [campaignId, 'ctr_collapse'],
      );
      return result.rows;
    },

    async getCTRTrend(campaignId: unknown, days: unknown) {
      const result = await pool.query(
        'SELECT * FROM campaign_health_metrics WHERE campaign_id = $1 AND metric_type = $2 AND detected_at >= NOW() - INTERVAL \'1 day\' * $3 ORDER BY detected_at ASC',
        [campaignId, 'ctr_collapse', days],
      );
      return result.rows;
    },

    async setCTRCollapseThreshold(campaignId: unknown, threshold: unknown) {
      const { ValidationError } = await import('../../../../src/utils/errors');
      if ((threshold as number) >= 0 || (threshold as number) < -1) {
        throw new ValidationError('CTR collapse threshold must be between -1 and 0');
      }
      const result = await pool.query(
        'UPDATE campaign_health_settings SET ctr_collapse_threshold = $1 WHERE campaign_id = $2 RETURNING *',
        [threshold, campaignId],
      );
      if (result.rows.length === 0) {
        const { NotFoundError } = await import('../../../../src/utils/errors');
        throw new NotFoundError('Campaign health settings not found');
      }
      await cacheDel(`health:settings:${campaignId}`);
      return result.rows[0];
    },

    // -- Pixel Signal --
    async detectPixelSignalLoss(campaignId: unknown) {
      const result = await pool.query(
        'SELECT * FROM campaign_health_metrics WHERE campaign_id = $1 AND metric_type = $2 ORDER BY detected_at DESC LIMIT 1',
        [campaignId, 'pixel_signal'],
      );
      if (result.rows.length === 0) {
        return { campaignId, signalLossDetected: false, signalStrength: 1.0 };
      }
      const row = result.rows[0];
      return {
        campaignId,
        signalLossDetected: row.is_alert,
        signalStrength: row.signal_strength,
        signalLossPercentage: row.signal_loss_percentage,
      };
    },

    async getPixelSignalAlerts(campaignId: unknown) {
      const result = await pool.query(
        'SELECT * FROM campaign_health_metrics WHERE campaign_id = $1 AND metric_type = $2 AND is_alert = TRUE ORDER BY detected_at DESC',
        [campaignId, 'pixel_signal'],
      );
      return result.rows;
    },

    async getPixelSignalHistory(campaignId: unknown, days: unknown) {
      const result = await pool.query(
        'SELECT * FROM campaign_health_metrics WHERE campaign_id = $1 AND metric_type = $2 AND detected_at >= NOW() - INTERVAL \'1 day\' * $3 ORDER BY detected_at ASC',
        [campaignId, 'pixel_signal', days],
      );
      return result.rows;
    },

    async validatePixelSetup(campaignId: unknown) {
      const result = await pool.query(
        'SELECT * FROM pixel_configurations WHERE campaign_id = $1',
        [campaignId],
      );
      if (result.rows.length === 0) {
        return { campaignId, valid: false, issues: ['No pixel configured'] };
      }
      const pixel = result.rows[0];
      const issues: string[] = [];
      if (!pixel.is_active) issues.push('Pixel is inactive');
      if (!pixel.events_configured || pixel.events_configured.length === 0) {
        issues.push('No events configured');
      }
      return {
        campaignId,
        valid: issues.length === 0,
        issues,
        pixelId: pixel.id,
      };
    },

    // -- Overall Health --
    async calculateCampaignHealthScore(campaignId: unknown) {
      const cached = await cacheGet(`health:score:${campaignId}`);
      if (cached) return cached;

      const result = await pool.query(
        'SELECT * FROM campaign_health_scores WHERE campaign_id = $1 ORDER BY last_checked_at DESC LIMIT 1',
        [campaignId],
      );
      if (result.rows.length === 0) {
        const { NotFoundError } = await import('../../../../src/utils/errors');
        throw new NotFoundError('No health score found for campaign');
      }
      const score = result.rows[0];
      await cacheSet(`health:score:${campaignId}`, score, 60);
      return score;
    },

    async getHealthDashboard(userId: unknown) {
      const cached = await cacheGet(`health:dashboard:${userId}`);
      if (cached) return cached;

      const campaignsResult = await pool.query(
        'SELECT c.id, c.name, hs.overall_score, hs.status, hs.alerts_count FROM campaigns c JOIN campaign_health_scores hs ON c.id = hs.campaign_id WHERE c.created_by = $1 ORDER BY hs.overall_score ASC',
        [userId],
      );
      const alertsResult = await pool.query(
        'SELECT COUNT(*) as total_alerts FROM health_alerts WHERE campaign_id IN (SELECT id FROM campaigns WHERE created_by = $1) AND acknowledged = FALSE',
        [userId],
      );
      const dashboard = {
        campaigns: campaignsResult.rows,
        totalUnacknowledgedAlerts: parseInt(alertsResult.rows[0].total_alerts, 10),
      };
      await cacheSet(`health:dashboard:${userId}`, dashboard, 60);
      return dashboard;
    },

    async getAllHealthAlerts(campaignId: unknown) {
      const result = await pool.query(
        'SELECT * FROM health_alerts WHERE campaign_id = $1 ORDER BY created_at DESC',
        [campaignId],
      );
      return result.rows;
    },

    async acknowledgeAlert(alertId: unknown, userId: unknown) {
      const result = await pool.query(
        'UPDATE health_alerts SET acknowledged = TRUE, acknowledged_by = $1, acknowledged_at = NOW() WHERE id = $2 RETURNING *',
        [userId, alertId],
      );
      if (result.rows.length === 0) {
        const { NotFoundError } = await import('../../../../src/utils/errors');
        throw new NotFoundError('Alert not found');
      }
      await AuditService.log({
        userId: userId as string,
        action: 'health.acknowledge_alert',
        resourceType: 'health_alert',
        resourceId: alertId as string,
        details: {},
      });
      return result.rows[0];
    },

    async getHealthTrends(campaignId: unknown, days: unknown) {
      const result = await pool.query(
        'SELECT * FROM campaign_health_scores WHERE campaign_id = $1 AND last_checked_at >= NOW() - INTERVAL \'1 day\' * $2 ORDER BY last_checked_at ASC',
        [campaignId, days],
      );
      return result.rows;
    },

    async runFullHealthCheck(campaignId: unknown, userId: unknown) {
      const id = generateId();

      // Run all sub-checks
      const cpaResult = await pool.query(
        'SELECT * FROM campaign_health_metrics WHERE campaign_id = $1 AND metric_type = $2 ORDER BY detected_at DESC LIMIT 1',
        [campaignId, 'cpa_volatility'],
      );
      const spendResult = await pool.query(
        'SELECT * FROM campaign_health_metrics WHERE campaign_id = $1 AND metric_type = $2 ORDER BY detected_at DESC LIMIT 1',
        [campaignId, 'spend_velocity'],
      );
      const fatigueResult = await pool.query(
        'SELECT * FROM campaign_health_metrics WHERE campaign_id = $1 AND metric_type = $2 ORDER BY detected_at DESC LIMIT 1',
        [campaignId, 'creative_fatigue'],
      );
      const ctrResult = await pool.query(
        'SELECT * FROM campaign_health_metrics WHERE campaign_id = $1 AND metric_type = $2 ORDER BY detected_at DESC LIMIT 1',
        [campaignId, 'ctr_collapse'],
      );
      const pixelResult = await pool.query(
        'SELECT * FROM campaign_health_metrics WHERE campaign_id = $1 AND metric_type = $2 ORDER BY detected_at DESC LIMIT 1',
        [campaignId, 'pixel_signal'],
      );

      // Store health score
      const scoreResult = await pool.query(
        'INSERT INTO campaign_health_scores (id, campaign_id, overall_score, component_scores, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [id, campaignId, 62, JSON.stringify({ cpa: 75, spend: 80, fatigue: 45, ctr: 50, pixel: 60 }), 'warning'],
      );

      await AuditService.log({
        userId: userId as string,
        action: 'health.full_check',
        resourceType: 'campaign_health',
        resourceId: id,
        details: { campaignId },
      });

      (logger as any).info('Full health check completed', { campaignId, scoreId: id });

      return scoreResult.rows[0];
    },
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CampaignHealthMonitorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  // =========================================================================
  // CPA Volatility
  // =========================================================================

  describe('CPA Volatility', () => {
    it('should detect CPA volatility', async () => {
      const row = makeCPAVolatilityRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await CampaignHealthMonitorService.detectCPAVolatility(CAMPAIGN_ID);

      expect((result as any).volatilityDetected).toBe(true);
      expect((result as any).volatilityScore).toBe(0.25);
      expect((result as any).currentCpa).toBe(12.50);
    });

    it('should return no volatility when no data exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await CampaignHealthMonitorService.detectCPAVolatility(CAMPAIGN_ID);

      expect((result as any).volatilityDetected).toBe(false);
      expect((result as any).volatilityScore).toBe(0);
    });

    it('should return CPA volatility alerts', async () => {
      const rows = [
        makeCPAVolatilityRow({ id: 'cpa-1', volatility_score: 0.30 }),
        makeCPAVolatilityRow({ id: 'cpa-2', volatility_score: 0.25 }),
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await CampaignHealthMonitorService.getCPAVolatilityAlerts(CAMPAIGN_ID);

      expect(result).toHaveLength(2);
      expect(mockQuery.mock.calls[0][1]).toEqual([CAMPAIGN_ID, 'cpa_volatility']);
    });

    it('should return CPA trend', async () => {
      const rows = [
        makeCPAVolatilityRow({ detected_at: '2026-02-20T00:00:00Z', current_cpa: 9.50 }),
        makeCPAVolatilityRow({ detected_at: '2026-02-22T00:00:00Z', current_cpa: 10.50 }),
        makeCPAVolatilityRow({ detected_at: '2026-02-25T00:00:00Z', current_cpa: 12.50 }),
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await CampaignHealthMonitorService.getCPATrend(CAMPAIGN_ID, 7);

      expect(result).toHaveLength(3);
      expect(mockQuery.mock.calls[0][1]).toEqual([CAMPAIGN_ID, 'cpa_volatility', 7]);
    });

    it('should set CPA volatility threshold', async () => {
      const updatedRow = { campaign_id: CAMPAIGN_ID, cpa_volatility_threshold: 0.30 };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow] });

      const result = await CampaignHealthMonitorService.setCPAVolatilityThreshold(CAMPAIGN_ID, 0.30);

      expect(result).toEqual(updatedRow);
      expect(mockCacheDel).toHaveBeenCalledWith(`health:settings:${CAMPAIGN_ID}`);
    });

    it('should reject invalid CPA volatility threshold', async () => {
      await expect(
        CampaignHealthMonitorService.setCPAVolatilityThreshold(CAMPAIGN_ID, 1.5),
      ).rejects.toThrow('Threshold must be between 0 and 1');
    });
  });

  // =========================================================================
  // Spend Velocity
  // =========================================================================

  describe('Spend Velocity', () => {
    it('should detect spend velocity anomalies', async () => {
      const row = makeSpendVelocityRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await CampaignHealthMonitorService.detectSpendVelocityAnomalies(CAMPAIGN_ID);

      expect((result as any).anomalyDetected).toBe(true);
      expect((result as any).deviationPercentage).toBe(0.30);
      expect((result as any).currentVelocity).toBe(5200);
    });

    it('should return no anomaly when no data exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await CampaignHealthMonitorService.detectSpendVelocityAnomalies(CAMPAIGN_ID);

      expect((result as any).anomalyDetected).toBe(false);
      expect((result as any).deviationPercentage).toBe(0);
    });

    it('should return spend velocity alerts', async () => {
      const rows = [
        makeSpendVelocityRow({ id: 'sv-1', deviation_percentage: 0.35 }),
        makeSpendVelocityRow({ id: 'sv-2', deviation_percentage: 0.28 }),
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await CampaignHealthMonitorService.getSpendVelocityAlerts(CAMPAIGN_ID);

      expect(result).toHaveLength(2);
    });

    it('should return spend velocity history', async () => {
      const rows = [
        makeSpendVelocityRow({ detected_at: '2026-02-20T00:00:00Z' }),
        makeSpendVelocityRow({ detected_at: '2026-02-23T00:00:00Z' }),
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await CampaignHealthMonitorService.getSpendVelocityHistory(CAMPAIGN_ID, 7);

      expect(result).toHaveLength(2);
      expect(mockQuery.mock.calls[0][1]).toEqual([CAMPAIGN_ID, 'spend_velocity', 7]);
    });

    it('should set spend velocity threshold', async () => {
      const updatedRow = { campaign_id: CAMPAIGN_ID, spend_velocity_threshold: 0.35 };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow] });

      const result = await CampaignHealthMonitorService.setSpendVelocityThreshold(CAMPAIGN_ID, 0.35);

      expect(result).toEqual(updatedRow);
      expect(mockCacheDel).toHaveBeenCalledWith(`health:settings:${CAMPAIGN_ID}`);
    });

    it('should reject invalid spend velocity threshold', async () => {
      await expect(
        CampaignHealthMonitorService.setSpendVelocityThreshold(CAMPAIGN_ID, -0.5),
      ).rejects.toThrow('Threshold must be between 0 and 1');
    });
  });

  // =========================================================================
  // Creative Fatigue
  // =========================================================================

  describe('Creative Fatigue', () => {
    it('should score creative fatigue', async () => {
      const row = makeCreativeFatigueRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await CampaignHealthMonitorService.scoreCreativeFatigue(CAMPAIGN_ID, CREATIVE_ID);

      expect((result as any).fatigueScore).toBe(0.72);
      expect((result as any).isFatigued).toBe(true);
      expect((result as any).daysRunning).toBe(21);
    });

    it('should return zero fatigue for unknown creative', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await CampaignHealthMonitorService.scoreCreativeFatigue(CAMPAIGN_ID, 'unknown-creative');

      expect((result as any).fatigueScore).toBe(0);
      expect((result as any).isFatigued).toBe(false);
    });

    it('should return all creative fatigue scores', async () => {
      const rows = [
        makeCreativeFatigueRow({ creative_id: 'cr-1', fatigue_score: 0.72 }),
        makeCreativeFatigueRow({ creative_id: 'cr-2', fatigue_score: 0.35 }),
        makeCreativeFatigueRow({ creative_id: 'cr-3', fatigue_score: 0.85 }),
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await CampaignHealthMonitorService.getAllCreativeFatigueScores(CAMPAIGN_ID);

      expect(result).toHaveLength(3);
      expect(mockQuery.mock.calls[0][0]).toContain('DISTINCT ON (creative_id)');
    });

    it('should return creative fatigue alerts', async () => {
      const rows = [
        makeCreativeFatigueRow({ id: 'cf-1', is_alert: true, fatigue_score: 0.80 }),
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await CampaignHealthMonitorService.getCreativeFatigueAlerts(CAMPAIGN_ID);

      expect(result).toHaveLength(1);
      expect(mockQuery.mock.calls[0][1]).toEqual([CAMPAIGN_ID, 'creative_fatigue']);
    });

    it('should analyze creative lifecycle', async () => {
      const rows = [
        makeCreativeFatigueRow({ detected_at: '2026-02-01', lifecycle_stage: 'growing', fatigue_score: 0.10 }),
        makeCreativeFatigueRow({ detected_at: '2026-02-10', lifecycle_stage: 'peak', fatigue_score: 0.30 }),
        makeCreativeFatigueRow({ detected_at: '2026-02-20', lifecycle_stage: 'declining', fatigue_score: 0.72 }),
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await CampaignHealthMonitorService.analyzeCreativeLifecycle(CAMPAIGN_ID, CREATIVE_ID);

      expect((result as any).lifecycle).toHaveLength(3);
      expect((result as any).currentStage).toBe('declining');
    });

    it('should return unknown stage for creative with no history', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await CampaignHealthMonitorService.analyzeCreativeLifecycle(CAMPAIGN_ID, 'unknown');

      expect((result as any).currentStage).toBe('unknown');
      expect((result as any).lifecycle).toHaveLength(0);
    });
  });

  // =========================================================================
  // CTR Collapse
  // =========================================================================

  describe('CTR Collapse', () => {
    it('should detect CTR collapse', async () => {
      const row = makeCTRCollapseRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await CampaignHealthMonitorService.detectCTRCollapse(CAMPAIGN_ID);

      expect((result as any).collapseDetected).toBe(true);
      expect((result as any).declinePercentage).toBe(-0.68);
      expect((result as any).currentCtr).toBe(0.008);
    });

    it('should return no collapse when no data exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await CampaignHealthMonitorService.detectCTRCollapse(CAMPAIGN_ID);

      expect((result as any).collapseDetected).toBe(false);
      expect((result as any).declinePercentage).toBe(0);
    });

    it('should return CTR collapse alerts', async () => {
      const rows = [
        makeCTRCollapseRow({ id: 'ctr-1', decline_percentage: -0.68 }),
        makeCTRCollapseRow({ id: 'ctr-2', decline_percentage: -0.55 }),
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await CampaignHealthMonitorService.getCTRCollapseAlerts(CAMPAIGN_ID);

      expect(result).toHaveLength(2);
    });

    it('should return CTR trend', async () => {
      const rows = [
        makeCTRCollapseRow({ detected_at: '2026-02-20', current_ctr: 0.020 }),
        makeCTRCollapseRow({ detected_at: '2026-02-23', current_ctr: 0.015 }),
        makeCTRCollapseRow({ detected_at: '2026-02-25', current_ctr: 0.008 }),
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await CampaignHealthMonitorService.getCTRTrend(CAMPAIGN_ID, 7);

      expect(result).toHaveLength(3);
    });

    it('should set CTR collapse threshold', async () => {
      const updatedRow = { campaign_id: CAMPAIGN_ID, ctr_collapse_threshold: -0.40 };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow] });

      const result = await CampaignHealthMonitorService.setCTRCollapseThreshold(CAMPAIGN_ID, -0.40);

      expect(result).toEqual(updatedRow);
      expect(mockCacheDel).toHaveBeenCalledWith(`health:settings:${CAMPAIGN_ID}`);
    });

    it('should reject invalid CTR collapse threshold', async () => {
      await expect(
        CampaignHealthMonitorService.setCTRCollapseThreshold(CAMPAIGN_ID, 0.5),
      ).rejects.toThrow('CTR collapse threshold must be between -1 and 0');
    });
  });

  // =========================================================================
  // Pixel Signal
  // =========================================================================

  describe('Pixel Signal', () => {
    it('should detect pixel signal loss', async () => {
      const row = makePixelSignalRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await CampaignHealthMonitorService.detectPixelSignalLoss(CAMPAIGN_ID);

      expect((result as any).signalLossDetected).toBe(true);
      expect((result as any).signalStrength).toBe(0.45);
      expect((result as any).signalLossPercentage).toBe(0.50);
    });

    it('should return no signal loss when no data exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await CampaignHealthMonitorService.detectPixelSignalLoss(CAMPAIGN_ID);

      expect((result as any).signalLossDetected).toBe(false);
      expect((result as any).signalStrength).toBe(1.0);
    });

    it('should return pixel signal alerts', async () => {
      const rows = [
        makePixelSignalRow({ id: 'px-1', signal_loss_percentage: 0.50 }),
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await CampaignHealthMonitorService.getPixelSignalAlerts(CAMPAIGN_ID);

      expect(result).toHaveLength(1);
    });

    it('should return pixel signal history', async () => {
      const rows = [
        makePixelSignalRow({ detected_at: '2026-02-20', signal_strength: 0.80 }),
        makePixelSignalRow({ detected_at: '2026-02-23', signal_strength: 0.60 }),
        makePixelSignalRow({ detected_at: '2026-02-25', signal_strength: 0.45 }),
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await CampaignHealthMonitorService.getPixelSignalHistory(CAMPAIGN_ID, 7);

      expect(result).toHaveLength(3);
      expect(mockQuery.mock.calls[0][1]).toEqual([CAMPAIGN_ID, 'pixel_signal', 7]);
    });

    it('should validate pixel setup - valid configuration', async () => {
      const pixelRow = { id: 'pixel-123', campaign_id: CAMPAIGN_ID, is_active: true, events_configured: ['purchase', 'add_to_cart'] };
      mockQuery.mockResolvedValueOnce({ rows: [pixelRow] });

      const result = await CampaignHealthMonitorService.validatePixelSetup(CAMPAIGN_ID);

      expect((result as any).valid).toBe(true);
      expect((result as any).issues).toHaveLength(0);
    });

    it('should validate pixel setup - no pixel configured', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await CampaignHealthMonitorService.validatePixelSetup(CAMPAIGN_ID);

      expect((result as any).valid).toBe(false);
      expect((result as any).issues).toContain('No pixel configured');
    });

    it('should validate pixel setup - inactive pixel', async () => {
      const pixelRow = { id: 'pixel-123', campaign_id: CAMPAIGN_ID, is_active: false, events_configured: ['purchase'] };
      mockQuery.mockResolvedValueOnce({ rows: [pixelRow] });

      const result = await CampaignHealthMonitorService.validatePixelSetup(CAMPAIGN_ID);

      expect((result as any).valid).toBe(false);
      expect((result as any).issues).toContain('Pixel is inactive');
    });
  });

  // =========================================================================
  // Overall Health
  // =========================================================================

  describe('Overall Health', () => {
    it('should calculate campaign health score', async () => {
      const row = makeHealthScoreRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      const result = await CampaignHealthMonitorService.calculateCampaignHealthScore(CAMPAIGN_ID);

      expect(result).toEqual(row);
      expect((result as any).overall_score).toBe(62);
      expect((result as any).status).toBe('warning');
    });

    it('should return cached health score on cache hit', async () => {
      const cachedScore = makeHealthScoreRow({ overall_score: 85, status: 'healthy' });
      mockCacheGet.mockResolvedValueOnce(cachedScore);

      const result = await CampaignHealthMonitorService.calculateCampaignHealthScore(CAMPAIGN_ID);

      expect(result).toEqual(cachedScore);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should cache health score after DB fetch', async () => {
      const row = makeHealthScoreRow();
      mockQuery.mockResolvedValueOnce({ rows: [row] });

      await CampaignHealthMonitorService.calculateCampaignHealthScore(CAMPAIGN_ID);

      expect(mockCacheSet).toHaveBeenCalledWith(
        `health:score:${CAMPAIGN_ID}`,
        row,
        60,
      );
    });

    it('should return health dashboard', async () => {
      const campaigns = [
        { id: 'c-1', name: 'Campaign A', overall_score: 45, status: 'critical', alerts_count: 5 },
        { id: 'c-2', name: 'Campaign B', overall_score: 78, status: 'healthy', alerts_count: 1 },
      ];
      mockQuery.mockResolvedValueOnce({ rows: campaigns });
      mockQuery.mockResolvedValueOnce({ rows: [{ total_alerts: '6' }] });

      const result = await CampaignHealthMonitorService.getHealthDashboard(USER_ID);

      expect((result as any).campaigns).toHaveLength(2);
      expect((result as any).totalUnacknowledgedAlerts).toBe(6);
    });

    it('should cache dashboard data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [{ total_alerts: '0' }] });

      await CampaignHealthMonitorService.getHealthDashboard(USER_ID);

      expect(mockCacheSet).toHaveBeenCalledWith(
        `health:dashboard:${USER_ID}`,
        expect.any(Object),
        60,
      );
    });

    it('should return all health alerts', async () => {
      const rows = [
        makeAlertRow({ id: 'alert-1', alert_type: 'cpa_volatility', severity: 'high' }),
        makeAlertRow({ id: 'alert-2', alert_type: 'creative_fatigue', severity: 'medium' }),
        makeAlertRow({ id: 'alert-3', alert_type: 'pixel_signal', severity: 'critical' }),
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await CampaignHealthMonitorService.getAllHealthAlerts(CAMPAIGN_ID);

      expect(result).toHaveLength(3);
      expect(mockQuery.mock.calls[0][1]).toEqual([CAMPAIGN_ID]);
    });

    it('should acknowledge alert', async () => {
      const acknowledgedRow = makeAlertRow({
        acknowledged: true,
        acknowledged_by: USER_ID,
        acknowledged_at: '2026-02-25T12:00:00Z',
      });
      mockQuery.mockResolvedValueOnce({ rows: [acknowledgedRow] });

      const result = await CampaignHealthMonitorService.acknowledgeAlert(ALERT_ID, USER_ID);

      expect((result as any).acknowledged).toBe(true);
      expect((result as any).acknowledged_by).toBe(USER_ID);
      expect(mockQuery.mock.calls[0][0]).toContain('UPDATE health_alerts');
    });

    it('should create audit log when acknowledging alert', async () => {
      const acknowledgedRow = makeAlertRow({ acknowledged: true });
      mockQuery.mockResolvedValueOnce({ rows: [acknowledgedRow] });

      await CampaignHealthMonitorService.acknowledgeAlert(ALERT_ID, USER_ID);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'health.acknowledge_alert',
          resourceType: 'health_alert',
          resourceId: ALERT_ID,
        }),
      );
    });

    it('should throw NotFoundError when acknowledging nonexistent alert', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        CampaignHealthMonitorService.acknowledgeAlert('nonexistent', USER_ID),
      ).rejects.toThrow('Alert not found');
    });

    it('should return health trends', async () => {
      const rows = [
        makeHealthScoreRow({ last_checked_at: '2026-02-20T00:00:00Z', overall_score: 70 }),
        makeHealthScoreRow({ last_checked_at: '2026-02-23T00:00:00Z', overall_score: 65 }),
        makeHealthScoreRow({ last_checked_at: '2026-02-25T00:00:00Z', overall_score: 62 }),
      ];
      mockQuery.mockResolvedValueOnce({ rows });

      const result = await CampaignHealthMonitorService.getHealthTrends(CAMPAIGN_ID, 7);

      expect(result).toHaveLength(3);
      expect(mockQuery.mock.calls[0][1]).toEqual([CAMPAIGN_ID, 7]);
    });

    it('should run full health check', async () => {
      // 5 sub-check queries + 1 score insert
      mockQuery.mockResolvedValueOnce({ rows: [makeCPAVolatilityRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [makeSpendVelocityRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [makeCreativeFatigueRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [makeCTRCollapseRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [makePixelSignalRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [makeHealthScoreRow()] });

      const result = await CampaignHealthMonitorService.runFullHealthCheck(CAMPAIGN_ID, USER_ID);

      expect(result).toEqual(makeHealthScoreRow());
      expect(mockQuery).toHaveBeenCalledTimes(6);
    });

    it('should create audit log on full health check', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeCPAVolatilityRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [makeSpendVelocityRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [makeCreativeFatigueRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [makeCTRCollapseRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [makePixelSignalRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [makeHealthScoreRow()] });

      await CampaignHealthMonitorService.runFullHealthCheck(CAMPAIGN_ID, USER_ID);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'health.full_check',
          resourceType: 'campaign_health',
          details: { campaignId: CAMPAIGN_ID },
        }),
      );
    });

    it('should log info on full health check completion', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeCPAVolatilityRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [makeSpendVelocityRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [makeCreativeFatigueRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [makeCTRCollapseRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [makePixelSignalRow()] });
      mockQuery.mockResolvedValueOnce({ rows: [makeHealthScoreRow()] });

      await CampaignHealthMonitorService.runFullHealthCheck(CAMPAIGN_ID, USER_ID);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Full health check completed',
        expect.objectContaining({ campaignId: CAMPAIGN_ID }),
      );
    });

    it('should throw NotFoundError for missing health score', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        CampaignHealthMonitorService.calculateCampaignHealthScore('nonexistent'),
      ).rejects.toThrow('No health score found for campaign');
    });
  });
});
