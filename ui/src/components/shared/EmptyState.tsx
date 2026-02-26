import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title?: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({
  icon,
  title = 'No data available',
  message = 'There is nothing to display at the moment.',
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-16 text-center ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-surface-100 flex items-center justify-center">
        {icon || <Inbox className="w-6 h-6 text-surface-400" />}
      </div>
      <div>
        <p className="text-sm font-semibold text-surface-700">{title}</p>
        <p className="text-xs text-surface-500 mt-1 max-w-xs">{message}</p>
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
