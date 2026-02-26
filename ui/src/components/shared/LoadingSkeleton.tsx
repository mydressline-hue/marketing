/**
 * Skeleton loading placeholders for tables and cards.
 *
 * These components show animated pulse placeholders while data is being
 * fetched from the API, maintaining the visual layout of the page.
 */

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

/**
 * Renders a table-shaped skeleton with animated pulse bars.
 */
export function TableSkeleton({ rows = 5, columns = 6 }: TableSkeletonProps) {
  return (
    <div className="animate-pulse">
      {/* Header row */}
      <div className="flex gap-4 mb-4 pb-3 border-b border-surface-100">
        {Array.from({ length: columns }).map((_, i) => (
          <div
            key={`head-${i}`}
            className="h-3 bg-surface-200 rounded flex-1"
            style={{ maxWidth: i === 0 ? '140px' : '100px' }}
          />
        ))}
      </div>
      {/* Body rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={`row-${r}`} className="flex gap-4 py-3 border-b border-surface-50">
          {Array.from({ length: columns }).map((_, c) => (
            <div
              key={`cell-${r}-${c}`}
              className="h-4 bg-surface-100 rounded flex-1"
              style={{ maxWidth: c === 0 ? '160px' : '120px' }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

interface CardSkeletonProps {
  lines?: number;
}

/**
 * Renders a card-shaped skeleton with animated pulse lines.
 */
export function CardSkeleton({ lines = 4 }: CardSkeletonProps) {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-5 bg-surface-200 rounded w-1/3" />
      <div className="h-3 bg-surface-100 rounded w-2/3" />
      <div className="space-y-2 mt-4">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={`line-${i}`}
            className="h-10 bg-surface-100 rounded"
            style={{ width: `${90 - i * 5}%` }}
          />
        ))}
      </div>
    </div>
  );
}
