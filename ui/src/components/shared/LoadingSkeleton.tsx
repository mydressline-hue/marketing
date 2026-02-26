// ---------------------------------------------------------------------------
// Skeleton primitives & composite loading placeholders
// ---------------------------------------------------------------------------

function SkeletonPulse({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-200 rounded ${className}`} />;
}

// ---------------------------------------------------------------------------
// TableSkeleton – mimics a data table while loading
// ---------------------------------------------------------------------------

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 5, columns = 4 }: TableSkeletonProps) {
  return (
    <div className="w-full space-y-3">
      {/* Header row */}
      <div className="flex gap-4 pb-3 border-b border-surface-200">
        {Array.from({ length: columns }).map((_, c) => (
          <SkeletonPulse key={`h-${c}`} className="h-4 flex-1 rounded-md" />
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={`r-${r}`}
          className="flex gap-4 py-2 border-b border-surface-100"
        >
          {Array.from({ length: columns }).map((_, c) => (
            <SkeletonPulse
              key={`r-${r}-c-${c}`}
              className="h-4 flex-1 rounded-md"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardSkeleton – generic card placeholder
// ---------------------------------------------------------------------------

interface CardSkeletonProps {
  lines?: number;
  className?: string;
}

export function CardSkeleton({ lines = 4, className = '' }: CardSkeletonProps) {
  return (
    <div
      className={`bg-white rounded-xl border border-surface-200 p-5 space-y-4 ${className}`}
    >
      <SkeletonPulse className="h-5 w-1/3 rounded-md" />
      <SkeletonPulse className="h-3 w-1/2 rounded-md" />
      <div className="space-y-3 pt-2">
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonPulse
            key={i}
            className={`h-4 rounded-md ${i % 2 === 0 ? 'w-full' : 'w-3/4'}`}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPISkeleton – mimics a row of KPI cards
// ---------------------------------------------------------------------------

interface KPISkeletonProps {
  count?: number;
}

export function KPISkeleton({ count = 4 }: KPISkeletonProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-surface-200 p-5 space-y-3"
        >
          <SkeletonPulse className="h-3 w-1/2 rounded-md" />
          <SkeletonPulse className="h-7 w-1/3 rounded-md" />
          <SkeletonPulse className="h-4 w-1/4 rounded-full" />
        </div>
      ))}
    </div>
  );
}
