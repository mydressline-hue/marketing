// ---------------------------------------------------------------------------
// Skeleton loading placeholders for Dashboard components
// ---------------------------------------------------------------------------

function SkeletonPulse({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-200 rounded ${className}`} />;
}

/** Matches the dimensions and layout of a KPICard */
export function KPISkeleton() {
  return (
    <div className="bg-white rounded-xl border border-surface-200 p-5">
      <SkeletonPulse className="h-4 w-24 mb-3" />
      <SkeletonPulse className="h-8 w-32 mb-3" />
      <SkeletonPulse className="h-5 w-16 rounded-full" />
    </div>
  );
}

/** Matches the dimensions of a chart Card (h-72 chart area) */
export function ChartSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-surface-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <SkeletonPulse className="h-5 w-36 mb-2" />
          <SkeletonPulse className="h-3 w-24" />
        </div>
        <SkeletonPulse className="h-4 w-4 rounded" />
      </div>
      <div className="h-72 flex items-end gap-2 px-4 pb-4">
        {[65, 45, 80, 55, 70, 90, 50, 75].map((h, i) => (
          <SkeletonPulse
            key={i}
            className="flex-1 rounded-t"
            style={{ height: `${h}%` } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}

/** Generic card skeleton for agent grid, alerts, and similar list cards */
export function CardSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <SkeletonPulse className="h-5 w-36 mb-2" />
          <SkeletonPulse className="h-3 w-24" />
        </div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonPulse key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
