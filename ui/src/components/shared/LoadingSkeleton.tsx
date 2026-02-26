// ---------------------------------------------------------------------------
// Reusable loading skeleton components
// ---------------------------------------------------------------------------

function Pulse({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-200 rounded ${className}`} />;
}

// ---------------------------------------------------------------------------
// TableSkeleton - mimics a DataTable while data is loading
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
                <Pulse className="h-4 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-b border-surface-100">
              {Array.from({ length: columns }).map((_, c) => (
                <td key={c} className="py-3 px-4">
                  <Pulse className={`h-4 ${c === 0 ? 'w-40' : 'w-16'}`} />
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
// CardSkeleton - mimics a Card's inner content while data is loading
// ---------------------------------------------------------------------------

interface CardSkeletonProps {
  lines?: number;
}

export function CardSkeleton({ lines = 4 }: CardSkeletonProps) {
  return (
    <div className="space-y-4">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="flex items-center justify-between">
          <Pulse className="h-4 w-28" />
          <Pulse className="h-4 w-20" />
        </div>
      ))}
      <Pulse className="h-10 w-full rounded-lg mt-2" />
    </div>
  );
}
