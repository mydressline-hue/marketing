// ---------------------------------------------------------------------------
// Skeleton loading placeholders for various UI patterns
// ---------------------------------------------------------------------------

function Shimmer({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-surface-200/60 ${className}`}
    />
  );
}

// ---------------------------------------------------------------------------
// KPI Skeleton - matches the shape of a KPICard
// ---------------------------------------------------------------------------

export function KPISkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-surface-200 p-5 space-y-3"
        >
          <Shimmer className="h-4 w-24" />
          <Shimmer className="h-7 w-20" />
          <Shimmer className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table Skeleton - mimics a data table with header + rows
// ---------------------------------------------------------------------------

export function TableSkeleton({
  rows = 5,
  columns = 6,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-100">
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-4 py-3">
                <Shimmer className="h-4 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-b border-surface-50">
              {Array.from({ length: columns }).map((_, c) => (
                <td key={c} className="px-4 py-3">
                  <Shimmer className={`h-4 ${c === 0 ? 'w-28' : 'w-16'}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart Skeleton - generic chart-area placeholder
// ---------------------------------------------------------------------------

export function ChartSkeleton({ height = 'h-72' }: { height?: string }) {
  return (
    <div className={`${height} flex items-end gap-2 px-4 pb-4`}>
      {[40, 65, 50, 80, 55, 70, 45, 75, 60, 85, 50, 68].map((h, i) => (
        <Shimmer
          key={i}
          className="flex-1 rounded-t"
          style={{ height: `${h}%` } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card Skeleton - generic card with title area + content placeholder
// ---------------------------------------------------------------------------

export function CardSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200">
      <div className="px-5 py-4 border-b border-surface-100 space-y-2">
        <Shimmer className="h-5 w-40" />
        <Shimmer className="h-3.5 w-56" />
      </div>
      <div className="p-5 space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Shimmer key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
