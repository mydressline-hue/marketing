interface SkeletonProps {
  className?: string;
}

function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-surface-200 rounded ${className}`}
    />
  );
}

export function CardSkeleton({ count = 1 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-surface-200 p-5 space-y-3"
        >
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      ))}
    </>
  );
}

export function ChartSkeleton({ height = 'h-64' }: { height?: string }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-1/4" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className={`w-full ${height} rounded-lg`} />
    </div>
  );
}

export function GallerySkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-surface-200 overflow-hidden"
        >
          <Skeleton className="h-36 w-full rounded-none" />
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-5 w-10 rounded-full" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-8" />
            </div>
            <div className="flex items-center gap-1 pt-1 border-t border-surface-100">
              <Skeleton className="h-7 w-14 rounded-md" />
              <Skeleton className="h-7 w-20 rounded-md" />
              <Skeleton className="h-7 w-12 rounded-md" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-7 w-7 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
