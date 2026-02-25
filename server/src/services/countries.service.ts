/**
 * Countries Service.
 *
 * Provides static methods for managing country records used in market
 * expansion analysis. Supports CRUD operations, Redis caching, pagination,
 * filtering, and opportunity-score computation based on economic and
 * digital-adoption indicators.
 */

import { pool } from '../config/database';
import { cacheGet, cacheSet, cacheDel, cacheFlush } from '../config/redis';
import { logger } from '../utils/logger';
import { NotFoundError } from '../utils/errors';
import type { CreateCountryInput } from '../validators/schemas';

// ---------------------------------------------------------------------------
// Types
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
  internet_penetration: number | null;
  ecommerce_adoption: number | null;
  social_platforms: Record<string, unknown>;
  ad_costs: Record<string, unknown>;
  cultural_behavior: Record<string, unknown>;
  opportunity_score: number | null;
  entry_strategy: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResult {
  data: Country[];
  total: number;
  page: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Cache key helpers
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'countries';
const CACHE_TTL = 300; // seconds

function listCacheKey(
  filters: Record<string, unknown>,
  pagination: Record<string, unknown>,
): string {
  return `${CACHE_PREFIX}:list:${JSON.stringify(filters)}:${JSON.stringify(pagination)}`;
}

function byIdCacheKey(id: string): string {
  return `${CACHE_PREFIX}:id:${id}`;
}

function byCodeCacheKey(code: string): string {
  return `${CACHE_PREFIX}:code:${code.toUpperCase()}`;
}

function topCacheKey(limit: number): string {
  return `${CACHE_PREFIX}:top:${limit}`;
}

// ---------------------------------------------------------------------------
// Allowed sort columns (whitelist to prevent SQL injection)
// ---------------------------------------------------------------------------

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  name: 'name',
  code: 'code',
  region: 'region',
  opportunity_score: 'opportunity_score',
  gdp: 'gdp',
  created_at: 'created_at',
  updated_at: 'updated_at',
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CountriesService {
  /**
   * List countries with optional filtering, sorting, and pagination.
   * Results are cached in Redis with a 300-second TTL.
   */
  static async list(
    filters?: { region?: string; isActive?: boolean; minScore?: number },
    pagination?: {
      page: number;
      limit: number;
      sortBy?: string;
      sortOrder?: string;
    },
  ): Promise<PaginatedResult> {
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;
    const sortBy = pagination?.sortBy ?? 'created_at';
    const sortOrder =
      pagination?.sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const offset = (page - 1) * limit;

    // Attempt cache hit
    const cacheKey = listCacheKey(filters ?? {}, { page, limit, sortBy, sortOrder });
    const cached = await cacheGet<PaginatedResult>(cacheKey);

    if (cached) {
      logger.debug('Countries list cache hit', { cacheKey });
      return cached;
    }

    // Build dynamic WHERE clause
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters?.region !== undefined) {
      conditions.push(`region = $${paramIndex++}`);
      params.push(filters.region);
    }

    if (filters?.isActive !== undefined) {
      conditions.push(`is_active = $${paramIndex++}`);
      params.push(filters.isActive);
    }

    if (filters?.minScore !== undefined) {
      conditions.push(`opportunity_score >= $${paramIndex++}`);
      params.push(filters.minScore);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Resolve sort column (default to created_at if invalid)
    const sortColumn = ALLOWED_SORT_COLUMNS[sortBy] ?? 'created_at';

    // Count total matching rows
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM countries ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Fetch the page
    const dataResult = await pool.query<Country>(
      `SELECT * FROM countries ${whereClause}
       ORDER BY ${sortColumn} ${sortOrder}
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    const result: PaginatedResult = {
      data: dataResult.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };

    // Store in cache
    await cacheSet(cacheKey, result, CACHE_TTL);
    logger.debug('Countries list cached', { cacheKey });

    return result;
  }

  /**
   * Retrieve a single country by its UUID.
   * Result is cached in Redis.
   */
  static async getById(id: string): Promise<Country> {
    const cacheKey = byIdCacheKey(id);
    const cached = await cacheGet<Country>(cacheKey);

    if (cached) {
      logger.debug('Country cache hit (by id)', { id });
      return cached;
    }

    const result = await pool.query<Country>(
      'SELECT * FROM countries WHERE id = $1',
      [id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Country with id "${id}" not found`);
    }

    const country = result.rows[0];
    await cacheSet(cacheKey, country, CACHE_TTL);

    return country;
  }

  /**
   * Retrieve a single country by its ISO 3166-1 alpha-2 code.
   */
  static async getByCode(code: string): Promise<Country> {
    const normalizedCode = code.toUpperCase();
    const cacheKey = byCodeCacheKey(normalizedCode);
    const cached = await cacheGet<Country>(cacheKey);

    if (cached) {
      logger.debug('Country cache hit (by code)', { code: normalizedCode });
      return cached;
    }

    const result = await pool.query<Country>(
      'SELECT * FROM countries WHERE code = $1',
      [normalizedCode],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Country with code "${normalizedCode}" not found`);
    }

    const country = result.rows[0];
    await cacheSet(cacheKey, country, CACHE_TTL);

    return country;
  }

  /**
   * Insert a new country row. Invalidates list caches afterward.
   */
  static async create(data: CreateCountryInput): Promise<Country> {
    const result = await pool.query<Country>(
      `INSERT INTO countries (name, code, region, language, currency, timezone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.name, data.code.toUpperCase(), data.region, data.language, data.currency, data.timezone],
    );

    const country = result.rows[0];

    // Invalidate caches
    await cacheFlush(`${CACHE_PREFIX}:*`);
    logger.info('Country created', { id: country.id, code: country.code });

    return country;
  }

  /**
   * Update an existing country. Invalidates caches afterward.
   */
  static async update(
    id: string,
    data: Partial<CreateCountryInput>,
  ): Promise<Country> {
    // Ensure the country exists first
    await CountriesService.getById(id);

    const fields: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      params.push(data.name);
    }
    if (data.code !== undefined) {
      fields.push(`code = $${paramIndex++}`);
      params.push(data.code.toUpperCase());
    }
    if (data.region !== undefined) {
      fields.push(`region = $${paramIndex++}`);
      params.push(data.region);
    }
    if (data.language !== undefined) {
      fields.push(`language = $${paramIndex++}`);
      params.push(data.language);
    }
    if (data.currency !== undefined) {
      fields.push(`currency = $${paramIndex++}`);
      params.push(data.currency);
    }
    if (data.timezone !== undefined) {
      fields.push(`timezone = $${paramIndex++}`);
      params.push(data.timezone);
    }

    if (fields.length === 0) {
      return CountriesService.getById(id);
    }

    params.push(id);

    const result = await pool.query<Country>(
      `UPDATE countries SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params,
    );

    const country = result.rows[0];

    // Invalidate caches
    await cacheFlush(`${CACHE_PREFIX}:*`);
    logger.info('Country updated', { id: country.id, code: country.code });

    return country;
  }

  /**
   * Soft-delete a country by setting is_active = false.
   * Invalidates caches afterward.
   */
  static async delete(id: string): Promise<void> {
    // Ensure the country exists
    await CountriesService.getById(id);

    await pool.query(
      'UPDATE countries SET is_active = false WHERE id = $1',
      [id],
    );

    // Invalidate caches
    await cacheFlush(`${CACHE_PREFIX}:*`);
    logger.info('Country soft-deleted', { id });
  }

  /**
   * Calculate an opportunity score for a country based on GDP,
   * internet penetration, e-commerce adoption, and ad costs.
   *
   * The score is persisted to the database and returned alongside
   * the individual factor weights.
   */
  static async calculateOpportunityScore(
    id: string,
  ): Promise<{ score: number; factors: Record<string, number> }> {
    const country = await CountriesService.getById(id);

    // ---------- Factor weights ----------
    const GDP_WEIGHT = 0.3;
    const INTERNET_WEIGHT = 0.25;
    const ECOMMERCE_WEIGHT = 0.25;
    const AD_COST_WEIGHT = 0.2;

    // Normalise GDP to 0-100 range (cap at 5 trillion USD)
    const gdpValue = Number(country.gdp) || 0;
    const gdpNormalized = Math.min(gdpValue / 5_000_000_000_000, 1) * 100;

    // Internet penetration is already 0-100
    const internetValue = Number(country.internet_penetration) || 0;

    // E-commerce adoption is already 0-100
    const ecommerceValue = Number(country.ecommerce_adoption) || 0;

    // Ad cost efficiency: lower costs = higher score
    // Extract average CPM from ad_costs JSON, default to 50 if absent
    const adCosts = country.ad_costs as Record<string, unknown>;
    const avgCpm = Number(adCosts?.avg_cpm) || 50;
    const adCostScore = Math.max(0, 100 - avgCpm);

    const factors: Record<string, number> = {
      gdp: Math.round(gdpNormalized * 100) / 100,
      internet_penetration: Math.round(internetValue * 100) / 100,
      ecommerce_adoption: Math.round(ecommerceValue * 100) / 100,
      ad_cost_efficiency: Math.round(adCostScore * 100) / 100,
    };

    const score =
      Math.round(
        (gdpNormalized * GDP_WEIGHT +
          internetValue * INTERNET_WEIGHT +
          ecommerceValue * ECOMMERCE_WEIGHT +
          adCostScore * AD_COST_WEIGHT) *
          100,
      ) / 100;

    // Persist the computed score
    await pool.query(
      'UPDATE countries SET opportunity_score = $1 WHERE id = $2',
      [score, id],
    );

    // Invalidate caches
    await cacheFlush(`${CACHE_PREFIX}:*`);
    logger.info('Opportunity score calculated', { id, score });

    return { score, factors };
  }

  /**
   * Return the top N countries ordered by opportunity_score descending.
   */
  static async getTopCountries(limit: number = 10): Promise<Country[]> {
    const cacheKey = topCacheKey(limit);
    const cached = await cacheGet<Country[]>(cacheKey);

    if (cached) {
      logger.debug('Top countries cache hit', { limit });
      return cached;
    }

    const result = await pool.query<Country>(
      `SELECT * FROM countries
       WHERE is_active = true AND opportunity_score IS NOT NULL
       ORDER BY opportunity_score DESC
       LIMIT $1`,
      [limit],
    );

    await cacheSet(cacheKey, result.rows, CACHE_TTL);
    logger.debug('Top countries cached', { limit });

    return result.rows;
  }
}
