import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 ${className}`}>
      <div className="w-12 h-12 rounded-full bg-surface-100 flex items-center justify-center mb-4 text-surface-400">
        {icon || <Inbox className="w-6 h-6" />}
      </div>
      <h3 className="text-lg font-semibold text-surface-900 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-surface-500 text-center max-w-md mb-4">
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
