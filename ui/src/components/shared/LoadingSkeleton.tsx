// ---------------------------------------------------------------------------
// Skeleton loading placeholders for tables, charts, and cards
// ---------------------------------------------------------------------------

function Pulse({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-200 rounded ${className}`} />;
}

// ---------------------------------------------------------------------------
// TableSkeleton - mimics a data table while loading
// ---------------------------------------------------------------------------

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 5, columns = 6 }: TableSkeletonProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-100">
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="py-3 px-3">
                <Pulse className="h-4 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <tr key={rowIdx} className="border-b border-surface-50">
              {Array.from({ length: columns }).map((_, colIdx) => (
                <td key={colIdx} className="py-3 px-3">
                  <Pulse className={`h-4 ${colIdx === 0 ? 'w-32' : 'w-16'}`} />
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
// ChartSkeleton - mimics a recharts container while loading
// ---------------------------------------------------------------------------

interface ChartSkeletonProps {
  height?: string;
}

export function ChartSkeleton({ height = 'h-80' }: ChartSkeletonProps) {
  return (
    <div className={`${height} flex items-end gap-2 px-4 pb-4 pt-8`}>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-2">
          <Pulse
            className="w-full rounded-t"
            style={{ height: `${30 + Math.random() * 60}%` } as React.CSSProperties}
          />
          <Pulse className="h-3 w-6" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardSkeleton - mimics a metric / info card while loading
// ---------------------------------------------------------------------------

interface CardSkeletonProps {
  lines?: number;
}

export function CardSkeleton({ lines = 4 }: CardSkeletonProps) {
  return (
    <div className="space-y-4 p-1">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="flex items-center justify-between">
          <Pulse className="h-4 w-32" />
          <Pulse className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
