/**
 * BudgetRepository – Data-access layer for the `budget_allocations` table.
 *
 * Extends BaseRepository with budget-specific query methods such as
 * filtering by country, date period, and creator. Handles the JSONB
 * `channel_allocations` and `risk_guardrails` columns.
 */

import { PoolClient } from 'pg';
import { pool } from '../config/database';
import { BaseRepository } from './BaseRepository';

// ---------------------------------------------------------------------------
// Entity type
// ---------------------------------------------------------------------------

export interface BudgetAllocation {
  id: string;
  countryId: string;
  channelAllocations: Record<string, number>;
  periodStart: string;
  periodEnd: string;
  totalBudget: number;
  totalSpent: number;
  riskGuardrails: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class BudgetRepository extends BaseRepository<BudgetAllocation> {
  constructor() {
    super('budget_allocations');
  }

  // -----------------------------------------------------------------------
  // Entity-specific queries
  // -----------------------------------------------------------------------

  /**
   * Find all budget allocations for a specific country.
   */
  async findByCountryId(
    countryId: string,
    client?: PoolClient,
  ): Promise<BudgetAllocation[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM budget_allocations
       WHERE country_id = $1
       ORDER BY period_start DESC`,
      [countryId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all budget allocations created by a specific user.
   */
  async findByCreatedBy(
    userId: string,
    client?: PoolClient,
  ): Promise<BudgetAllocation[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM budget_allocations
       WHERE created_by = $1
       ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find all budget allocations that overlap with a given date.
   */
  async findByPeriod(
    date: string,
    client?: PoolClient,
  ): Promise<BudgetAllocation[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM budget_allocations
       WHERE period_start <= $1::date AND period_end >= $1::date
       ORDER BY period_start DESC`,
      [date],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find budget allocations whose period overlaps a date range.
   */
  async findByDateRange(
    startDate: string,
    endDate: string,
    client?: PoolClient,
  ): Promise<BudgetAllocation[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM budget_allocations
       WHERE period_start <= $2::date AND period_end >= $1::date
       ORDER BY period_start DESC`,
      [startDate, endDate],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find allocations for a specific country within a date range.
   */
  async findByCountryAndDateRange(
    countryId: string,
    startDate: string,
    endDate: string,
    client?: PoolClient,
  ): Promise<BudgetAllocation[]> {
    const db = client || pool;
    const result = await db.query(
      `SELECT * FROM budget_allocations
       WHERE country_id = $1
         AND period_start <= $3::date
         AND period_end >= $2::date
       ORDER BY period_start DESC`,
      [countryId, startDate, endDate],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  // -----------------------------------------------------------------------
  // Row mapping
  // -----------------------------------------------------------------------

  protected mapRow(row: Record<string, unknown>): BudgetAllocation {
    return {
      id: row.id as string,
      countryId: (row.country_id as string) ?? '',
      channelAllocations:
        (row.channel_allocations as Record<string, number>) ?? {},
      periodStart: (row.period_start as string) ?? '',
      periodEnd: (row.period_end as string) ?? '',
      totalBudget: Number(row.total_budget ?? 0),
      totalSpent: Number(row.total_spent ?? 0),
      riskGuardrails:
        (row.risk_guardrails as Record<string, unknown>) ?? {},
      createdBy: (row.created_by as string) ?? '',
      createdAt: (row.created_at as string) ?? '',
      updatedAt: (row.updated_at as string) ?? '',
    };
  }
}
