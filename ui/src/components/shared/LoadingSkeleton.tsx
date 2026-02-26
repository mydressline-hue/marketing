// ---------------------------------------------------------------------------
// Reusable loading skeleton components
// ---------------------------------------------------------------------------

function Pulse({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface-200 ${className}`} />;
}

/** Skeleton for tabular data – renders placeholder rows with columns */
export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="w-full space-y-3">
      {/* Header row */}
      <div className="flex gap-4">
        {Array.from({ length: columns }).map((_, c) => (
          <Pulse key={`h-${c}`} className="h-4 flex-1" />
        ))}
      </div>
      <div className="border-b border-surface-100" />
      {/* Body rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={`r-${r}`} className="flex gap-4">
          {Array.from({ length: columns }).map((_, c) => (
            <Pulse key={`r-${r}-c-${c}`} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Skeleton for chart areas – a single large rounded block */
export function ChartSkeleton({ height = 'h-72' }: { height?: string }) {
  return <Pulse className={`w-full ${height} rounded-lg`} />;
}

/** Skeleton for card-style content blocks */
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3">
      <Pulse className="h-5 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Pulse key={i} className={`h-4 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}
