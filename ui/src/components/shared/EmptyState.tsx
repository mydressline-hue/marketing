import { Inbox, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** Lucide icon component to display. Defaults to `Inbox`. */
  icon?: LucideIcon;
  /** Primary heading. */
  title: string;
  /** Explanatory text beneath the title. */
  description?: string;
  /**
   * Optional action element – typically a button. Rendered below the
   * description.
   *
   * ```tsx
   * <EmptyState
   *   title="No campaigns"
   *   description="Create your first campaign to get started."
   *   action={<button className="…">Create campaign</button>}
   * />
   * ```
   */
  action?: ReactNode;
  /** Extra CSS classes applied to the outer wrapper. */
  className?: string;
  /** Compact mode reduces vertical padding. */
  compact?: boolean;
}

/**
 * Empty-state placeholder displayed when an API query returns an empty array
 * or when a section has no content to show. Provides a consistent, branded
 * look across all 23 pages.
 */
export default function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className = '',
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8 px-4' : 'py-16 px-6'} ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-surface-100 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-surface-400" />
      </div>
      <h3 className="text-base font-semibold text-surface-900 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-surface-500 max-w-sm mb-4">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
