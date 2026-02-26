import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({
  icon,
  title = 'No data available',
  description = 'There are no items to display at this time.',
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-surface-100">
        {icon || <Inbox className="w-6 h-6 text-surface-400" />}
      </div>
      <div>
        <p className="text-sm font-medium text-surface-900">{title}</p>
        <p className="text-xs text-surface-500 mt-1 max-w-sm">{description}</p>
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
