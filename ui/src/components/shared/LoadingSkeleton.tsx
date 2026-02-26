import type { CSSProperties } from 'react';

interface SkeletonBlockProps {
  className?: string;
  style?: CSSProperties;
}

function SkeletonBlock({ className = '', style }: SkeletonBlockProps) {
  return (
    <div className={`animate-pulse bg-surface-200 rounded ${className}`} style={style} />
  );
}

export { SkeletonBlock };

export function TableSkeleton({ rows = 5, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="w-full">
      {/* Header row */}
      <div className="flex gap-4 px-4 py-3 border-b border-surface-200">
        {Array.from({ length: columns }).map((_, i) => (
          <SkeletonBlock key={`header-${i}`} className="h-4 flex-1" />
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={`row-${rowIdx}`}
          className="flex gap-4 px-4 py-3 border-b border-surface-100"
        >
          {Array.from({ length: columns }).map((_, colIdx) => (
            <SkeletonBlock
              key={`cell-${rowIdx}-${colIdx}`}
              className="h-4 flex-1"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 'h-80' }: { height?: string }) {
  return (
    <div className={`${height} w-full flex items-end gap-2 px-4 pb-4`}>
      {Array.from({ length: 8 }).map((_, i) => (
        <SkeletonBlock
          key={`bar-${i}`}
          className="flex-1 animate-pulse bg-surface-200 rounded"
          style={{
            height: `${30 + ((i * 17 + 13) % 60)}%`,
          }}
        />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="w-10 h-10 rounded-lg" />
          <div className="space-y-2">
            <SkeletonBlock className="h-6 w-48" />
            <SkeletonBlock className="h-4 w-64" />
          </div>
        </div>
        <SkeletonBlock className="h-9 w-32 rounded-lg" />
      </div>

      {/* Filter bar skeleton */}
      <div className="bg-white rounded-xl border border-surface-200 p-5">
        <div className="flex gap-4">
          <SkeletonBlock className="h-9 flex-1 rounded-lg" />
          <SkeletonBlock className="h-9 w-36 rounded-lg" />
          <SkeletonBlock className="h-9 w-36 rounded-lg" />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="bg-white rounded-xl border border-surface-200">
        <div className="px-5 py-4 border-b border-surface-100">
          <SkeletonBlock className="h-5 w-48" />
          <SkeletonBlock className="h-4 w-32 mt-1" />
        </div>
        <TableSkeleton rows={8} columns={7} />
      </div>

      {/* Charts skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-surface-200 p-5">
          <SkeletonBlock className="h-5 w-48 mb-2" />
          <SkeletonBlock className="h-4 w-64 mb-4" />
          <ChartSkeleton />
        </div>
        <div className="bg-white rounded-xl border border-surface-200 p-5">
          <SkeletonBlock className="h-5 w-48 mb-2" />
          <SkeletonBlock className="h-4 w-64 mb-4" />
          <ChartSkeleton />
        </div>
      </div>
    </div>
  );
}
