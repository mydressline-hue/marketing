/**
 * CountryRepository – Data-access layer for the `countries` table.
 *
 * Extends BaseRepository with country-specific query methods such as lookup
 * by ISO code, filtering by region or active status, and retrieving top
 * countries by opportunity score.
 */

import { PoolClient } from 'pg';
import { pool } from '../config/database';
import { BaseRepository } from './BaseRepository';

// ---------------------------------------------------------------------------
// Entity type
// ---------------------------------------------------------------------------

export interface Country {
  id: string;
  name: string;
  code: string;
  region: string | null;
  language: string | null;
  currency: string | null;
  timezone: string | null;
  gdp: number | null;
  internetPenetration: number | null;
  ecommerceAdoption: number | null;
  socialPlatforms: Record<string, unknown>;
  adCosts: Record<string, unknown>;
  culturalBehavior: Record<string, unknown>;
  opportunityScore: number | null;
  entryStrategy: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class CountryRepository extends BaseRepository<Country> {
  constructor() {
    super('countries');
  }

  // -----------------------------------------------------------------------
  // Entity-specific queries
  // -----------------------------------------------------------------------

  /**
   * Find a country by its ISO 3166-1 alpha-2 code (case-insensitive).
   */
  async findByCode(code: string, client?: PoolClient): Promise<Country | null> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM countries WHERE code = $1`,
      [code.toUpperCase()],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find all countries in a given region.
   */
  async findByRegion(region: string, client?: PoolClient): Promise<Country[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM countries WHERE region = $1 ORDER BY name ASC`,
      [region],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all active or inactive countries.
   */
  async findByActiveStatus(isActive: boolean, client?: PoolClient): Promise<Country[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM countries WHERE is_active = $1 ORDER BY name ASC`,
      [isActive],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Return the top N countries ordered by opportunity_score descending.
   * Only includes active countries with a non-null score.
   */
  async findTopByOpportunityScore(
    limit: number = 10,
    client?: PoolClient,
  ): Promise<Country[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM countries
       WHERE is_active = true AND opportunity_score IS NOT NULL
       ORDER BY opportunity_score DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all countries whose opportunity score meets or exceeds the threshold.
   */
  async findByMinOpportunityScore(
    minScore: number,
    client?: PoolClient,
  ): Promise<Country[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM countries
       WHERE opportunity_score >= $1
       ORDER BY opportunity_score DESC`,
      [minScore],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  // -----------------------------------------------------------------------
  // Row mapping
  // -----------------------------------------------------------------------

  protected mapRow(row: Record<string, unknown>): Country {
    return {
      id: row.id as string,
      name: (row.name as string) ?? '',
      code: (row.code as string) ?? '',
      region: (row.region as string) ?? null,
      language: (row.language as string) ?? null,
      currency: (row.currency as string) ?? null,
      timezone: (row.timezone as string) ?? null,
      gdp: row.gdp != null ? Number(row.gdp) : null,
      internetPenetration:
        row.internet_penetration != null
          ? Number(row.internet_penetration)
          : null,
      ecommerceAdoption:
        row.ecommerce_adoption != null
          ? Number(row.ecommerce_adoption)
          : null,
      socialPlatforms: (row.social_platforms as Record<string, unknown>) ?? {},
      adCosts: (row.ad_costs as Record<string, unknown>) ?? {},
      culturalBehavior: (row.cultural_behavior as Record<string, unknown>) ?? {},
      opportunityScore:
        row.opportunity_score != null ? Number(row.opportunity_score) : null,
      entryStrategy: (row.entry_strategy as string) ?? null,
      isActive: (row.is_active as boolean) ?? true,
      createdAt: (row.created_at as string) ?? '',
      updatedAt: (row.updated_at as string) ?? '',
    };
  }
}
