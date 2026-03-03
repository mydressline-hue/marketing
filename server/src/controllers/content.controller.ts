/**
 * Content Controller.
 *
 * Express request handlers for marketing content management. Each handler
 * delegates to the ContentService and returns structured JSON responses.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { ContentService } from '../services/content.service';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /content
 * List content with optional filters and pagination.
 */
export const listContent = asyncHandler(async (req: Request, res: Response) => {
  const { status, countryId, language, page, limit, sortBy, sortOrder } = req.query;

  const filters = {
    status: status as string | undefined,
    countryId: countryId as string | undefined,
    language: language as string | undefined,
  };

  const pagination = {
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
    sortBy: sortBy as string | undefined,
    sortOrder: sortOrder as 'asc' | 'desc' | undefined,
  };

  const result = await ContentService.list(filters, pagination);

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
 * GET /content/search
 * Full-text search across content title and body.
 */
export const searchContent = asyncHandler(async (req: Request, res: Response) => {
  const { q, page, limit } = req.query;

  const pagination = {
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
  };

  const result = await ContentService.searchContent(
    (q as string) || '',
    pagination,
  );

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
 * GET /content/:id
 * Retrieve a single content item by ID.
 */
export const getContentById = asyncHandler(async (req: Request, res: Response) => {
  const content = await ContentService.getById(req.params.id);

  res.json({
    success: true,
    data: content,
  });
});

/**
 * POST /content
 * Create a new content item.
 */
export const createContent = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const content = await ContentService.create(req.body, userId);

  res.status(201).json({
    success: true,
    data: content,
  });
});

/**
 * PUT /content/:id
 * Update an existing content item.
 */
export const updateContent = asyncHandler(async (req: Request, res: Response) => {
  const content = await ContentService.update(req.params.id, req.body);

  res.json({
    success: true,
    data: content,
  });
});

/**
 * DELETE /content/:id
 * Soft-delete a content item (archive).
 */
export const deleteContent = asyncHandler(async (req: Request, res: Response) => {
  await ContentService.delete(req.params.id);

  res.status(204).send();
});

/**
 * POST /content/:id/publish
 * Publish a content item.
 */
export const publishContent = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const content = await ContentService.publish(req.params.id, userId);

  res.json({
    success: true,
    data: content,
  });
});

/**
 * POST /content/:id/unpublish
 * Unpublish a content item (revert to draft).
 */
export const unpublishContent = asyncHandler(async (req: Request, res: Response) => {
  const content = await ContentService.unpublish(req.params.id);

  res.json({
    success: true,
    data: content,
  });
});
