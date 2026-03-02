/**
 * Social Publisher Service.
 *
 * Publishes generated videos with AI-enhanced text to connected social media
 * platforms. Supports Instagram, TikTok, Facebook, YouTube, Twitter, and
 * LinkedIn. Each platform publish is tracked with status and engagement data.
 *
 * Platform credentials are retrieved from the platform_connections table.
 */

import { pool } from '../../config/database';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import { NotFoundError, ExternalServiceError } from '../../utils/errors';
import { AuditService } from '../audit.service';
import { SocialPlatform, TextEnhancement } from './TextEnhancementService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SocialPublishRecord {
  id: string;
  videoTaskId: string;
  textEnhancementId: string | null;
  platform: SocialPlatform;
  status: string;
  externalPostId: string | null;
  postUrl: string | null;
  caption: string | null;
  hashtags: string[];
  callToAction: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  errorMessage: string | null;
  engagement: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PublishRequest {
  videoTaskId: string;
  videoUrl: string;
  platforms: SocialPlatform[];
  enhancements: TextEnhancement[];
  userId: string;
  scheduledAt?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapRow(row: Record<string, unknown>): SocialPublishRecord {
  return {
    id: row.id as string,
    videoTaskId: row.video_task_id as string,
    textEnhancementId: (row.text_enhancement_id as string) ?? null,
    platform: row.platform as SocialPlatform,
    status: row.status as string,
    externalPostId: (row.external_post_id as string) ?? null,
    postUrl: (row.post_url as string) ?? null,
    caption: (row.caption as string) ?? null,
    hashtags: (row.hashtags as string[]) ?? [],
    callToAction: (row.call_to_action as string) ?? null,
    scheduledAt: (row.scheduled_at as string) ?? null,
    publishedAt: (row.published_at as string) ?? null,
    errorMessage: (row.error_message as string) ?? null,
    engagement: (row.engagement as Record<string, unknown>) ?? {},
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ---------------------------------------------------------------------------
// Platform publish implementations
// ---------------------------------------------------------------------------

async function getConnectionCredentials(
  userId: string,
  platform: SocialPlatform,
): Promise<Record<string, unknown> | null> {
  const result = await pool.query(
    `SELECT * FROM platform_connections
     WHERE user_id = $1 AND platform_type = $2 AND status = 'active'
     LIMIT 1`,
    [userId, platform],
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function publishToPlatform(
  platform: SocialPlatform,
  videoUrl: string,
  caption: string,
  hashtags: string[],
  cta: string,
  credentials: Record<string, unknown>,
): Promise<{ externalPostId: string; postUrl: string }> {
  // Each platform would have its own API integration.
  // For now, we simulate the publish and return placeholder results.
  // In production, each case would call the platform's API (Graph API,
  // TikTok Creator API, YouTube Data API, etc.)

  const fullCaption = `${caption}\n\n${hashtags.map((h) => `#${h}`).join(' ')}\n\n${cta}`;

  logger.info(`Publishing to ${platform}`, {
    videoUrl,
    captionLength: fullCaption.length,
    platform,
  });

  switch (platform) {
    case 'instagram':
      // Instagram Graph API: POST /me/media → POST /me/media_publish
      return {
        externalPostId: `ig_${generateId().slice(0, 12)}`,
        postUrl: `https://www.instagram.com/p/${generateId().slice(0, 11)}/`,
      };

    case 'tiktok':
      // TikTok Creator API: POST /v2/post/publish/video/init/
      return {
        externalPostId: `tt_${generateId().slice(0, 12)}`,
        postUrl: `https://www.tiktok.com/@user/video/${Date.now()}`,
      };

    case 'facebook':
      // Facebook Graph API: POST /{page-id}/videos
      return {
        externalPostId: `fb_${generateId().slice(0, 12)}`,
        postUrl: `https://www.facebook.com/watch/?v=${Date.now()}`,
      };

    case 'youtube':
      // YouTube Data API v3: POST /upload/youtube/v3/videos
      return {
        externalPostId: `yt_${generateId().slice(0, 12)}`,
        postUrl: `https://www.youtube.com/shorts/${generateId().slice(0, 11)}`,
      };

    case 'twitter':
      // Twitter API v2: POST /2/tweets with media upload
      return {
        externalPostId: `tw_${generateId().slice(0, 12)}`,
        postUrl: `https://twitter.com/user/status/${Date.now()}`,
      };

    case 'linkedin':
      // LinkedIn API: POST /ugcPosts with video
      return {
        externalPostId: `li_${generateId().slice(0, 12)}`,
        postUrl: `https://www.linkedin.com/feed/update/urn:li:activity:${Date.now()}/`,
      };

    default:
      throw new ExternalServiceError(platform, `Unsupported platform: ${platform}`);
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SocialPublisherService {
  // -----------------------------------------------------------------------
  // Publish to all platforms
  // -----------------------------------------------------------------------

  static async publishToAll(request: PublishRequest): Promise<SocialPublishRecord[]> {
    logger.info('Starting multi-platform publish', {
      videoTaskId: request.videoTaskId,
      platforms: request.platforms,
    });

    const results: SocialPublishRecord[] = [];

    for (const platform of request.platforms) {
      const enhancement = request.enhancements.find(
        (e) => e.platform === platform,
      );

      const record = await SocialPublisherService.publishToSingle({
        videoTaskId: request.videoTaskId,
        videoUrl: request.videoUrl,
        platform,
        caption: enhancement?.caption ?? '',
        hashtags: enhancement?.hashtags ?? [],
        callToAction: enhancement?.callToAction ?? '',
        textEnhancementId: enhancement?.id ?? null,
        userId: request.userId,
        scheduledAt: request.scheduledAt,
      });

      results.push(record);
    }

    logger.info('Multi-platform publish completed', {
      videoTaskId: request.videoTaskId,
      total: results.length,
      succeeded: results.filter((r) => r.status === 'published').length,
      failed: results.filter((r) => r.status === 'failed').length,
    });

    return results;
  }

  // -----------------------------------------------------------------------
  // Publish to a single platform
  // -----------------------------------------------------------------------

  static async publishToSingle(params: {
    videoTaskId: string;
    videoUrl: string;
    platform: SocialPlatform;
    caption: string;
    hashtags: string[];
    callToAction: string;
    textEnhancementId: string | null;
    userId: string;
    scheduledAt?: string;
  }): Promise<SocialPublishRecord> {
    const id = generateId();

    // Create initial record
    await pool.query(
      `INSERT INTO social_publish_records
         (id, video_task_id, text_enhancement_id, platform, status, caption, hashtags, call_to_action, scheduled_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'publishing', $5, $6, $7, $8, NOW(), NOW())`,
      [
        id,
        params.videoTaskId,
        params.textEnhancementId,
        params.platform,
        params.caption,
        params.hashtags,
        params.callToAction,
        params.scheduledAt ?? null,
      ],
    );

    try {
      // Check platform connection
      const credentials = await getConnectionCredentials(
        params.userId,
        params.platform,
      );

      if (!credentials) {
        throw new Error(`No active ${params.platform} connection found`);
      }

      // Publish to the platform
      const { externalPostId, postUrl } = await publishToPlatform(
        params.platform,
        params.videoUrl,
        params.caption,
        params.hashtags,
        params.callToAction,
        credentials,
      );

      // Update record with success
      const result = await pool.query(
        `UPDATE social_publish_records
         SET status = 'published',
             external_post_id = $1,
             post_url = $2,
             published_at = NOW(),
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [externalPostId, postUrl, id],
      );

      await AuditService.log({
        userId: params.userId,
        action: 'social.publish',
        resourceType: 'social_publish',
        resourceId: id,
        details: {
          platform: params.platform,
          postUrl,
          externalPostId,
          videoTaskId: params.videoTaskId,
        },
      });

      return mapRow(result.rows[0]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Update record with failure
      const result = await pool.query(
        `UPDATE social_publish_records
         SET status = 'failed',
             error_message = $1,
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [errorMessage, id],
      );

      logger.error('Social publish failed', {
        id,
        platform: params.platform,
        error: errorMessage,
      });

      return mapRow(result.rows[0]);
    }
  }

  // -----------------------------------------------------------------------
  // Get publish records by video task
  // -----------------------------------------------------------------------

  static async getByVideoTaskId(
    videoTaskId: string,
  ): Promise<SocialPublishRecord[]> {
    const result = await pool.query(
      `SELECT * FROM social_publish_records
       WHERE video_task_id = $1
       ORDER BY created_at DESC`,
      [videoTaskId],
    );
    return result.rows.map(mapRow);
  }

  // -----------------------------------------------------------------------
  // Get publish record by ID
  // -----------------------------------------------------------------------

  static async getById(id: string): Promise<SocialPublishRecord> {
    const result = await pool.query(
      `SELECT * FROM social_publish_records WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) {
      throw new NotFoundError(`Publish record '${id}' not found`);
    }
    return mapRow(result.rows[0]);
  }

  // -----------------------------------------------------------------------
  // List publish records with filters
  // -----------------------------------------------------------------------

  static async list(
    filters: {
      platform?: SocialPlatform;
      status?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{
    data: SocialPublishRecord[];
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

    if (filters.platform) {
      conditions.push(`platform = $${paramIndex++}`);
      params.push(filters.platform);
    }
    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM social_publish_records ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await pool.query(
      `SELECT * FROM social_publish_records ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    return {
      data: dataResult.rows.map(mapRow),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // -----------------------------------------------------------------------
  // Update engagement metrics
  // -----------------------------------------------------------------------

  static async updateEngagement(
    id: string,
    metrics: Record<string, unknown>,
  ): Promise<SocialPublishRecord> {
    const result = await pool.query(
      `UPDATE social_publish_records
       SET engagement = engagement || $1::jsonb, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(metrics), id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Publish record '${id}' not found`);
    }

    return mapRow(result.rows[0]);
  }
}
