import { Inbox, type LucideIcon } from 'lucide-react';
import type { ReactNode, ReactElement } from 'react';

export interface EmptyStateProps {
  /** Lucide icon component or a rendered icon element. Defaults to `Inbox`. */
  icon?: LucideIcon | ReactElement;
  /** Primary heading. */
  title: string;
  /** Explanatory text beneath the title. */
  description?: string;
  /** Alias for `description`. */
  message?: string;
  /**
   * Optional action element -- typically a button. Rendered below the
   * description.
   *
   * ```tsx
   * <EmptyState
   *   title="No campaigns"
   *   description="Create your first campaign to get started."
   *   action={<button className="...">Create campaign</button>}
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
  icon: iconProp,
  title,
  description,
  message,
  action,
  className = '',
  compact = false,
}: EmptyStateProps) {
  const resolvedDescription = description ?? message;

  // Determine if the icon is a rendered element or a component reference.
  const isElement = iconProp !== undefined && typeof iconProp === 'object' && iconProp !== null && '$$typeof' in (iconProp as any);
  const IconComponent = (!isElement ? (iconProp as LucideIcon | undefined) : undefined) ?? Inbox;

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8 px-4' : 'py-16 px-6'} ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-surface-100 dark:bg-surface-700 flex items-center justify-center mb-4">
        {isElement ? (iconProp as ReactElement) : <IconComponent className="w-6 h-6 text-surface-400 dark:text-surface-500" />}
      </div>
      <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100 mb-1">{title}</h3>
      {resolvedDescription && (
        <p className="text-sm text-surface-500 dark:text-surface-400 max-w-sm mb-4">{resolvedDescription}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
