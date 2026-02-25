/**
 * Health Monitor Service -- Facade for the controller layer (Phase 7E).
 *
 * Delegates to CampaignHealthMonitorService but exposes the method
 * signatures that the advanced-ai controller expects.
 */

import { CampaignHealthMonitorService } from './CampaignHealthMonitorService';
import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { generateId } from '../../utils/helpers';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { AuditService } from '../audit.service';

export class HealthMonitorService {
  // ---------------------------------------------------------------------------
  // Campaign Health Score
  // ---------------------------------------------------------------------------

  static async getCampaignHealthScore(campaignId: string) {
    return CampaignHealthMonitorService.checkCampaignHealth(campaignId);
  }

  // ---------------------------------------------------------------------------
  // Individual Metric Checks
  // ---------------------------------------------------------------------------

  static async checkCpaVolatility(campaignId: string) {
    return CampaignHealthMonitorService.detectCPAVolatility(campaignId);
  }

  static async checkSpendVelocity(campaignId: string) {
    return CampaignHealthMonitorService.detectSpendVelocityAnomaly(campaignId);
  }

  static async checkCreativeFatigue(campaignId: string) {
    return CampaignHealthMonitorService.scoreCreativeFatigue(campaignId);
  }

  static async checkCtrCollapse(campaignId: string) {
    return CampaignHealthMonitorService.detectCTRCollapse(campaignId);
  }

  static async checkPixelSignal(campaignId: string) {
    return CampaignHealthMonitorService.checkPixelHealth(campaignId);
  }

  // ---------------------------------------------------------------------------
  // Full Health Check
  // ---------------------------------------------------------------------------

  static async runFullHealthCheck(campaignId: string, thresholds?: Record<string, unknown>) {
    if (thresholds) {
      await CampaignHealthMonitorService.updateHealthConfig(thresholds as any);
    }
    return CampaignHealthMonitorService.checkCampaignHealth(campaignId);
  }

  // ---------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------

  static async getDashboard() {
    return CampaignHealthMonitorService.getHealthDashboard();
  }

  // ---------------------------------------------------------------------------
  // Alerts
  // ---------------------------------------------------------------------------

  static async getAlerts(filters: {
    severity?: string;
    campaignId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters.severity) {
      conditions.push(`severity = $${idx++}`);
      params.push(filters.severity);
    }
    if (filters.campaignId) {
      conditions.push(`campaign_id = $${idx++}`);
      params.push(filters.campaignId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM health_alerts ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const dataResult = await pool.query(
      `SELECT * FROM health_alerts ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset],
    );

    return {
      data: dataResult.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  static async acknowledgeAlert(alertId: string, userId: string, note?: string) {
    const alert = await CampaignHealthMonitorService.acknowledgeAlert(alertId, userId);

    if (note) {
      await pool.query(
        `UPDATE health_alerts SET notes = $1 WHERE id = $2`,
        [note, alertId],
      );
    }

    await AuditService.log({
      userId,
      action: 'health.acknowledge_alert',
      resourceType: 'health_alert',
      resourceId: alertId,
      details: { note },
    });

    return alert;
  }

  // ---------------------------------------------------------------------------
  // Health Trends
  // ---------------------------------------------------------------------------

  static async getHealthTrends(filters: {
    campaignId?: string;
    metric?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters.campaignId) {
      conditions.push(`campaign_id = $${idx++}`);
      params.push(filters.campaignId);
    }
    if (filters.startDate) {
      conditions.push(`checked_at >= $${idx++}`);
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push(`checked_at <= $${idx++}`);
      params.push(filters.endDate);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT * FROM campaign_health_scores ${where} ORDER BY checked_at ASC`,
      params,
    );

    return {
      metric: filters.metric || 'overall_health',
      dataPoints: rows.length,
      data: rows,
    };
  }

  // ---------------------------------------------------------------------------
  // Health Thresholds
  // ---------------------------------------------------------------------------

  static async setThresholds(thresholds: Record<string, unknown>, userId: string) {
    const config = await CampaignHealthMonitorService.updateHealthConfig(thresholds as any);

    await AuditService.log({
      userId,
      action: 'health.update_thresholds',
      resourceType: 'health_config',
      details: { thresholds },
    });

    return config;
  }
}
