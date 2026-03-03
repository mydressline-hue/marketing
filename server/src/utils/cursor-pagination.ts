/**
 * Cursor-based pagination utilities.
 *
 * Provides helpers for encoding / decoding opaque cursors and building the
 * corresponding SQL WHERE + ORDER BY + LIMIT clauses. Cursor-based pagination
 * avoids the performance pitfalls of large OFFSET values and delivers a
 * stable iteration order even when rows are inserted or deleted between pages.
 *
 * Cursors are base64-encoded JSON payloads containing the row ID and the
 * value of the sort column at the boundary row.
 */

// ---------------------------------------------------------------------------
// Cursor encoding / decoding
// ---------------------------------------------------------------------------

export interface CursorPayload {
  id: string;
  sortValue: string | number;
}

/**
 * Encode a cursor from the boundary row's ID and the value of the sort
 * column. The returned string is opaque to the client.
 */
export function encodeCursor(id: string, sortValue: string | number): string {
  const payload: CursorPayload = { id, sortValue };
  return Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64');
}

/**
 * Decode an opaque cursor string back into its constituent parts. Throws if
 * the cursor is malformed.
 */
export function decodeCursor(cursor: string): CursorPayload {
  try {
    const json = Buffer.from(cursor, 'base64').toString('utf-8');
    const parsed = JSON.parse(json);

    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      typeof parsed.id !== 'string' ||
      (typeof parsed.sortValue !== 'string' && typeof parsed.sortValue !== 'number')
    ) {
      throw new Error('Invalid cursor payload structure');
    }

    return { id: parsed.id, sortValue: parsed.sortValue };
  } catch {
    throw new Error('Invalid cursor: unable to decode');
  }
}

// ---------------------------------------------------------------------------
// SQL query builder
// ---------------------------------------------------------------------------

export interface CursorQueryResult {
  sql: string;
  params: unknown[];
}

/**
 * Allowed sort columns – a whitelist that prevents SQL injection when
 * the column name is interpolated into the query. Maps public-facing names
 * to fully-qualified column references.
 */
const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  name: 'c.name',
  platform: 'c.platform',
  status: 'c.status',
  budget: 'c.budget',
  spent: 'c.spent',
  start_date: 'c.start_date',
  end_date: 'c.end_date',
  created_at: 'c.created_at',
  updated_at: 'c.updated_at',
};

/** Default number of rows per page when no limit is specified. */
const DEFAULT_CURSOR_LIMIT = 20;

/** Maximum number of rows a client may request in a single page. */
const MAX_CURSOR_LIMIT = 100;

/**
 * Build a SQL WHERE clause (including ORDER BY and LIMIT) for cursor-based
 * pagination.
 *
 * The generated clause uses a "seek" / "keyset" approach: for a given sort
 * column `s` and row id `id`, the next page in ascending order is:
 *
 *     WHERE (s > $cursorValue) OR (s = $cursorValue AND c.id > $cursorId)
 *     ORDER BY s ASC, c.id ASC
 *     LIMIT $limit + 1
 *
 * We fetch one extra row (`limit + 1`) to cheaply determine whether more
 * rows exist beyond the current page.
 *
 * @param sortColumn  Public-facing sort column name (e.g. `"created_at"`).
 * @param cursor      Opaque cursor string from the previous response, or
 *                    `undefined` for the first page.
 * @param limit       Maximum number of rows to return.
 * @param direction   Sort direction (`"asc"` or `"desc"`).
 * @param paramOffset Starting `$N` index (1-based) for query parameters, so
 *                    the caller can prepend its own filter parameters.
 */
export function buildCursorQuery(
  sortColumn: string,
  cursor?: string,
  limit?: number,
  direction: 'asc' | 'desc' = 'asc',
  paramOffset: number = 1,
): CursorQueryResult {
  // Resolve the sort column through the whitelist; fall back to created_at.
  const resolvedColumn = ALLOWED_SORT_COLUMNS[sortColumn] ?? 'c.created_at';

  // Clamp limit to a sane range.
  const effectiveLimit = Math.min(
    Math.max(limit ?? DEFAULT_CURSOR_LIMIT, 1),
    MAX_CURSOR_LIMIT,
  );

  const params: unknown[] = [];
  const parts: string[] = [];

  if (cursor) {
    const decoded = decodeCursor(cursor);
    const comparator = direction === 'asc' ? '>' : '<';

    // Keyset condition: (sortCol > cursorValue) OR (sortCol = cursorValue AND id > cursorId)
    // For descending: (sortCol < cursorValue) OR (sortCol = cursorValue AND id < cursorId)
    const p1 = paramOffset;
    const p2 = paramOffset + 1;
    parts.push(
      `(${resolvedColumn} ${comparator} $${p1} OR (${resolvedColumn} = $${p1} AND c.id ${comparator} $${p2}))`,
    );
    params.push(decoded.sortValue, decoded.id);
  }

  const cursorParamCount = params.length;
  const limitParamIndex = paramOffset + cursorParamCount;

  const orderDirection = direction === 'asc' ? 'ASC' : 'DESC';

  // We request one extra row to determine if there is a next page.
  const sql = [
    parts.length > 0 ? parts.join(' AND ') : '',
    `ORDER BY ${resolvedColumn} ${orderDirection}, c.id ${orderDirection}`,
    `LIMIT $${limitParamIndex}`,
  ]
    .filter(Boolean)
    .join(' ');

  params.push(effectiveLimit + 1);

  return { sql, params };
}
