// ---------------------------------------------------------------------------
// Reusable loading skeleton components
// ---------------------------------------------------------------------------

function SkeletonPulse({ className = '' }: { className?: string }) {
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
          <tr className="border-b border-surface-200">
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="py-3 px-4">
                <SkeletonPulse className="h-4 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <tr key={rowIdx} className="border-b border-surface-100">
              {Array.from({ length: columns }).map((_, colIdx) => (
                <td key={colIdx} className="py-3 px-4">
                  <SkeletonPulse
                    className={`h-4 ${colIdx === 0 ? 'w-40' : 'w-16'}`}
                  />
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
// ChartSkeleton - mimics a chart area while loading
// ---------------------------------------------------------------------------

interface ChartSkeletonProps {
  height?: string;
}

export function ChartSkeleton({ height = 'h-72' }: ChartSkeletonProps) {
  return (
    <div className={`${height} flex items-end gap-2 px-4 pb-4`}>
      {Array.from({ length: 12 }).map((_, i) => {
        const h = 30 + Math.random() * 60;
        return (
          <div key={i} className="flex-1 flex flex-col justify-end">
            <SkeletonPulse
              className="w-full rounded-t"
              style={{ height: `${h}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPISkeleton - mimics KPI cards row
// ---------------------------------------------------------------------------

export function KPISkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${count} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-surface-200 p-5"
        >
          <SkeletonPulse className="h-4 w-24 mb-2" />
          <SkeletonPulse className="h-8 w-20 mb-2" />
          <SkeletonPulse className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
