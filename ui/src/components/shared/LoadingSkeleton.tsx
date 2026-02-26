function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-surface-200 rounded ${className}`} />
  );
}

export function KPISkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-surface-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Skeleton className="w-4 h-4 rounded" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ lines = 4, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-surface-200 ${className}`}>
      <div className="px-5 py-4 border-b border-surface-100">
        <Skeleton className="h-5 w-40 mb-1" />
        <Skeleton className="h-3 w-60" />
      </div>
      <div className="p-5 space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200">
      <div className="px-5 py-4 border-b border-surface-100">
        <Skeleton className="h-5 w-48 mb-1" />
        <Skeleton className="h-3 w-64" />
      </div>
      <div className="p-5">
        <div className="space-y-3">
          <div className="flex gap-4 pb-3 border-b border-surface-200">
            {Array.from({ length: cols }).map((_, i) => (
              <Skeleton key={i} className="h-4 flex-1" />
            ))}
          </div>
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex gap-4 py-2">
              {Array.from({ length: cols }).map((_, j) => (
                <Skeleton key={j} className="h-4 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChartSkeleton({ height = 250 }: { height?: number }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200">
      <div className="px-5 py-4 border-b border-surface-100">
        <Skeleton className="h-5 w-36 mb-1" />
        <Skeleton className="h-3 w-52" />
      </div>
      <div className="p-5">
        <Skeleton className="w-full rounded-lg" style={{ height: `${height}px` }} />
      </div>
    </div>
  );
}
