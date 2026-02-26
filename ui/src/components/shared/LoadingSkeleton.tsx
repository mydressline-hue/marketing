// ---------------------------------------------------------------------------
// Reusable loading skeleton components for dashboard pages
// ---------------------------------------------------------------------------

function Pulse({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-200 rounded ${className}`} />;
}

/** Skeleton for a single KPI card */
function KPISkeletonSingle() {
  return (
    <div className="bg-white rounded-xl border border-surface-200 p-5 space-y-3">
      <Pulse className="h-4 w-32" />
      <Pulse className="h-8 w-24" />
      <Pulse className="h-5 w-16 rounded-full" />
    </div>
  );
}

/** Skeleton for a row of 4 KPI cards */
export function KPISkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <KPISkeletonSingle key={i} />
      ))}
    </div>
  );
}

/** Skeleton for a chart area */
export function ChartSkeleton({ height = 'h-80' }: { height?: string }) {
  return (
    <div className={`${height} flex flex-col justify-end gap-2 p-4`}>
      <div className="flex items-end gap-2 flex-1">
        {Array.from({ length: 12 }).map((_, i) => (
          <Pulse
            key={i}
            className="flex-1"
            style={{ height: `${30 + Math.random() * 60}%` } as React.CSSProperties}
          />
        ))}
      </div>
      <Pulse className="h-4 w-full" />
    </div>
  );
}

/** Skeleton for a data table */
export function TableSkeleton({ rows = 4, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3 p-4">
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
            <Pulse key={`${r}-${c}`} className="h-6 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
