// ---------------------------------------------------------------------------
// Reusable skeleton / shimmer components for loading states
// ---------------------------------------------------------------------------

function SkeletonPulse({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-200 rounded ${className}`} />;
}

// ---------------------------------------------------------------------------
// TableSkeleton – mimics a data-table while content is loading
// ---------------------------------------------------------------------------

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 5, columns = 4 }: TableSkeletonProps) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-surface-100 bg-surface-50">
        {Array.from({ length: columns }).map((_, i) => (
          <SkeletonPulse key={`h-${i}`} className="h-4 flex-1 max-w-[140px]" />
        ))}
      </div>
      {/* Body rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={`r-${r}`}
          className="flex items-center gap-4 px-5 py-4 border-b border-surface-50 last:border-0"
        >
          {Array.from({ length: columns }).map((_, c) => (
            <SkeletonPulse
              key={`r-${r}-c-${c}`}
              className={`h-4 flex-1 ${c === 0 ? 'max-w-[200px]' : 'max-w-[120px]'}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardSkeleton – mimics a Card while content is loading
// ---------------------------------------------------------------------------

interface CardSkeletonProps {
  /** Number of body lines to render */
  lines?: number;
  /** Show a simulated chart area */
  showChart?: boolean;
}

export function CardSkeleton({ lines = 3, showChart = false }: CardSkeletonProps) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 p-5 space-y-4">
      {/* Title area */}
      <div className="space-y-2">
        <SkeletonPulse className="h-5 w-1/3" />
        <SkeletonPulse className="h-3 w-1/2" />
      </div>
      {/* Chart placeholder */}
      {showChart && <SkeletonPulse className="h-48 w-full rounded-lg" />}
      {/* Body lines */}
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonPulse
            key={i}
            className={`h-4 ${i % 2 === 0 ? 'w-full' : 'w-3/4'}`}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPISkeleton – mimics a row of KPI cards
// ---------------------------------------------------------------------------

export function KPISkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-surface-200 p-5 space-y-3">
          <SkeletonPulse className="h-3 w-24" />
          <SkeletonPulse className="h-7 w-20" />
          <SkeletonPulse className="h-4 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
