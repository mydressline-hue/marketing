import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// EmptyState - shown when a query returns zero results
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export default function EmptyState({
  title = 'No data found',
  description = 'There are no items to display at this time.',
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 bg-surface-100 rounded-full flex items-center justify-center mb-4">
        {icon || <Inbox className="w-6 h-6 text-surface-400" />}
      </div>
      <h3 className="text-base font-semibold text-surface-800 mb-1">{title}</h3>
      <p className="text-sm text-surface-500 max-w-sm">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
