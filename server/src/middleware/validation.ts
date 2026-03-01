import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

import { ValidationError } from '../utils/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type RequestSource = 'body' | 'query' | 'params';

// ---------------------------------------------------------------------------
// Core validation middleware factory
// ---------------------------------------------------------------------------

/**
 * Returns Express middleware that validates `req[source]` against the
 * provided Zod schema. On failure a `ValidationError` is thrown with
 * field-level details extracted from the `ZodError`.
 *
 * @param schema - Any Zod schema to validate against.
 * @param source - Which part of the request to validate (defaults to 'body').
 */
export function validate(schema: ZodSchema, source: RequestSource = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const fieldErrors = formatZodErrors(result.error);
      return next(new ValidationError('Validation failed', fieldErrors));
    }

    // Replace the source with the parsed (and potentially transformed) data
    req[source] = result.data;
    next();
  };
}

// ---------------------------------------------------------------------------
// Convenience shorthands
// ---------------------------------------------------------------------------

/** Validate `req.body` against the given schema. */
export function validateBody(schema: ZodSchema) {
  return validate(schema, 'body');
}

/** Validate `req.query` against the given schema. */
export function validateQuery(schema: ZodSchema) {
  return validate(schema, 'query');
}

/** Validate `req.params` against the given schema. */
export function validateParams(schema: ZodSchema) {
  return validate(schema, 'params');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Transforms a `ZodError` into a flat array of field-level error objects
 * suitable for API responses.
 */
function formatZodErrors(
  error: ZodError,
): Array<{ field: string; message: string }> {
  return error.errors.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}
