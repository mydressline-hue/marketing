/**
 * CampaignRepository – Data-access layer for the `campaigns` table.
 *
 * Extends BaseRepository with campaign-specific query methods such as
 * filtering by user, country, platform, or status. The `mapRow` method
 * converts snake_case database columns to typed Campaign entities,
 * handling nullable fields gracefully.
 */

import { PoolClient } from 'pg';
import { pool } from '../config/database';
import { BaseRepository } from './BaseRepository';

// ---------------------------------------------------------------------------
// Entity type
// ---------------------------------------------------------------------------

export interface Campaign {
  id: string;
  name: string;
  countryId: string;
  countryName: string | null;
  platform: string;
  type: string;
  status: string;
  budget: number;
  spent: number;
  startDate: string | null;
  endDate: string | null;
  targeting: Record<string, unknown>;
  metrics: Record<string, unknown>;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class CampaignRepository extends BaseRepository<Campaign> {
  constructor() {
    super('campaigns');
  }

  // -----------------------------------------------------------------------
  // Entity-specific queries
  // -----------------------------------------------------------------------

  /**
   * Find all campaigns created by a specific user, ordered newest-first.
   */
  async findByUserId(userId: string, client?: PoolClient): Promise<Campaign[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT c.*, co.name AS country_name
       FROM campaigns c
       LEFT JOIN countries co ON co.id = c.country_id
       WHERE c.created_by = $1
       ORDER BY c.created_at DESC`,
      [userId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all campaigns associated with a given country.
   */
  async findByCountryId(countryId: string, client?: PoolClient): Promise<Campaign[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT c.*, co.name AS country_name
       FROM campaigns c
       LEFT JOIN countries co ON co.id = c.country_id
       WHERE c.country_id = $1
       ORDER BY c.created_at DESC`,
      [countryId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all campaigns on a given platform.
   */
  async findByPlatform(platform: string, client?: PoolClient): Promise<Campaign[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT c.*, co.name AS country_name
       FROM campaigns c
       LEFT JOIN countries co ON co.id = c.country_id
       WHERE c.platform = $1
       ORDER BY c.created_at DESC`,
      [platform],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all campaigns with a given status.
   */
  async findByStatus(status: string, client?: PoolClient): Promise<Campaign[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT c.*, co.name AS country_name
       FROM campaigns c
       LEFT JOIN countries co ON co.id = c.country_id
       WHERE c.status = $1
       ORDER BY c.created_at DESC`,
      [status],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find a campaign by ID with the country name JOINed.
   */
  async findByIdWithCountry(id: string, client?: PoolClient): Promise<Campaign | null> {
    const db = client || pool;
    const result = await db.query(
      `SELECT c.*, co.name AS country_name
       FROM campaigns c
       LEFT JOIN countries co ON co.id = c.country_id
       WHERE c.id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Count campaigns grouped by status.
   */
  async countByStatus(client?: PoolClient): Promise<Record<string, number>> {
    const db = client || pool;
    const result = await db.query(
      `SELECT status, COUNT(*)::int AS count
       FROM campaigns
       GROUP BY status`,
    );
    const counts: Record<string, number> = {};
    for (const row of result.rows) {
      counts[row.status] = row.count;
    }
    return counts;
  }

  // -----------------------------------------------------------------------
  // Row mapping
  // -----------------------------------------------------------------------

  protected mapRow(row: Record<string, unknown>): Campaign {
    return {
      id: row.id as string,
      name: (row.name as string) ?? '',
      countryId: (row.country_id as string) ?? '',
      countryName: (row.country_name as string) ?? null,
      platform: (row.platform as string) ?? '',
      type: (row.type as string) ?? '',
      status: (row.status as string) ?? 'draft',
      budget: Number(row.budget ?? 0),
      spent: Number(row.spent ?? 0),
      startDate: (row.start_date as string) ?? null,
      endDate: (row.end_date as string) ?? null,
      targeting: (row.targeting as Record<string, unknown>) ?? {},
      metrics: (row.metrics as Record<string, unknown>) ?? {},
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
      conversions: Number(row.conversions ?? 0),
      revenue: Number(row.revenue ?? 0),
      createdBy: (row.created_by as string) ?? '',
      createdAt: (row.created_at as string) ?? '',
      updatedAt: (row.updated_at as string) ?? '',
    };
  }
}
