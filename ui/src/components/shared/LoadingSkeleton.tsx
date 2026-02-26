/**
 * Loading skeleton components for data-fetching states.
 */

// ---------------------------------------------------------------------------
// Base shimmer block
// ---------------------------------------------------------------------------

function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-surface-200 ${className}`}
    />
  );
}

// ---------------------------------------------------------------------------
// TableSkeleton -- mimics a data table while loading
// ---------------------------------------------------------------------------

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full space-y-3">
      {/* Header row */}
      <div className="flex gap-4">
        {Array.from({ length: cols }).map((_, c) => (
          <SkeletonBlock key={`h-${c}`} className="h-4 flex-1" />
        ))}
      </div>

      {/* Data rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={`r-${r}`} className="flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonBlock key={`r-${r}-c-${c}`} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardSkeleton -- mimics a card / stat block while loading
// ---------------------------------------------------------------------------

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-surface-100 bg-white p-5 space-y-3">
      <SkeletonBlock className="h-5 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock
          key={i}
          className={`h-4 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChartSkeleton -- mimics a chart area while loading
// ---------------------------------------------------------------------------

export function ChartSkeleton() {
  return (
    <div className="rounded-xl border border-surface-100 bg-white p-5 space-y-3">
      <SkeletonBlock className="h-5 w-1/4" />
      <SkeletonBlock className="h-64 w-full" />
    </div>
  );
}

export default { TableSkeleton, CardSkeleton, ChartSkeleton };
