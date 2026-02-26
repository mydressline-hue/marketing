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
  description = 'There is nothing to display right now.',
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-surface-100 flex items-center justify-center mb-4">
        {icon || <Inbox className="w-6 h-6 text-surface-400" />}
      </div>
      <h3 className="text-lg font-semibold text-surface-900 mb-1">{title}</h3>
      <p className="text-sm text-surface-500 max-w-md">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
