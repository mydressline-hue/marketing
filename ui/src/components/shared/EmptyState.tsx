import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export default function EmptyState({
  title = 'No data available',
  message = 'There is no data to display at this time.',
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6">
      <div className="w-12 h-12 bg-surface-100 rounded-full flex items-center justify-center mb-4">
        {icon || <Inbox className="w-6 h-6 text-surface-400" />}
      </div>
      <h3 className="text-lg font-semibold text-surface-900 mb-1">{title}</h3>
      <p className="text-sm text-surface-500 text-center max-w-md">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
