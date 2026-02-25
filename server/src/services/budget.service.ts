/**
 * Budget allocation service.
 *
 * Manages budget allocations across countries and channels, tracks spend,
 * provides aggregated summaries, and enforces risk guardrails. All mutations
 * are audited via the `audit_logs` table.
 */

import { query } from '../config/database';
import { NotFoundError, ValidationError } from '../utils/errors';
import { generateId } from '../utils/helpers';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BudgetAllocation {
  id: string;
  country_id: string;
  channel_allocations: Record<string, number>;
  period_start: string;
  period_end: string;
  total_budget: number;
  total_spent: number;
  risk_guardrails: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface BudgetFilters {
  countryId?: string;
  period?: string;
}

export interface Pagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult {
  data: BudgetAllocation[];
  total: number;
  page: number;
  totalPages: number;
}

export interface SpendByCountry {
  countryId: string;
  countryName: string;
  totalBudget: number;
  totalSpent: number;
}

export interface SpendByChannel {
  channel: string;
  totalBudget: number;
  totalSpent: number;
}

export interface GuardrailResult {
  passed: boolean;
  violations: string[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class BudgetService {
  /**
   * List budget allocations with optional filtering by `countryId` and
   * `period` (matched against period_start). Returns a paginated result set.
   */
  static async list(
    filters: BudgetFilters = {},
    pagination: Pagination = { page: 1, limit: 20 },
  ): Promise<PaginatedResult> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.countryId) {
      conditions.push(`country_id = $${paramIndex++}`);
      params.push(filters.countryId);
    }

    if (filters.period) {
      conditions.push(`period_start <= $${paramIndex}::date AND period_end >= $${paramIndex}::date`);
      params.push(filters.period);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sortColumn = pagination.sortBy ?? 'created_at';
    const sortDirection = pagination.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const offset = (pagination.page - 1) * pagination.limit;

    // Total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM budget_allocations ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Data page
    const dataResult = await query<BudgetAllocation>(
      `SELECT * FROM budget_allocations ${whereClause}
       ORDER BY ${sortColumn} ${sortDirection}
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, pagination.limit, offset],
    );

    return {
      data: dataResult.rows,
      total,
      page: pagination.page,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  /**
   * Retrieve a single budget allocation by its primary key.
   */
  static async getById(id: string): Promise<BudgetAllocation> {
    const result = await query<BudgetAllocation>(
      'SELECT * FROM budget_allocations WHERE id = $1',
      [id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Budget allocation not found: ${id}`);
    }

    return result.rows[0];
  }

  /**
   * Create a new budget allocation.
   *
   * Validates that the `total_budget` matches the sum of individual channel
   * allocations supplied in `channelAllocations`.
   */
  static async create(
    data: {
      countryId: string;
      channelAllocations: Record<string, number>;
      periodStart: string;
      periodEnd: string;
      totalBudget: number;
      riskGuardrails?: Record<string, unknown>;
    },
    userId: string,
  ): Promise<BudgetAllocation> {
    // Validate: total_budget must equal sum of channel allocations
    const channelSum = Object.values(data.channelAllocations).reduce(
      (sum, amount) => sum + amount,
      0,
    );

    if (Math.abs(data.totalBudget - channelSum) > 0.01) {
      throw new ValidationError(
        `Total budget (${data.totalBudget}) does not match sum of channel allocations (${channelSum})`,
      );
    }

    const id = generateId();

    const result = await query<BudgetAllocation>(
      `INSERT INTO budget_allocations
         (id, country_id, channel_allocations, period_start, period_end, total_budget, total_spent, risk_guardrails, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8)
       RETURNING *`,
      [
        id,
        data.countryId,
        JSON.stringify(data.channelAllocations),
        data.periodStart,
        data.periodEnd,
        data.totalBudget,
        JSON.stringify(data.riskGuardrails ?? {}),
        userId,
      ],
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        generateId(),
        userId,
        'budget_allocation.create',
        'budget_allocation',
        id,
        JSON.stringify({ totalBudget: data.totalBudget, countryId: data.countryId }),
      ],
    );

    logger.info('Budget allocation created', { allocationId: id, userId });
    return result.rows[0];
  }

  /**
   * Update an existing budget allocation.
   */
  static async update(
    id: string,
    data: {
      channelAllocations?: Record<string, number>;
      periodStart?: string;
      periodEnd?: string;
      totalBudget?: number;
      riskGuardrails?: Record<string, unknown>;
    },
    userId: string,
  ): Promise<BudgetAllocation> {
    // Ensure the allocation exists
    await BudgetService.getById(id);

    // If both totalBudget and channelAllocations are provided, validate sum
    if (data.totalBudget !== undefined && data.channelAllocations !== undefined) {
      const channelSum = Object.values(data.channelAllocations).reduce(
        (sum, amount) => sum + amount,
        0,
      );

      if (Math.abs(data.totalBudget - channelSum) > 0.01) {
        throw new ValidationError(
          `Total budget (${data.totalBudget}) does not match sum of channel allocations (${channelSum})`,
        );
      }
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (data.channelAllocations !== undefined) {
      fields.push(`channel_allocations = $${paramIndex++}`);
      params.push(JSON.stringify(data.channelAllocations));
    }
    if (data.periodStart !== undefined) {
      fields.push(`period_start = $${paramIndex++}`);
      params.push(data.periodStart);
    }
    if (data.periodEnd !== undefined) {
      fields.push(`period_end = $${paramIndex++}`);
      params.push(data.periodEnd);
    }
    if (data.totalBudget !== undefined) {
      fields.push(`total_budget = $${paramIndex++}`);
      params.push(data.totalBudget);
    }
    if (data.riskGuardrails !== undefined) {
      fields.push(`risk_guardrails = $${paramIndex++}`);
      params.push(JSON.stringify(data.riskGuardrails));
    }

    if (fields.length === 0) {
      throw new ValidationError('No fields to update');
    }

    params.push(id);

    const result = await query<BudgetAllocation>(
      `UPDATE budget_allocations SET ${fields.join(', ')} WHERE id = $${paramIndex}
       RETURNING *`,
      params,
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        generateId(),
        userId,
        'budget_allocation.update',
        'budget_allocation',
        id,
        JSON.stringify({ updatedFields: Object.keys(data).filter((k) => (data as Record<string, unknown>)[k] !== undefined) }),
      ],
    );

    logger.info('Budget allocation updated', { allocationId: id, userId });
    return result.rows[0];
  }

  /**
   * Delete a budget allocation.
   */
  static async delete(id: string): Promise<void> {
    const result = await query(
      'DELETE FROM budget_allocations WHERE id = $1',
      [id],
    );

    if (result.rowCount === 0) {
      throw new NotFoundError(`Budget allocation not found: ${id}`);
    }

    logger.info('Budget allocation deleted', { allocationId: id });
  }

  /**
   * Record a spend amount against a budget allocation for a specific channel.
   * Increments `total_spent` and logs an audit entry.
   */
  static async recordSpend(
    allocationId: string,
    amount: number,
    channel: string,
  ): Promise<void> {
    // Ensure the allocation exists
    const allocation = await BudgetService.getById(allocationId);

    if (amount <= 0) {
      throw new ValidationError('Spend amount must be positive');
    }

    // Increment total_spent
    await query(
      `UPDATE budget_allocations
       SET total_spent = total_spent + $1
       WHERE id = $2`,
      [amount, allocationId],
    );

    // Audit log for the spend
    await query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        generateId(),
        allocation.created_by,
        'budget_allocation.spend',
        'budget_allocation',
        allocationId,
        JSON.stringify({ amount, channel, previousSpent: allocation.total_spent }),
      ],
    );

    logger.info('Budget spend recorded', { allocationId, amount, channel });
  }

  /**
   * Aggregate total budget and spend grouped by country for a given date
   * range. Returns rows for every country that has at least one overlapping
   * budget allocation.
   */
  static async getSpendByCountry(
    startDate: string,
    endDate: string,
  ): Promise<SpendByCountry[]> {
    const result = await query<{
      country_id: string;
      country_name: string;
      total_budget: string;
      total_spent: string;
    }>(
      `SELECT
         ba.country_id,
         c.name AS country_name,
         SUM(ba.total_budget)::text AS total_budget,
         SUM(ba.total_spent)::text  AS total_spent
       FROM budget_allocations ba
       JOIN countries c ON c.id = ba.country_id
       WHERE ba.period_start <= $2::date AND ba.period_end >= $1::date
       GROUP BY ba.country_id, c.name
       ORDER BY c.name`,
      [startDate, endDate],
    );

    return result.rows.map((row) => ({
      countryId: row.country_id,
      countryName: row.country_name,
      totalBudget: parseFloat(row.total_budget),
      totalSpent: parseFloat(row.total_spent),
    }));
  }

  /**
   * Aggregate total budget and spend grouped by channel for a given date
   * range. Extracts channel keys from the `channel_allocations` JSONB column.
   */
  static async getSpendByChannel(
    startDate: string,
    endDate: string,
  ): Promise<SpendByChannel[]> {
    const result = await query<{
      channel: string;
      total_budget: string;
      total_spent: string;
    }>(
      `SELECT
         ch.key AS channel,
         SUM(ch.value::numeric)::text AS total_budget,
         SUM(
           CASE
             WHEN ba.total_budget > 0
             THEN ba.total_spent * (ch.value::numeric / ba.total_budget)
             ELSE 0
           END
         )::text AS total_spent
       FROM budget_allocations ba,
            jsonb_each_text(ba.channel_allocations) AS ch(key, value)
       WHERE ba.period_start <= $2::date AND ba.period_end >= $1::date
       GROUP BY ch.key
       ORDER BY ch.key`,
      [startDate, endDate],
    );

    return result.rows.map((row) => ({
      channel: row.channel,
      totalBudget: parseFloat(row.total_budget),
      totalSpent: parseFloat(row.total_spent),
    }));
  }

  /**
   * Check the risk guardrails configured on a budget allocation.
   *
   * Current guardrail checks:
   * - `maxSpendPercent`: total_spent must not exceed this percentage of total_budget
   * - `maxDailySpend`: average daily spend must not exceed this value
   * - `minRemainingBudget`: remaining budget must be above this threshold
   */
  static async checkGuardrails(allocationId: string): Promise<GuardrailResult> {
    const allocation = await BudgetService.getById(allocationId);
    const violations: string[] = [];
    const guardrails = allocation.risk_guardrails ?? {};

    // Check max spend percentage
    if (guardrails.maxSpendPercent !== undefined) {
      const maxPercent = guardrails.maxSpendPercent as number;
      const spentPercent =
        allocation.total_budget > 0
          ? (allocation.total_spent / allocation.total_budget) * 100
          : 0;

      if (spentPercent > maxPercent) {
        violations.push(
          `Spend percentage (${spentPercent.toFixed(1)}%) exceeds maximum allowed (${maxPercent}%)`,
        );
      }
    }

    // Check max daily spend
    if (guardrails.maxDailySpend !== undefined) {
      const maxDaily = guardrails.maxDailySpend as number;
      const periodStart = new Date(allocation.period_start);
      const periodEnd = new Date(allocation.period_end);
      const today = new Date();
      const elapsedDays = Math.max(
        1,
        Math.ceil(
          (Math.min(today.getTime(), periodEnd.getTime()) - periodStart.getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      );
      const avgDailySpend = allocation.total_spent / elapsedDays;

      if (avgDailySpend > maxDaily) {
        violations.push(
          `Average daily spend ($${avgDailySpend.toFixed(2)}) exceeds maximum allowed ($${maxDaily.toFixed(2)})`,
        );
      }
    }

    // Check minimum remaining budget
    if (guardrails.minRemainingBudget !== undefined) {
      const minRemaining = guardrails.minRemainingBudget as number;
      const remaining = allocation.total_budget - allocation.total_spent;

      if (remaining < minRemaining) {
        violations.push(
          `Remaining budget ($${remaining.toFixed(2)}) is below minimum threshold ($${minRemaining.toFixed(2)})`,
        );
      }
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }
}
