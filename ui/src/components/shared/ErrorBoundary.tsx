import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ApiErrorDisplayProps {
  error: string;
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
      <div className="flex items-center gap-2 px-4 py-3 bg-danger-50 border border-danger-200 rounded-lg text-sm">
        <AlertTriangle className="w-4 h-4 text-danger-500 flex-shrink-0" />
        <span className="text-danger-700">{error}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="ml-auto flex items-center gap-1 text-danger-600 hover:text-danger-800 font-medium"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 px-6">
      <div className="w-12 h-12 bg-danger-100 rounded-full flex items-center justify-center mb-4">
        <AlertTriangle className="w-6 h-6 text-danger-500" />
      </div>
      <h3 className="text-lg font-semibold text-surface-900 mb-1">{title}</h3>
      <p className="text-sm text-surface-500 text-center max-w-md mb-4">{error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      )}
    </div>
  );
}
