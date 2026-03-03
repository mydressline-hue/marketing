/**
 * Video Generation Service.
 *
 * Orchestrates the full video pipeline:
 *   Shopify Product → Kling AI Video (5s/10s) → AI Text Enhancement → Multi-Platform Social Publish
 *
 * Manages video_generation_tasks and video_pipeline_runs in the database,
 * coordinating between KlingVideoService, TextEnhancementService, and
 * SocialPublisherService.
 */

import { pool } from '../../config/database';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import { NotFoundError } from '../../utils/errors';
import { AuditService } from '../audit.service';
import {
  KlingVideoService,
  VideoMode,
  VideoDuration,
  AspectRatio,
} from './KlingVideoService';
import {
  TextEnhancementService,
  SocialPlatform,
} from './TextEnhancementService';
import { SocialPublisherService } from './SocialPublisherService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VideoTask {
  id: string;
  userId: string;
  productId: string | null;
  title: string;
  status: string;
  klingTaskId: string | null;
  model: string;
  mode: string;
  duration: number;
  aspectRatio: string;
  prompt: string | null;
  negativePrompt: string | null;
  sourceImageUrl: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineRun {
  id: string;
  userId: string;
  videoTaskId: string | null;
  productId: string | null;
  status: string;
  targetPlatforms: string[];
  config: Record<string, unknown>;
  results: Record<string, unknown>;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StartPipelineRequest {
  userId: string;
  productId?: string;
  title: string;
  mode: VideoMode;
  duration: VideoDuration;
  aspectRatio: AspectRatio;
  prompt: string;
  negativePrompt?: string;
  sourceImageUrl?: string;
  model?: string;
  targetPlatforms: SocialPlatform[];
  tone?: string;
  language?: string;
  targetAudience?: string;
  brandVoice?: string;
  scheduledAt?: string;
}

export interface GenerateVideoRequest {
  userId: string;
  productId?: string;
  title: string;
  mode: VideoMode;
  duration: VideoDuration;
  aspectRatio: AspectRatio;
  prompt: string;
  negativePrompt?: string;
  sourceImageUrl?: string;
  model?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapVideoTask(row: Record<string, unknown>): VideoTask {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    productId: (row.product_id as string) ?? null,
    title: row.title as string,
    status: row.status as string,
    klingTaskId: (row.kling_task_id as string) ?? null,
    model: row.model as string,
    mode: row.mode as string,
    duration: Number(row.duration),
    aspectRatio: row.aspect_ratio as string,
    prompt: (row.prompt as string) ?? null,
    negativePrompt: (row.negative_prompt as string) ?? null,
    sourceImageUrl: (row.source_image_url as string) ?? null,
    videoUrl: (row.video_url as string) ?? null,
    thumbnailUrl: (row.thumbnail_url as string) ?? null,
    errorMessage: (row.error_message as string) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    startedAt: (row.started_at as string) ?? null,
    completedAt: (row.completed_at as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapPipelineRun(row: Record<string, unknown>): PipelineRun {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    videoTaskId: (row.video_task_id as string) ?? null,
    productId: (row.product_id as string) ?? null,
    status: row.status as string,
    targetPlatforms: (row.target_platforms as string[]) ?? [],
    config: (row.config as Record<string, unknown>) ?? {},
    results: (row.results as Record<string, unknown>) ?? {},
    errorMessage: (row.error_message as string) ?? null,
    startedAt: (row.started_at as string) ?? null,
    completedAt: (row.completed_at as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ---------------------------------------------------------------------------
// Fetch Shopify product info
// ---------------------------------------------------------------------------

async function getProductInfo(
  productId: string,
): Promise<{ title: string; description: string; imageUrl: string | null } | null> {
  const result = await pool.query(
    `SELECT title, description, images FROM products WHERE id = $1`,
    [productId],
  );
  if (result.rows.length === 0) {
    // Try shopify_products table
    const shopifyResult = await pool.query(
      `SELECT title, body_html as description, image_url FROM shopify_products WHERE id = $1`,
      [productId],
    );
    if (shopifyResult.rows.length === 0) return null;
    const row = shopifyResult.rows[0];
    return {
      title: row.title as string,
      description: (row.description as string) ?? '',
      imageUrl: (row.image_url as string) ?? null,
    };
  }
  const row = result.rows[0];
  const images = row.images as string[] | null;
  return {
    title: row.title as string,
    description: (row.description as string) ?? '',
    imageUrl: images && images.length > 0 ? images[0] : null,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class VideoGenerationService {
  // -----------------------------------------------------------------------
  // Generate video only (step 1)
  // -----------------------------------------------------------------------

  static async generateVideo(
    request: GenerateVideoRequest,
  ): Promise<VideoTask> {
    const id = generateId();

    // If productId provided, fetch product info
    let sourceImageUrl = request.sourceImageUrl;
    if (request.productId && !sourceImageUrl) {
      const product = await getProductInfo(request.productId);
      if (product?.imageUrl) {
        sourceImageUrl = product.imageUrl;
      }
    }

    // Create task record
    await pool.query(
      `INSERT INTO video_generation_tasks
         (id, user_id, product_id, title, status, model, mode, duration, aspect_ratio,
          prompt, negative_prompt, source_image_url, metadata, started_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'submitted', $5, $6, $7, $8, $9, $10, $11, '{}', NOW(), NOW(), NOW())`,
      [
        id,
        request.userId,
        request.productId ?? null,
        request.title,
        request.model ?? 'kling-v1',
        request.mode,
        request.duration,
        request.aspectRatio,
        request.prompt,
        request.negativePrompt ?? null,
        sourceImageUrl ?? null,
      ],
    );

    logger.info('Video generation task created', { taskId: id, mode: request.mode });

    // Submit to Kling API
    try {
      const klingResult = await KlingVideoService.submitTask({
        mode: request.mode,
        prompt: request.prompt,
        negativePrompt: request.negativePrompt,
        imageUrl: sourceImageUrl ?? undefined,
        duration: request.duration,
        aspectRatio: request.aspectRatio,
        model: request.model,
      });

      // Update with Kling task ID
      await pool.query(
        `UPDATE video_generation_tasks
         SET kling_task_id = $1, status = 'processing'
         WHERE id = $2`,
        [klingResult.taskId, id],
      );

      logger.info('Video task submitted to Kling', {
        taskId: id,
        klingTaskId: klingResult.taskId,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await pool.query(
        `UPDATE video_generation_tasks
         SET status = 'failed', error_message = $1
         WHERE id = $2`,
        [errorMessage, id],
      );

      logger.error('Failed to submit video task to Kling', {
        taskId: id,
        error: errorMessage,
      });
    }

    await AuditService.log({
      userId: request.userId,
      action: 'video.generate',
      resourceType: 'video_task',
      resourceId: id,
      details: {
        mode: request.mode,
        duration: request.duration,
        productId: request.productId,
      },
    });

    return VideoGenerationService.getTaskById(id);
  }

  // -----------------------------------------------------------------------
  // Check and update task status
  // -----------------------------------------------------------------------

  static async checkTaskStatus(taskId: string): Promise<VideoTask> {
    const task = await VideoGenerationService.getTaskById(taskId);

    if (!task.klingTaskId || task.status === 'completed' || task.status === 'failed') {
      return task;
    }

    const klingResult = await KlingVideoService.getTaskStatus(task.klingTaskId);

    if (klingResult.status === 'succeed') {
      const result = await pool.query(
        `UPDATE video_generation_tasks
         SET status = 'completed',
             video_url = $1,
             completed_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [klingResult.videoUrl, taskId],
      );
      return mapVideoTask(result.rows[0]);
    }

    if (klingResult.status === 'failed') {
      const result = await pool.query(
        `UPDATE video_generation_tasks
         SET status = 'failed',
             error_message = $1
         WHERE id = $2
         RETURNING *`,
        [klingResult.errorMessage, taskId],
      );
      return mapVideoTask(result.rows[0]);
    }

    return task;
  }

  // -----------------------------------------------------------------------
  // Run full pipeline: Product → Video → Text → Publish
  // -----------------------------------------------------------------------

  static async runFullPipeline(
    request: StartPipelineRequest,
  ): Promise<PipelineRun> {
    const pipelineId = generateId();

    // Create pipeline run
    await pool.query(
      `INSERT INTO video_pipeline_runs
         (id, user_id, product_id, status, target_platforms, config, started_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'generating_video', $4, $5, NOW(), NOW(), NOW())`,
      [
        pipelineId,
        request.userId,
        request.productId ?? null,
        request.targetPlatforms,
        JSON.stringify({
          mode: request.mode,
          duration: request.duration,
          aspectRatio: request.aspectRatio,
          tone: request.tone,
          language: request.language,
          targetAudience: request.targetAudience,
          brandVoice: request.brandVoice,
          scheduledAt: request.scheduledAt,
        }),
      ],
    );

    logger.info('Pipeline run started', {
      pipelineId,
      platforms: request.targetPlatforms,
    });

    // Get product info for text enhancement
    let productTitle = request.title;
    let productDescription = request.prompt;
    if (request.productId) {
      const product = await getProductInfo(request.productId);
      if (product) {
        productTitle = product.title;
        productDescription = product.description;
      }
    }

    try {
      // ── Step 1: Generate video ──
      const videoTask = await VideoGenerationService.generateVideo({
        userId: request.userId,
        productId: request.productId,
        title: request.title,
        mode: request.mode,
        duration: request.duration,
        aspectRatio: request.aspectRatio,
        prompt: request.prompt,
        negativePrompt: request.negativePrompt,
        sourceImageUrl: request.sourceImageUrl,
        model: request.model,
      });

      await pool.query(
        `UPDATE video_pipeline_runs SET video_task_id = $1 WHERE id = $2`,
        [videoTask.id, pipelineId],
      );

      // Poll until video is ready
      let completedTask: VideoTask;
      if (videoTask.klingTaskId) {
        const klingResult = await KlingVideoService.pollUntilComplete(
          videoTask.klingTaskId,
        );

        if (klingResult.status === 'failed') {
          throw new Error(
            klingResult.errorMessage ?? 'Video generation failed',
          );
        }

        // Update task with result
        const taskResult = await pool.query(
          `UPDATE video_generation_tasks
           SET status = 'completed',
               video_url = $1,
               completed_at = NOW()
           WHERE id = $2
           RETURNING *`,
          [klingResult.videoUrl, videoTask.id],
        );
        completedTask = mapVideoTask(taskResult.rows[0]);
      } else {
        throw new Error('No Kling task ID was assigned');
      }

      if (!completedTask.videoUrl) {
        throw new Error('Video generation completed but no video URL returned');
      }

      // ── Step 2: Enhance text ──
      await pool.query(
        `UPDATE video_pipeline_runs SET status = 'enhancing_text' WHERE id = $1`,
        [pipelineId],
      );

      const enhancements =
        await TextEnhancementService.generateForPlatforms({
          videoTaskId: completedTask.id,
          productTitle,
          productDescription,
          platforms: request.targetPlatforms,
          tone: request.tone,
          language: request.language,
          targetAudience: request.targetAudience,
          brandVoice: request.brandVoice,
        });

      // ── Step 3: Publish to social platforms ──
      await pool.query(
        `UPDATE video_pipeline_runs SET status = 'publishing' WHERE id = $1`,
        [pipelineId],
      );

      const publishResults = await SocialPublisherService.publishToAll({
        videoTaskId: completedTask.id,
        videoUrl: completedTask.videoUrl,
        platforms: request.targetPlatforms,
        enhancements,
        userId: request.userId,
        scheduledAt: request.scheduledAt,
      });

      // ── Step 4: Finalise pipeline ──
      const succeeded = publishResults.filter((r) => r.status === 'published');
      const failed = publishResults.filter((r) => r.status === 'failed');
      const finalStatus =
        failed.length === 0
          ? 'completed'
          : succeeded.length > 0
            ? 'partial'
            : 'failed';

      const pipelineResult = await pool.query(
        `UPDATE video_pipeline_runs
         SET status = $1,
             results = $2,
             completed_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [
          finalStatus,
          JSON.stringify({
            videoUrl: completedTask.videoUrl,
            enhancementCount: enhancements.length,
            publishResults: publishResults.map((r) => ({
              platform: r.platform,
              status: r.status,
              postUrl: r.postUrl,
            })),
          }),
          pipelineId,
        ],
      );

      await AuditService.log({
        userId: request.userId,
        action: 'video.pipeline_complete',
        resourceType: 'pipeline_run',
        resourceId: pipelineId,
        details: {
          status: finalStatus,
          platformsPublished: succeeded.length,
          platformsFailed: failed.length,
        },
      });

      logger.info('Pipeline run completed', {
        pipelineId,
        status: finalStatus,
      });

      return mapPipelineRun(pipelineResult.rows[0]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      const result = await pool.query(
        `UPDATE video_pipeline_runs
         SET status = 'failed',
             error_message = $1,
             completed_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [errorMessage, pipelineId],
      );

      logger.error('Pipeline run failed', {
        pipelineId,
        error: errorMessage,
      });

      return mapPipelineRun(result.rows[0]);
    }
  }

  // -----------------------------------------------------------------------
  // Get task by ID
  // -----------------------------------------------------------------------

  static async getTaskById(id: string): Promise<VideoTask> {
    const result = await pool.query(
      `SELECT id, user_id, product_id, title, status, kling_task_id, model, mode, duration, aspect_ratio, prompt, negative_prompt, source_image_url, video_url, thumbnail_url, error_message, metadata, started_at, completed_at, created_at, updated_at FROM video_generation_tasks WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) {
      throw new NotFoundError(`Video task '${id}' not found`);
    }
    return mapVideoTask(result.rows[0]);
  }

  // -----------------------------------------------------------------------
  // Get pipeline run by ID
  // -----------------------------------------------------------------------

  static async getPipelineRunById(id: string): Promise<PipelineRun> {
    const result = await pool.query(
      `SELECT id, user_id, video_task_id, product_id, status, target_platforms, config, results, error_message, started_at, completed_at, created_at, updated_at FROM video_pipeline_runs WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) {
      throw new NotFoundError(`Pipeline run '${id}' not found`);
    }
    return mapPipelineRun(result.rows[0]);
  }

  // -----------------------------------------------------------------------
  // List video tasks
  // -----------------------------------------------------------------------

  static async listTasks(
    filters: {
      userId?: string;
      status?: string;
      productId?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{
    data: VideoTask[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(filters.userId);
    }
    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    }
    if (filters.productId) {
      conditions.push(`product_id = $${paramIndex++}`);
      params.push(filters.productId);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM video_generation_tasks ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await pool.query(
      `SELECT id, user_id, product_id, title, status, kling_task_id, model, mode, duration, aspect_ratio, prompt, negative_prompt, source_image_url, video_url, thumbnail_url, error_message, metadata, started_at, completed_at, created_at, updated_at FROM video_generation_tasks ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    return {
      data: dataResult.rows.map(mapVideoTask),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // -----------------------------------------------------------------------
  // List pipeline runs
  // -----------------------------------------------------------------------

  static async listPipelineRuns(
    filters: {
      userId?: string;
      status?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{
    data: PipelineRun[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(filters.userId);
    }
    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM video_pipeline_runs ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await pool.query(
      `SELECT id, user_id, video_task_id, product_id, status, target_platforms, config, results, error_message, started_at, completed_at, created_at, updated_at FROM video_pipeline_runs ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    return {
      data: dataResult.rows.map(mapPipelineRun),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // -----------------------------------------------------------------------
  // Cancel a video task
  // -----------------------------------------------------------------------

  static async cancelTask(taskId: string, userId: string): Promise<VideoTask> {
    const task = await VideoGenerationService.getTaskById(taskId);

    if (task.status === 'completed' || task.status === 'failed') {
      throw new Error(`Cannot cancel task in '${task.status}' status`);
    }

    const result = await pool.query(
      `UPDATE video_generation_tasks
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [taskId],
    );

    await AuditService.log({
      userId,
      action: 'video.cancel',
      resourceType: 'video_task',
      resourceId: taskId,
    });

    logger.info('Video task cancelled', { taskId, userId });

    return mapVideoTask(result.rows[0]);
  }
}
