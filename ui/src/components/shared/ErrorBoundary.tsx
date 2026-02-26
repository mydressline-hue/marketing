import { AlertTriangle, RefreshCw } from 'lucide-react';

// ---------------------------------------------------------------------------
// ApiErrorDisplay – inline error state for failed API calls
// ---------------------------------------------------------------------------

interface ApiErrorDisplayProps {
  error: string;
  onRetry?: () => void;
  title?: string;
  className?: string;
}

export function ApiErrorDisplay({
  error,
  onRetry,
  title = 'Failed to load data',
  className = '',
}: ApiErrorDisplayProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50/50 px-6 py-10 text-center ${className}`}
    >
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4">
        <AlertTriangle className="w-6 h-6 text-red-500" />
      </div>
      <h3 className="text-base font-semibold text-surface-900 mb-1">{title}</h3>
      <p className="text-sm text-surface-500 mb-4 max-w-md">{error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try Again
        </button>
      )}
    </div>
  );
}
