import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// EmptyState – shown when API returns an empty list
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export default function EmptyState({
  title = 'No data available',
  message = 'There is nothing to display at this time.',
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="w-12 h-12 rounded-full bg-surface-100 flex items-center justify-center">
        {icon || <Inbox className="w-6 h-6 text-surface-400" />}
      </div>
      <div>
        <p className="text-sm font-semibold text-surface-700">{title}</p>
        <p className="text-xs text-surface-500 mt-0.5 max-w-xs">{message}</p>
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
