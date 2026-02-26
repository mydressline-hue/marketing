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
router.get('/strategies/:countryCode', authenticate, getStrategyByCountryCode);

export default router;
