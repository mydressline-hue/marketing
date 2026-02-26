interface SkeletonProps {
  className?: string;
}

function SkeletonPulse({ className = '' }: SkeletonProps) {
  return (
    <div className={`animate-pulse bg-surface-200 rounded ${className}`} />
  );
}

export function KPISkeleton() {
  return (
    <div className="animate-pulse p-4 rounded-xl border border-surface-100 bg-white space-y-3">
      <SkeletonPulse className="h-3 w-1/2" />
      <SkeletonPulse className="h-8 w-2/3" />
      <SkeletonPulse className="h-3 w-1/3" />
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonPulse key={`h-${i}`} className="h-4 flex-1" />
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonPulse key={`${r}-${c}`} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 'h-64' }: { height?: string }) {
  return (
    <div className={`animate-pulse ${height} flex items-end gap-2 px-4 pb-4`}>
      {[40, 65, 45, 80, 55, 70, 50].map((h, i) => (
        <div
          key={i}
          className="flex-1 bg-surface-200 rounded-t"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3 p-1">
      <SkeletonPulse className="h-5 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonPulse
          key={i}
          className={`h-4 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`}
        />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <SkeletonPulse className="h-8 w-1/3" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KPISkeleton key={i} />
        ))}
      </div>
      <ChartSkeleton height="h-72" />
    </div>
  );
}

export default { TableSkeleton, ChartSkeleton, CardSkeleton, KPISkeleton, PageSkeleton };
