/**
 * CreativeRepository – Data-access layer for the `creatives` table.
 *
 * Extends BaseRepository with creative-specific query methods such as
 * filtering by campaign, type, active status, and fatigue score threshold.
 */

import { PoolClient } from 'pg';
import { pool } from '../config/database';
import { BaseRepository } from './BaseRepository';

// ---------------------------------------------------------------------------
// Entity type
// ---------------------------------------------------------------------------

export interface Creative {
  id: string;
  name: string;
  type: string;
  campaignId: string;
  content: string | null;
  mediaUrls: unknown[];
  performance: Record<string, unknown>;
  fatigueScore: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class CreativeRepository extends BaseRepository<Creative> {
  constructor() {
    super('creatives');
  }

  // -----------------------------------------------------------------------
  // Entity-specific queries
  // -----------------------------------------------------------------------

  /**
   * Find all creatives belonging to a specific campaign.
   */
  async findByCampaignId(campaignId: string, client?: PoolClient): Promise<Creative[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM creatives WHERE campaign_id = $1 ORDER BY created_at DESC`,
      [campaignId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all creatives of a given type (e.g. 'video', 'image', 'text').
   */
  async findByType(type: string, client?: PoolClient): Promise<Creative[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM creatives WHERE type = $1 ORDER BY created_at DESC`,
      [type],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all active or inactive creatives.
   */
  async findByActiveStatus(isActive: boolean, client?: PoolClient): Promise<Creative[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM creatives WHERE is_active = $1 ORDER BY created_at DESC`,
      [isActive],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all active creatives whose fatigue score meets or exceeds the
   * given threshold.
   */
  async findByFatigueThreshold(
    threshold: number,
    client?: PoolClient,
  ): Promise<Creative[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM creatives
       WHERE fatigue_score >= $1 AND is_active = true
       ORDER BY fatigue_score DESC`,
      [threshold],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all active creatives for a campaign.
   */
  async findActiveByCampaignId(
    campaignId: string,
    client?: PoolClient,
  ): Promise<Creative[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM creatives
       WHERE campaign_id = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [campaignId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  // -----------------------------------------------------------------------
  // Row mapping
  // -----------------------------------------------------------------------

  protected mapRow(row: Record<string, unknown>): Creative {
    return {
      id: row.id as string,
      name: (row.name as string) ?? '',
      type: (row.type as string) ?? '',
      campaignId: (row.campaign_id as string) ?? '',
      content: (row.content as string) ?? null,
      mediaUrls: (row.media_urls as unknown[]) ?? [],
      performance: (row.performance as Record<string, unknown>) ?? {},
      fatigueScore: Number(row.fatigue_score ?? 0),
      isActive: (row.is_active as boolean) ?? true,
      createdAt: (row.created_at as string) ?? '',
      updatedAt: (row.updated_at as string) ?? '',
    };
  }
}
