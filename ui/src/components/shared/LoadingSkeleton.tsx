// ---------------------------------------------------------------------------
// Reusable skeleton loaders for different UI patterns
// ---------------------------------------------------------------------------

function Pulse({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-200 rounded ${className}`} />;
}

// ---------------------------------------------------------------------------
// KPISkeleton – mimics a KPICard row
// ---------------------------------------------------------------------------

export function KPISkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-surface-200 p-5 space-y-3">
          <Pulse className="h-3 w-24" />
          <Pulse className="h-7 w-20" />
          <Pulse className="h-4 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TableSkeleton – mimics a data table
// ---------------------------------------------------------------------------

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 p-5 space-y-4">
      {/* Header row */}
      <div className="flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Pulse key={`h-${i}`} className="h-4 flex-1" />
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Pulse key={`${r}-${c}`} className="h-4 flex-1 opacity-70" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChartSkeleton – mimics a chart area
// ---------------------------------------------------------------------------

export function ChartSkeleton({ height = 'h-72' }: { height?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-surface-200 p-5 space-y-4`}>
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Pulse className="h-4 w-40" />
          <Pulse className="h-3 w-56" />
        </div>
        <Pulse className="h-6 w-6 rounded" />
      </div>
      <Pulse className={`${height} w-full rounded-lg`} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardSkeleton – mimics a generic card
// ---------------------------------------------------------------------------

export function CardSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 p-5 space-y-3">
      <Pulse className="h-4 w-32" />
      {Array.from({ length: lines }).map((_, i) => (
        <Pulse key={i} className={`h-3 ${i % 2 === 0 ? 'w-full' : 'w-3/4'}`} />
      ))}
    </div>
  );
}
