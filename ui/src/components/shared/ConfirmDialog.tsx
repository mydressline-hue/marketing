import { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

const variantStyles = {
  danger: {
    icon: 'bg-danger-100 dark:bg-danger-500/20 text-danger-600 dark:text-danger-400',
    button: 'bg-danger-600 hover:bg-danger-700 text-white focus:ring-danger-500',
  },
  warning: {
    icon: 'bg-warning-100 dark:bg-warning-500/20 text-warning-600 dark:text-warning-400',
    button: 'bg-warning-600 hover:bg-warning-700 text-white focus:ring-warning-500',
  },
  info: {
    icon: 'bg-primary-100 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400',
    button: 'bg-primary-600 hover:bg-primary-700 text-white focus:ring-primary-500',
  },
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      confirmRef.current?.focus();
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onCancel();
      };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [open, onCancel]);

  if (!open) return null;

  const style = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="fixed inset-0 bg-black/50 dark:bg-black/70" onClick={onCancel} />
      <div
        ref={dialogRef}
        className="relative bg-white dark:bg-surface-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6 animate-in fade-in zoom-in-95"
      >
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4 text-surface-500 dark:text-surface-400" />
        </button>
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${style.icon}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 id="confirm-title" className="text-lg font-semibold text-surface-900 dark:text-surface-100">
              {title}
            </h3>
            <p className="text-sm text-surface-600 dark:text-surface-400 mt-1">
              {message}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-surface-700 dark:text-surface-300 bg-surface-100 dark:bg-surface-700 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-600 transition-colors focus:outline-none focus:ring-2 focus:ring-surface-500 focus:ring-offset-2 dark:focus:ring-offset-surface-800"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-surface-800 ${style.button}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
