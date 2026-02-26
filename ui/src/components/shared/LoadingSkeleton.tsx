/**
 * Skeleton loading placeholders for the various content types used across the
 * 23 pages of the Growth Engine UI. Each skeleton mirrors the approximate
 * dimensions and layout of its real counterpart so that layout shift is
 * minimised when data arrives.
 *
 * All components use Tailwind's `animate-pulse` and the project's `surface-*`
 * colour tokens.
 */

// ---------------------------------------------------------------------------
// Primitive building block
// ---------------------------------------------------------------------------

interface SkeletonBlockProps {
  className?: string;
}

function SkeletonBlock({ className = '' }: SkeletonBlockProps) {
  return (
    <div
      className={`animate-pulse rounded bg-surface-200 ${className}`}
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// KPI Skeleton (matches KPICard layout)
// ---------------------------------------------------------------------------

export function KPISkeleton() {
  return (
    <div className="bg-white rounded-xl border border-surface-200 p-5">
      {/* Label */}
      <SkeletonBlock className="h-4 w-24 mb-3" />
      {/* Value */}
      <SkeletonBlock className="h-8 w-32 mb-3" />
      {/* Trend badge */}
      <SkeletonBlock className="h-5 w-16 rounded-full" />
    </div>
  );
}

/** A row of KPI skeletons (default: 4, matching a typical KPI bar). */
export function KPIRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: count }, (_, i) => (
        <KPISkeleton key={i} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table Skeleton (matches DataTable layout)
// ---------------------------------------------------------------------------

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 5, columns = 6 }: TableSkeletonProps) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-surface-100">
        {Array.from({ length: columns }, (_, i) => (
          <SkeletonBlock
            key={i}
            className={`h-4 ${i === 0 ? 'w-32' : 'w-20'} flex-shrink-0`}
          />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }, (_, rowIdx) => (
        <div
          key={rowIdx}
          className="flex items-center gap-4 px-5 py-3 border-b border-surface-50 last:border-b-0"
        >
          {Array.from({ length: columns }, (_, colIdx) => (
            <SkeletonBlock
              key={colIdx}
              className={`h-4 ${colIdx === 0 ? 'w-36' : 'w-16'} flex-shrink-0`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card Skeleton (matches Card component layout)
// ---------------------------------------------------------------------------

interface CardSkeletonProps {
  /** Show a title bar at the top. */
  hasHeader?: boolean;
  /** Approximate content height. Defaults to `h-40`. */
  contentHeight?: string;
}

export function CardSkeleton({
  hasHeader = true,
  contentHeight = 'h-40',
}: CardSkeletonProps) {
  return (
    <div className="bg-white rounded-xl border border-surface-200">
      {hasHeader && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
          <SkeletonBlock className="h-5 w-36" />
          <SkeletonBlock className="h-8 w-20 rounded-md" />
        </div>
      )}
      <div className={`p-5 ${contentHeight}`}>
        <SkeletonBlock className="h-full w-full rounded-lg" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart Skeleton (placeholder for Recharts/Chart.js areas)
// ---------------------------------------------------------------------------

interface ChartSkeletonProps {
  /** Approximate height. Defaults to `h-64`. */
  height?: string;
  /** Show a card wrapper. */
  withCard?: boolean;
}

export function ChartSkeleton({
  height = 'h-64',
  withCard = true,
}: ChartSkeletonProps) {
  const inner = (
    <div className={`${height} flex items-end gap-2 px-2 pb-2`}>
      {/* Fake bar chart bars of varying height */}
      {[40, 65, 50, 80, 55, 70, 45, 90, 60, 75, 50, 85].map((h, i) => (
        <div key={i} className="flex-1 flex flex-col justify-end h-full">
          <SkeletonBlock
            className="w-full rounded-t"
            style={{ height: `${h}%` }}
          />
        </div>
      ))}
    </div>
  );

  if (!withCard) return inner;

  return (
    <div className="bg-white rounded-xl border border-surface-200">
      <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
        <SkeletonBlock className="h-5 w-40" />
        <div className="flex gap-2">
          <SkeletonBlock className="h-7 w-16 rounded-md" />
          <SkeletonBlock className="h-7 w-16 rounded-md" />
        </div>
      </div>
      <div className="p-5">{inner}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Skeleton (full page loading state)
// ---------------------------------------------------------------------------

/**
 * A full-page skeleton that mimics a typical page layout:
 * - Page header
 * - KPI row
 * - Two-column grid with a chart and a table
 */
export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading page content" role="status">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <SkeletonBlock className="h-7 w-56 mb-2" />
          <SkeletonBlock className="h-4 w-80" />
        </div>
        <div className="flex gap-2">
          <SkeletonBlock className="h-9 w-28 rounded-lg" />
          <SkeletonBlock className="h-9 w-9 rounded-lg" />
        </div>
      </div>

      {/* KPI row */}
      <KPIRowSkeleton />

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>

      {/* Table */}
      <TableSkeleton />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Re-export the raw block for custom compositions
// ---------------------------------------------------------------------------

export { SkeletonBlock };
