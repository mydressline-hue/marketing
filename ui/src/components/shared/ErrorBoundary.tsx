import { AlertTriangle, RefreshCw } from 'lucide-react';

// ---------------------------------------------------------------------------
// ApiErrorDisplay - inline error display for failed API calls
// ---------------------------------------------------------------------------

interface ApiErrorDisplayProps {
  error: Error;
  onRetry?: () => void;
  title?: string;
  compact?: boolean;
}

export function ApiErrorDisplay({
  error,
  onRetry,
  title = 'Failed to load data',
  compact = false,
}: ApiErrorDisplayProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm text-danger-600 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="truncate">{error.message}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="ml-auto shrink-0 text-danger-700 hover:text-danger-800 underline text-xs font-medium"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-12 h-12 bg-danger-50 rounded-full flex items-center justify-center mb-4">
        <AlertTriangle className="w-6 h-6 text-danger-500" />
      </div>
      <h3 className="text-lg font-semibold text-surface-900 mb-1">{title}</h3>
      <p className="text-sm text-surface-500 max-w-md mb-4">{error.message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      )}
    </div>
  );
}
