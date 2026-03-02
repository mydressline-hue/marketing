/**
 * Kling AI Video Service.
 *
 * API client for the Kling AI video generation platform. Supports both
 * image-to-video and text-to-video generation modes. Handles task
 * submission, status polling, and result retrieval with automatic retries.
 *
 * Environment variable: KLING_API_KEY must be set.
 */

import { logger } from '../../utils/logger';
import { retryWithBackoff, sleep } from '../../utils/helpers';
import { ExternalServiceError } from '../../utils/errors';
import { env } from '../../config/env';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KLING_API_BASE = 'https://api.klingai.com/v1';
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 120; // 10 minutes max polling

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VideoMode = 'image_to_video' | 'text_to_video';
export type VideoDuration = 5 | 10;
export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

export type KlingTaskStatus =
  | 'submitted'
  | 'processing'
  | 'succeed'
  | 'failed';

export interface KlingSubmitRequest {
  mode: VideoMode;
  prompt: string;
  negativePrompt?: string;
  imageUrl?: string;
  duration: VideoDuration;
  aspectRatio: AspectRatio;
  model?: string;
  cfgScale?: number;
}

export interface KlingTaskResult {
  taskId: string;
  status: KlingTaskStatus;
  videoUrl?: string;
  thumbnailUrl?: string;
  errorMessage?: string;
  duration?: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class KlingVideoService {
  private static getApiKey(): string {
    const key = env.KLING_API_KEY;
    if (!key) {
      throw new ExternalServiceError(
        'KlingAI',
        'KLING_API_KEY environment variable is not configured',
      );
    }
    return key;
  }

  private static async request<T>(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const apiKey = KlingVideoService.getApiKey();
    const url = `${KLING_API_BASE}${endpoint}`;

    const response = await retryWithBackoff(
      async () => {
        const res = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => 'Unknown error');
          throw new ExternalServiceError(
            'KlingAI',
            `Kling API ${method} ${endpoint} failed (${res.status}): ${text}`,
          );
        }

        return res.json() as Promise<T>;
      },
      2,
      2000,
    );

    return response;
  }

  // -----------------------------------------------------------------------
  // Submit image-to-video task
  // -----------------------------------------------------------------------

  static async submitImageToVideo(params: {
    imageUrl: string;
    prompt: string;
    negativePrompt?: string;
    duration: VideoDuration;
    aspectRatio: AspectRatio;
    model?: string;
    cfgScale?: number;
  }): Promise<KlingTaskResult> {
    logger.info('Submitting Kling image-to-video task', {
      duration: params.duration,
      aspectRatio: params.aspectRatio,
    });

    const body: Record<string, unknown> = {
      model_name: params.model ?? 'kling-v1',
      image: params.imageUrl,
      prompt: params.prompt,
      negative_prompt: params.negativePrompt ?? '',
      duration: String(params.duration),
      aspect_ratio: params.aspectRatio,
      cfg_scale: params.cfgScale ?? 0.5,
    };

    const response = await KlingVideoService.request<{
      code: number;
      message: string;
      data: { task_id: string; task_status: string };
    }>('POST', '/videos/image2video', body);

    if (response.code !== 0) {
      throw new ExternalServiceError(
        'KlingAI',
        `Kling image2video submission failed: ${response.message}`,
      );
    }

    logger.info('Kling image-to-video task submitted', {
      taskId: response.data.task_id,
    });

    return {
      taskId: response.data.task_id,
      status: 'submitted',
    };
  }

  // -----------------------------------------------------------------------
  // Submit text-to-video task
  // -----------------------------------------------------------------------

  static async submitTextToVideo(params: {
    prompt: string;
    negativePrompt?: string;
    duration: VideoDuration;
    aspectRatio: AspectRatio;
    model?: string;
    cfgScale?: number;
  }): Promise<KlingTaskResult> {
    logger.info('Submitting Kling text-to-video task', {
      duration: params.duration,
      aspectRatio: params.aspectRatio,
    });

    const body: Record<string, unknown> = {
      model_name: params.model ?? 'kling-v1',
      prompt: params.prompt,
      negative_prompt: params.negativePrompt ?? '',
      duration: String(params.duration),
      aspect_ratio: params.aspectRatio,
      cfg_scale: params.cfgScale ?? 0.5,
    };

    const response = await KlingVideoService.request<{
      code: number;
      message: string;
      data: { task_id: string; task_status: string };
    }>('POST', '/videos/text2video', body);

    if (response.code !== 0) {
      throw new ExternalServiceError(
        'KlingAI',
        `Kling text2video submission failed: ${response.message}`,
      );
    }

    logger.info('Kling text-to-video task submitted', {
      taskId: response.data.task_id,
    });

    return {
      taskId: response.data.task_id,
      status: 'submitted',
    };
  }

  // -----------------------------------------------------------------------
  // Submit task (unified entry point)
  // -----------------------------------------------------------------------

  static async submitTask(params: KlingSubmitRequest): Promise<KlingTaskResult> {
    if (params.mode === 'image_to_video') {
      if (!params.imageUrl) {
        throw new ExternalServiceError(
          'KlingAI',
          'imageUrl is required for image_to_video mode',
        );
      }
      return KlingVideoService.submitImageToVideo({
        imageUrl: params.imageUrl,
        prompt: params.prompt,
        negativePrompt: params.negativePrompt,
        duration: params.duration,
        aspectRatio: params.aspectRatio,
        model: params.model,
        cfgScale: params.cfgScale,
      });
    }

    return KlingVideoService.submitTextToVideo({
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      duration: params.duration,
      aspectRatio: params.aspectRatio,
      model: params.model,
      cfgScale: params.cfgScale,
    });
  }

  // -----------------------------------------------------------------------
  // Check task status
  // -----------------------------------------------------------------------

  static async getTaskStatus(taskId: string): Promise<KlingTaskResult> {
    const response = await KlingVideoService.request<{
      code: number;
      message: string;
      data: {
        task_id: string;
        task_status: string;
        task_status_msg?: string;
        task_result?: {
          videos?: Array<{
            url: string;
            duration: number;
          }>;
        };
      };
    }>('GET', `/videos/image2video/${taskId}`);

    if (response.code !== 0) {
      throw new ExternalServiceError(
        'KlingAI',
        `Kling status check failed: ${response.message}`,
      );
    }

    const data = response.data;
    const video = data.task_result?.videos?.[0];

    const result: KlingTaskResult = {
      taskId: data.task_id,
      status: data.task_status as KlingTaskStatus,
    };

    if (data.task_status === 'succeed' && video) {
      result.videoUrl = video.url;
      result.duration = video.duration;
      result.status = 'succeed';
    } else if (data.task_status === 'failed') {
      result.errorMessage =
        data.task_status_msg ?? 'Video generation failed';
      result.status = 'failed';
    } else {
      result.status = 'processing';
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Poll until completion
  // -----------------------------------------------------------------------

  static async pollUntilComplete(taskId: string): Promise<KlingTaskResult> {
    logger.info('Polling Kling task until completion', { taskId });

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const result = await KlingVideoService.getTaskStatus(taskId);

      if (result.status === 'succeed') {
        logger.info('Kling task completed successfully', {
          taskId,
          videoUrl: result.videoUrl,
          attempts: attempt + 1,
        });
        return result;
      }

      if (result.status === 'failed') {
        logger.error('Kling task failed', {
          taskId,
          error: result.errorMessage,
          attempts: attempt + 1,
        });
        return result;
      }

      logger.debug('Kling task still processing', {
        taskId,
        attempt: attempt + 1,
        status: result.status,
      });

      await sleep(POLL_INTERVAL_MS);
    }

    throw new ExternalServiceError(
      'KlingAI',
      `Task ${taskId} timed out after ${MAX_POLL_ATTEMPTS} polling attempts`,
    );
  }
}
