/**
 * Budget controller – Express request handlers.
 *
 * Each handler delegates to `BudgetService` and returns a structured JSON
 * envelope: `{ success, data, meta? }`.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { BudgetService } from '../services/budget.service';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /budget
 * List budget allocations with optional filtering and pagination.
 */
export const listAllocations = asyncHandler(async (req: Request, res: Response) => {
  const { countryId, period, page, limit, sortBy, sortOrder } = req.query;

  const filters = {
    countryId: countryId as string | undefined,
    period: period as string | undefined,
  };

  const pagination = {
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
    sortBy: sortBy as string | undefined,
    sortOrder: sortOrder as 'asc' | 'desc' | undefined,
  };

  const result = await BudgetService.list(filters, pagination);

  res.json({
    success: true,
    data: result.data,
    meta: {
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    },
  });
});

/**
 * GET /budget/:id
 * Retrieve a single budget allocation by ID.
 */
export const getAllocation = asyncHandler(async (req: Request, res: Response) => {
  const allocation = await BudgetService.getById(req.params.id);

  res.json({
    success: true,
    data: allocation,
  });
});

/**
 * POST /budget
 * Create a new budget allocation.
 */
export const createAllocation = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const allocation = await BudgetService.create(req.body, userId);

  res.status(201).json({
    success: true,
    data: allocation,
  });
});

/**
 * PUT /budget/:id
 * Update an existing budget allocation.
 */
export const updateAllocation = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const allocation = await BudgetService.update(req.params.id, req.body, userId);

  res.json({
    success: true,
    data: allocation,
  });
});

/**
 * DELETE /budget/:id
 * Delete a budget allocation.
 */
export const deleteAllocation = asyncHandler(async (req: Request, res: Response) => {
  await BudgetService.delete(req.params.id);

  res.status(204).send();
});

/**
 * POST /budget/:id/spend
 * Record spend against a budget allocation for a specific channel.
 */
export const recordSpend = asyncHandler(async (req: Request, res: Response) => {
  const { amount, channel } = req.body;
  await BudgetService.recordSpend(req.params.id, amount, channel);

  res.json({
    success: true,
    data: { message: 'Spend recorded successfully' },
  });
});

/**
 * GET /budget/summary/country
 * Aggregate budget and spend by country within a date range.
 */
export const getSpendByCountry = asyncHandler(async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;
  const result = await BudgetService.getSpendByCountry(
    startDate as string,
    endDate as string,
  );

  res.json({
    success: true,
    data: result,
    meta: {
      total: result.length,
    },
  });
});

/**
 * GET /budget/summary/channel
 * Aggregate budget and spend by channel within a date range.
 */
export const getSpendByChannel = asyncHandler(async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;
  const result = await BudgetService.getSpendByChannel(
    startDate as string,
    endDate as string,
  );

  res.json({
    success: true,
    data: result,
    meta: {
      total: result.length,
    },
  });
});

/**
 * GET /budget/:id/guardrails
 * Check risk guardrails for a budget allocation.
 */
export const checkGuardrails = asyncHandler(async (req: Request, res: Response) => {
  const result = await BudgetService.checkGuardrails(req.params.id);

  res.json({
    success: true,
    data: result,
  });
});
