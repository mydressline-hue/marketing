/**
 * Learning Controller -- Tier 3 Contextual Bandits HTTP handlers.
 *
 * Exposes the BanditService through RESTful endpoints for recording
 * observations, getting recommendations via Thompson Sampling, retrieving
 * arm statistics, and checking convergence status.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { BanditService } from '../services/learning/BanditService';

// ---------------------------------------------------------------------------
// POST /learning/observe
// Record a bandit observation and update the posterior.
// ---------------------------------------------------------------------------

export const recordBanditObservation = asyncHandler(async (req: Request, res: Response) => {
  const { contextType, armName, reward, rewardType, contextVector } = req.body;

  const result = await BanditService.recordObservation(
    contextType,
    armName,
    reward,
    rewardType,
    contextVector,
  );

  res.status(201).json({
    success: true,
    data: {
      observation_id: result.observation_id,
      arm: {
        id: result.arm.id,
        context_type: result.arm.context_type,
        arm_name: result.arm.arm_name,
        observation_count: result.arm.observation_count,
        alpha: result.arm.alpha,
        beta: result.arm.beta,
        mu: result.arm.mu,
        lambda: result.arm.lambda,
        a: result.arm.a,
        b: result.arm.b,
      },
    },
  });
});

// ---------------------------------------------------------------------------
// GET /learning/recommend/:contextType
// Use Thompson Sampling to recommend the best arm.
// ---------------------------------------------------------------------------

export const recommendArm = asyncHandler(async (req: Request, res: Response) => {
  const { contextType } = req.params;
  const contextVector = req.query.context
    ? JSON.parse(req.query.context as string)
    : undefined;
  const excludeArms = req.query.exclude
    ? (req.query.exclude as string).split(',')
    : undefined;

  const result = await BanditService.selectArm(contextType, contextVector, excludeArms);

  res.json({
    success: true,
    data: result,
  });
});

// ---------------------------------------------------------------------------
// GET /learning/arms/:contextType
// Return all arms with statistics and confidence intervals.
// ---------------------------------------------------------------------------

export const getArmsStats = asyncHandler(async (req: Request, res: Response) => {
  const { contextType } = req.params;

  const stats = await BanditService.getArmStats(contextType);

  res.json({
    success: true,
    data: {
      context_type: contextType,
      arms: stats,
      total_arms: stats.length,
      total_observations: stats.reduce((sum, s) => sum + s.observation_count, 0),
    },
  });
});

// ---------------------------------------------------------------------------
// GET /learning/convergence/:contextType
// Check whether the bandit has converged for a given context type.
// ---------------------------------------------------------------------------

export const checkConvergence = asyncHandler(async (req: Request, res: Response) => {
  const { contextType } = req.params;
  const threshold = req.query.threshold ? parseFloat(req.query.threshold as string) : undefined;

  const result = await BanditService.hasConverged(contextType, threshold);

  res.json({
    success: true,
    data: result,
  });
});

// ---------------------------------------------------------------------------
// POST /learning/decay
// Trigger observation decay (usually called by a cron job).
// ---------------------------------------------------------------------------

export const triggerDecay = asyncHandler(async (_req: Request, res: Response) => {
  const result = await BanditService.decayObservations();

  res.json({
    success: true,
    data: result,
  });
});
