import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({
  icon,
  title = 'No data available',
  description = 'There is nothing to display right now.',
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-surface-200 bg-surface-50/50 px-6 py-14 text-center ${className}`}
    >
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-surface-100 mb-4">
        {icon ?? <Inbox className="w-6 h-6 text-surface-400" />}
      </div>
      <h3 className="text-base font-semibold text-surface-900 mb-1">{title}</h3>
      <p className="text-sm text-surface-500 mb-4 max-w-md">{description}</p>
      {action}
    </div>
  );
}
