/**
 * Text Enhancement Service.
 *
 * Uses the existing Anthropic AI integration to generate platform-optimised
 * marketing text for video content. Produces captions, hashtags, and CTAs
 * tailored to each social media platform's best practices.
 */

import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../../config/database';
import { logger } from '../../utils/logger';
import { generateId } from '../../utils/helpers';
import { env } from '../../config/env';
import { ExternalServiceError } from '../../utils/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SocialPlatform =
  | 'instagram'
  | 'tiktok'
  | 'facebook'
  | 'youtube'
  | 'twitter'
  | 'linkedin';

export interface TextEnhancement {
  id: string;
  videoTaskId: string;
  platform: SocialPlatform;
  caption: string;
  hashtags: string[];
  callToAction: string;
  tone: string;
  language: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface EnhancementRequest {
  videoTaskId: string;
  productTitle: string;
  productDescription: string;
  platforms: SocialPlatform[];
  tone?: string;
  language?: string;
  targetAudience?: string;
  brandVoice?: string;
}

// ---------------------------------------------------------------------------
// Platform constraints
// ---------------------------------------------------------------------------

const PLATFORM_LIMITS: Record<
  SocialPlatform,
  { maxCaptionLength: number; maxHashtags: number; style: string }
> = {
  instagram: {
    maxCaptionLength: 2200,
    maxHashtags: 30,
    style: 'visual storytelling, emoji-friendly, engaging first line as hook',
  },
  tiktok: {
    maxCaptionLength: 300,
    maxHashtags: 5,
    style: 'trendy, casual, hook-driven, Gen-Z friendly language',
  },
  facebook: {
    maxCaptionLength: 500,
    maxHashtags: 5,
    style: 'conversational, community-focused, slightly longer form',
  },
  youtube: {
    maxCaptionLength: 5000,
    maxHashtags: 15,
    style: 'SEO-optimised description, timestamps-friendly, keyword-rich',
  },
  twitter: {
    maxCaptionLength: 280,
    maxHashtags: 3,
    style: 'concise, punchy, attention-grabbing, thread-friendly',
  },
  linkedin: {
    maxCaptionLength: 3000,
    maxHashtags: 5,
    style: 'professional, thought-leadership, business value-focused',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapRow(row: Record<string, unknown>): TextEnhancement {
  return {
    id: row.id as string,
    videoTaskId: row.video_task_id as string,
    platform: row.platform as SocialPlatform,
    caption: (row.caption as string) ?? '',
    hashtags: (row.hashtags as string[]) ?? [],
    callToAction: (row.call_to_action as string) ?? '',
    tone: (row.tone as string) ?? 'engaging',
    language: (row.language as string) ?? 'en',
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class TextEnhancementService {
  // -----------------------------------------------------------------------
  // Generate enhancements for all requested platforms
  // -----------------------------------------------------------------------

  static async generateForPlatforms(
    request: EnhancementRequest,
  ): Promise<TextEnhancement[]> {
    logger.info('Generating text enhancements', {
      videoTaskId: request.videoTaskId,
      platforms: request.platforms,
    });

    const results: TextEnhancement[] = [];

    for (const platform of request.platforms) {
      const enhancement = await TextEnhancementService.generateForPlatform(
        request,
        platform,
      );
      results.push(enhancement);
    }

    logger.info('Text enhancements generated', {
      videoTaskId: request.videoTaskId,
      count: results.length,
    });

    return results;
  }

  // -----------------------------------------------------------------------
  // Generate enhancement for a single platform
  // -----------------------------------------------------------------------

  static async generateForPlatform(
    request: EnhancementRequest,
    platform: SocialPlatform,
  ): Promise<TextEnhancement> {
    if (!env.ANTHROPIC_API_KEY) {
      throw new ExternalServiceError(
        'Anthropic',
        'ANTHROPIC_API_KEY is not configured for text enhancement',
      );
    }

    const limits = PLATFORM_LIMITS[platform];
    const tone = request.tone ?? 'engaging';
    const language = request.language ?? 'en';

    const prompt = `You are an expert social media marketing copywriter. Generate optimised marketing content for a product video being published to ${platform}.

Product: ${request.productTitle}
Description: ${request.productDescription}
${request.targetAudience ? `Target Audience: ${request.targetAudience}` : ''}
${request.brandVoice ? `Brand Voice: ${request.brandVoice}` : ''}

Platform: ${platform}
Style: ${limits.style}
Tone: ${tone}
Language: ${language}

Constraints:
- Caption: max ${limits.maxCaptionLength} characters
- Hashtags: max ${limits.maxHashtags} hashtags
- Include a clear call-to-action

Respond ONLY with valid JSON in this exact format (no markdown, no code blocks):
{
  "caption": "Your caption text here",
  "hashtags": ["hashtag1", "hashtag2"],
  "call_to_action": "Your CTA here"
}`;

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: env.ANTHROPIC_SONNET_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText =
      message.content[0].type === 'text' ? message.content[0].text : '';

    let parsed: { caption: string; hashtags: string[]; call_to_action: string };
    try {
      parsed = JSON.parse(responseText);
    } catch {
      logger.warn('Failed to parse AI response, using fallback', {
        platform,
        responseText,
      });
      parsed = {
        caption: `Check out ${request.productTitle}! ${request.productDescription}`,
        hashtags: [request.productTitle.replace(/\s+/g, '').toLowerCase()],
        call_to_action: 'Shop now!',
      };
    }

    // Enforce limits
    const caption = parsed.caption.slice(0, limits.maxCaptionLength);
    const hashtags = parsed.hashtags.slice(0, limits.maxHashtags);
    const callToAction = parsed.call_to_action;

    // Persist to database
    const id = generateId();
    const result = await pool.query(
      `INSERT INTO text_enhancements
         (id, video_task_id, platform, caption, hashtags, call_to_action, tone, language, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       RETURNING *`,
      [
        id,
        request.videoTaskId,
        platform,
        caption,
        hashtags,
        callToAction,
        tone,
        language,
        JSON.stringify({
          productTitle: request.productTitle,
          targetAudience: request.targetAudience,
          brandVoice: request.brandVoice,
        }),
      ],
    );

    logger.info('Text enhancement saved', { id, platform, videoTaskId: request.videoTaskId });

    return mapRow(result.rows[0]);
  }

  // -----------------------------------------------------------------------
  // Get enhancements by video task ID
  // -----------------------------------------------------------------------

  static async getByVideoTaskId(videoTaskId: string): Promise<TextEnhancement[]> {
    const result = await pool.query(
      `SELECT * FROM text_enhancements WHERE video_task_id = $1 ORDER BY platform`,
      [videoTaskId],
    );
    return result.rows.map(mapRow);
  }

  // -----------------------------------------------------------------------
  // Get enhancement by ID
  // -----------------------------------------------------------------------

  static async getById(id: string): Promise<TextEnhancement | null> {
    const result = await pool.query(
      `SELECT * FROM text_enhancements WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return mapRow(result.rows[0]);
  }

  // -----------------------------------------------------------------------
  // Update an enhancement (manual edit)
  // -----------------------------------------------------------------------

  static async update(
    id: string,
    data: Partial<{ caption: string; hashtags: string[]; callToAction: string }>,
  ): Promise<TextEnhancement> {
    const fields: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (data.caption !== undefined) {
      fields.push(`caption = $${paramIndex++}`);
      params.push(data.caption);
    }
    if (data.hashtags !== undefined) {
      fields.push(`hashtags = $${paramIndex++}`);
      params.push(data.hashtags);
    }
    if (data.callToAction !== undefined) {
      fields.push(`call_to_action = $${paramIndex++}`);
      params.push(data.callToAction);
    }

    if (fields.length === 0) {
      const existing = await TextEnhancementService.getById(id);
      if (!existing) throw new Error(`Text enhancement '${id}' not found`);
      return existing;
    }

    const result = await pool.query(
      `UPDATE text_enhancements SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex} RETURNING *`,
      [...params, id],
    );

    if (result.rows.length === 0) {
      throw new Error(`Text enhancement '${id}' not found`);
    }

    return mapRow(result.rows[0]);
  }
}
