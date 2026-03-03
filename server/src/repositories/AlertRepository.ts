/**
 * AlertRepository – Data-access layer for the `fraud_alerts` table.
 *
 * Extends BaseRepository with alert-specific query methods such as
 * filtering by status, severity, campaign, and retrieving active
 * (non-resolved/dismissed) alerts prioritised by severity.
 */

import { PoolClient } from 'pg';
import { pool } from '../config/database';
import { BaseRepository } from './BaseRepository';

// ---------------------------------------------------------------------------
// Entity type
// ---------------------------------------------------------------------------

export interface FraudAlert {
  id: string;
  type: string;
  campaignId: string | null;
  severity: string;
  confidenceScore: number;
  status: string;
  details: Record<string, unknown>;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class AlertRepository extends BaseRepository<FraudAlert> {
  constructor() {
    super('fraud_alerts');
  }

  // -----------------------------------------------------------------------
  // Entity-specific queries
  // -----------------------------------------------------------------------

  /**
   * Find all alerts for a specific campaign.
   */
  async findByCampaignId(
    campaignId: string,
    client?: PoolClient,
  ): Promise<FraudAlert[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM fraud_alerts
       WHERE campaign_id = $1
       ORDER BY created_at DESC`,
      [campaignId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all alerts with a given status.
   */
  async findByStatus(status: string, client?: PoolClient): Promise<FraudAlert[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM fraud_alerts WHERE status = $1 ORDER BY created_at DESC`,
      [status],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all alerts with a given severity.
   */
  async findBySeverity(severity: string, client?: PoolClient): Promise<FraudAlert[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM fraud_alerts WHERE severity = $1 ORDER BY created_at DESC`,
      [severity],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Retrieve all non-resolved, non-dismissed alerts ordered by severity
   * priority: critical > high > medium > low.
   */
  async findActive(client?: PoolClient): Promise<FraudAlert[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM fraud_alerts
       WHERE status NOT IN ('resolved', 'dismissed')
       ORDER BY
         CASE severity
           WHEN 'critical' THEN 1
           WHEN 'high'     THEN 2
           WHEN 'medium'   THEN 3
           WHEN 'low'      THEN 4
           ELSE 5
         END,
         created_at DESC`,
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find alerts of a specific type.
   */
  async findByType(type: string, client?: PoolClient): Promise<FraudAlert[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM fraud_alerts WHERE type = $1 ORDER BY created_at DESC`,
      [type],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Count alerts grouped by status.
   */
  async countByStatus(client?: PoolClient): Promise<Record<string, number>> {
    const db = client || pool;
    const result = await db.query(
      `SELECT status, COUNT(*)::int AS count
       FROM fraud_alerts
       GROUP BY status`,
    );
    const counts: Record<string, number> = {};
    for (const row of result.rows) {
      counts[row.status] = row.count;
    }
    return counts;
  }

  /**
   * Count alerts grouped by severity.
   */
  async countBySeverity(client?: PoolClient): Promise<Record<string, number>> {
    const db = client || pool;
    const result = await db.query(
      `SELECT severity, COUNT(*)::int AS count
       FROM fraud_alerts
       GROUP BY severity`,
    );
    const counts: Record<string, number> = {};
    for (const row of result.rows) {
      counts[row.severity] = row.count;
    }
    return counts;
  }

  // -----------------------------------------------------------------------
  // Row mapping
  // -----------------------------------------------------------------------

  protected mapRow(row: Record<string, unknown>): FraudAlert {
    return {
      id: row.id as string,
      type: (row.type as string) ?? '',
      campaignId: (row.campaign_id as string) ?? null,
      severity: (row.severity as string) ?? 'medium',
      confidenceScore: Number(row.confidence_score ?? 0),
      status: (row.status as string) ?? 'open',
      details: (row.details as Record<string, unknown>) ?? {},
      resolvedBy: (row.resolved_by as string) ?? null,
      resolvedAt: (row.resolved_at as string) ?? null,
      createdAt: (row.created_at as string) ?? '',
    };
  }
}
