import React from 'react';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

const statusStyles: Record<string, string> = {
  active: 'bg-success-50 dark:bg-success-500/10 text-success-700 dark:text-success-300 border-success-500/20',
  running: 'bg-success-50 dark:bg-success-500/10 text-success-700 dark:text-success-300 border-success-500/20',
  healthy: 'bg-success-50 dark:bg-success-500/10 text-success-700 dark:text-success-300 border-success-500/20',
  compliant: 'bg-success-50 dark:bg-success-500/10 text-success-700 dark:text-success-300 border-success-500/20',
  complete: 'bg-success-50 dark:bg-success-500/10 text-success-700 dark:text-success-300 border-success-500/20',
  published: 'bg-success-50 dark:bg-success-500/10 text-success-700 dark:text-success-300 border-success-500/20',
  idle: 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 border-surface-300/30',
  stable: 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 border-surface-300/30',
  paused: 'bg-warning-50 dark:bg-warning-500/10 text-warning-600 dark:text-warning-300 border-warning-500/20',
  warning: 'bg-warning-50 dark:bg-warning-500/10 text-warning-600 dark:text-warning-300 border-warning-500/20',
  degraded: 'bg-warning-50 dark:bg-warning-500/10 text-warning-600 dark:text-warning-300 border-warning-500/20',
  in_progress: 'bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300 border-primary-500/20',
  review: 'bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300 border-primary-500/20',
  scheduled: 'bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300 border-primary-500/20',
  planned: 'bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300 border-primary-500/20',
  draft: 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 border-surface-300/30',
  pending: 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 border-surface-300/30',
  error: 'bg-danger-50 dark:bg-danger-500/10 text-danger-700 dark:text-danger-300 border-danger-500/20',
  critical: 'bg-danger-50 dark:bg-danger-500/10 text-danger-700 dark:text-danger-300 border-danger-500/20',
  violation: 'bg-danger-50 dark:bg-danger-500/10 text-danger-700 dark:text-danger-300 border-danger-500/20',
  down: 'bg-danger-50 dark:bg-danger-500/10 text-danger-700 dark:text-danger-300 border-danger-500/20',
  completed: 'bg-success-50 dark:bg-success-500/10 text-success-700 dark:text-success-300 border-success-500/20',
  research: 'bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300 border-primary-500/20',
};

const StatusBadge = React.memo(function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const style = statusStyles[status] || 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 border-surface-300/30';
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';

  return (
    <span className={`inline-flex items-center rounded-full border font-medium capitalize ${style} ${sizeClasses}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
});

export default StatusBadge;
