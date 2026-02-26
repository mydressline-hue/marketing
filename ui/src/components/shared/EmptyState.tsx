import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// EmptyState – shown when an API returns no data
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({
  title = 'No data available',
  message = 'There is nothing to display at the moment.',
  icon,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-xl border border-surface-200 bg-surface-50 p-10 text-center ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-surface-100 flex items-center justify-center text-surface-400">
        {icon || <Inbox className="w-6 h-6" />}
      </div>
      <h4 className="text-sm font-semibold text-surface-700">{title}</h4>
      <p className="text-xs text-surface-500 max-w-xs">{message}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
