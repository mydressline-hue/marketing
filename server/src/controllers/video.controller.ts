/**
 * Video Pipeline Controller.
 *
 * Express request handlers for the Kling AI video generation pipeline.
 * Covers video task management, full pipeline runs, text enhancements,
 * and social publish records.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { VideoGenerationService } from '../services/video/VideoGenerationService';
import { TextEnhancementService } from '../services/video/TextEnhancementService';
import { SocialPublisherService } from '../services/video/SocialPublisherService';

// ---------------------------------------------------------------------------
// Video Tasks
// ---------------------------------------------------------------------------

/**
 * POST /video/generate
 * Submit a new video generation task to Kling AI.
 */
export const generateVideo = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const task = await VideoGenerationService.generateVideo({
    userId,
    ...req.body,
  });

  res.status(201).json({
    success: true,
    data: task,
  });
});

/**
 * POST /video/pipeline
 * Run the full pipeline: Product → Video → Text Enhancement → Social Publish.
 */
export const runPipeline = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const pipelineRun = await VideoGenerationService.runFullPipeline({
    userId,
    ...req.body,
  });

  res.status(201).json({
    success: true,
    data: pipelineRun,
  });
});

/**
 * GET /video/tasks
 * List video generation tasks with optional filters.
 */
export const listTasks = asyncHandler(async (req: Request, res: Response) => {
  const { status, productId, page, limit } = req.query;

  const result = await VideoGenerationService.listTasks({
    userId: req.user!.id,
    status: status as string | undefined,
    productId: productId as string | undefined,
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
  });

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
 * GET /video/tasks/:id
 * Get a single video generation task by ID.
 */
export const getTask = asyncHandler(async (req: Request, res: Response) => {
  const task = await VideoGenerationService.getTaskById(req.params.id);

  res.json({
    success: true,
    data: task,
  });
});

/**
 * GET /video/tasks/:id/status
 * Check and update the status of a video generation task from Kling API.
 */
export const checkTaskStatus = asyncHandler(async (req: Request, res: Response) => {
  const task = await VideoGenerationService.checkTaskStatus(req.params.id);

  res.json({
    success: true,
    data: task,
  });
});

/**
 * POST /video/tasks/:id/cancel
 * Cancel a video generation task.
 */
export const cancelTask = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const task = await VideoGenerationService.cancelTask(req.params.id, userId);

  res.json({
    success: true,
    data: task,
  });
});

// ---------------------------------------------------------------------------
// Pipeline Runs
// ---------------------------------------------------------------------------

/**
 * GET /video/pipelines
 * List pipeline runs.
 */
export const listPipelineRuns = asyncHandler(async (req: Request, res: Response) => {
  const { status, page, limit } = req.query;

  const result = await VideoGenerationService.listPipelineRuns({
    userId: req.user!.id,
    status: status as string | undefined,
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
  });

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
 * GET /video/pipelines/:id
 * Get a single pipeline run by ID.
 */
export const getPipelineRun = asyncHandler(async (req: Request, res: Response) => {
  const run = await VideoGenerationService.getPipelineRunById(req.params.id);

  res.json({
    success: true,
    data: run,
  });
});

// ---------------------------------------------------------------------------
// Text Enhancements
// ---------------------------------------------------------------------------

/**
 * POST /video/tasks/:id/enhance
 * Generate text enhancements for a completed video task.
 */
export const generateEnhancements = asyncHandler(async (req: Request, res: Response) => {
  const { platforms, productTitle, productDescription, tone, language, targetAudience, brandVoice } =
    req.body;

  const enhancements = await TextEnhancementService.generateForPlatforms({
    videoTaskId: req.params.id,
    productTitle,
    productDescription,
    platforms,
    tone,
    language,
    targetAudience,
    brandVoice,
  });

  res.status(201).json({
    success: true,
    data: enhancements,
  });
});

/**
 * GET /video/tasks/:id/enhancements
 * Get text enhancements for a video task.
 */
export const getEnhancements = asyncHandler(async (req: Request, res: Response) => {
  const enhancements = await TextEnhancementService.getByVideoTaskId(req.params.id);

  res.json({
    success: true,
    data: enhancements,
  });
});

/**
 * PUT /video/enhancements/:id
 * Update a text enhancement (manual edit).
 */
export const updateEnhancement = asyncHandler(async (req: Request, res: Response) => {
  const enhancement = await TextEnhancementService.update(req.params.id, req.body);

  res.json({
    success: true,
    data: enhancement,
  });
});

// ---------------------------------------------------------------------------
// Social Publish
// ---------------------------------------------------------------------------

/**
 * POST /video/tasks/:id/publish
 * Publish a video to social platforms.
 */
export const publishVideo = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const task = await VideoGenerationService.getTaskById(req.params.id);

  if (!task.videoUrl) {
    res.status(400).json({
      success: false,
      error: { message: 'Video is not yet ready for publishing' },
    });
    return;
  }

  const enhancements = await TextEnhancementService.getByVideoTaskId(req.params.id);
  const { platforms, scheduledAt } = req.body;

  const records = await SocialPublisherService.publishToAll({
    videoTaskId: req.params.id,
    videoUrl: task.videoUrl,
    platforms,
    enhancements,
    userId,
    scheduledAt,
  });

  res.status(201).json({
    success: true,
    data: records,
  });
});

/**
 * GET /video/tasks/:id/publishes
 * Get publish records for a video task.
 */
export const getPublishRecords = asyncHandler(async (req: Request, res: Response) => {
  const records = await SocialPublisherService.getByVideoTaskId(req.params.id);

  res.json({
    success: true,
    data: records,
  });
});

/**
 * GET /video/publishes
 * List all publish records with filters.
 */
export const listPublishRecords = asyncHandler(async (req: Request, res: Response) => {
  const { platform, status, page, limit } = req.query;

  const result = await SocialPublisherService.list({
    platform: platform as string | undefined,
    status: status as string | undefined,
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
  });

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
 * PATCH /video/publishes/:id/engagement
 * Update engagement metrics for a publish record.
 */
export const updateEngagement = asyncHandler(async (req: Request, res: Response) => {
  const record = await SocialPublisherService.updateEngagement(
    req.params.id,
    req.body,
  );

  res.json({
    success: true,
    data: record,
  });
});
