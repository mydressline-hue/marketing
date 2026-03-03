import { z } from 'zod';

// ---------------------------------------------------------------------------
// Query parameter validation schemas for list endpoints
// ---------------------------------------------------------------------------

/**
 * Pagination schema for list endpoints.
 * Coerces string query params to numbers with sensible defaults.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Sort schema for list endpoints.
 * Allows optional sort_by field name and sort_order direction.
 */
export const sortSchema = z.object({
  sort_by: z.string().optional(),
  sort_order: z.enum(['asc', 'desc']).default('asc'),
});

/**
 * Date range filter schema with cross-field validation.
 * Ensures end_date is after start_date when both are provided.
 */
export const dateRangeFilterSchema = z.object({
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
}).refine(
  (data) => !data.end_date || !data.start_date || new Date(data.end_date) > new Date(data.start_date),
  {
    message: 'end_date must be after start_date',
    path: ['end_date'],
  },
);

/**
 * Combined list query schema that merges pagination, sorting, and date range
 * filtering into a single schema for convenience.
 */
export const listQuerySchema = paginationSchema
  .merge(sortSchema)
  .merge(
    z.object({
      start_date: z.string().datetime().optional(),
      end_date: z.string().datetime().optional(),
    }),
  )
  .refine(
    (data) => !data.end_date || !data.start_date || new Date(data.end_date) > new Date(data.start_date),
    {
      message: 'end_date must be after start_date',
      path: ['end_date'],
    },
  );

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type PaginationQuery = z.infer<typeof paginationSchema>;
export type SortQuery = z.infer<typeof sortSchema>;
export type DateRangeFilterQuery = z.infer<typeof dateRangeFilterSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
