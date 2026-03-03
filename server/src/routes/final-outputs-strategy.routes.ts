/**
 * Final Outputs - Country Strategy Routes.
 *
 * Defines Express routes for the marketing strategy per country
 * final output endpoints. All routes require authentication.
 */

import { Router } from 'express';
import {
  getAllStrategies,
  getStrategySummary,
  getStrategyByCountryCode,
} from '../controllers/final-outputs-strategy.controller';
import { authenticate } from '../middleware/auth';
import { validateParams } from '../middleware/validation';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------

/** Params schema for the :countryCode route – 2-letter uppercase ISO code. */
const countryCodeParamsSchema = z.object({
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/, 'countryCode must be a 2-letter uppercase ISO country code.'),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// GET /final-outputs/strategies/summary - aggregated strategy summary
// NOTE: Must be defined BEFORE the :countryCode param route to avoid
// "summary" being interpreted as a country code.
router.get('/strategies/summary', authenticate, getStrategySummary);

// GET /final-outputs/strategies - strategies for all countries
router.get('/strategies', authenticate, getAllStrategies);

// GET /final-outputs/strategies/:countryCode - strategy for specific country
router.get('/strategies/:countryCode', authenticate, validateParams(countryCodeParamsSchema), getStrategyByCountryCode);

export default router;
