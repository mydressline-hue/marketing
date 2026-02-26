/**
 * Final Outputs - System-Wide Confidence Score Routes.
 *
 * Defines Express routes for the system confidence score final output
 * endpoints. All routes require authentication.
 */

import { Router } from 'express';
import {
  getSystemConfidenceScore,
  getConfidenceTrend,
  getAgentConfidenceScore,
} from '../controllers/final-outputs-confidence.controller';
import { authenticate } from '../middleware/auth';

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// GET /final-outputs/confidence-score - system-wide confidence score
router.get('/confidence-score', authenticate, getSystemConfidenceScore);

// GET /final-outputs/confidence-score/trend - historical trend
// NOTE: Must be defined BEFORE the :agentId param route to avoid
// "trend" being interpreted as an agent ID.
router.get('/confidence-score/trend', authenticate, getConfidenceTrend);

// GET /final-outputs/confidence-score/:agentId - per-agent score
router.get('/confidence-score/:agentId', authenticate, getAgentConfidenceScore);

export default router;
