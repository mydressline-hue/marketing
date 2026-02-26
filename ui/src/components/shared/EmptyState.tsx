/**
 * Empty State component.
 *
 * Displayed when an API query returns successfully but with no data.
 * Accepts a title, description, optional icon, and an optional action button.
 */

import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export default function EmptyState({
  title = 'No data yet',
  description = 'There is nothing to display at the moment.',
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-surface-100 flex items-center justify-center mb-4">
        {icon || <Inbox className="w-6 h-6 text-surface-400" />}
      </div>
      <h3 className="text-sm font-semibold text-surface-900 mb-1">{title}</h3>
      <p className="text-sm text-surface-500 max-w-md mb-4">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}
