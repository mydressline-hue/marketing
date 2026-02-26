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
  description = 'There is nothing to display at the moment.',
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
      <div className="w-12 h-12 rounded-full bg-surface-100 flex items-center justify-center">
        {icon || <Inbox className="w-6 h-6 text-surface-400" />}
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-surface-700">{title}</h3>
        <p className="text-xs text-surface-500 max-w-xs">{description}</p>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
