import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({
  icon,
  title = 'No data found',
  description = 'There is nothing to display right now.',
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 text-surface-300">
        {icon || <Inbox className="w-12 h-12" />}
      </div>
      <h3 className="text-lg font-semibold text-surface-700 mb-1">{title}</h3>
      <p className="text-sm text-surface-500 max-w-md mb-6">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}
