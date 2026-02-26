import { AlertTriangle, RefreshCw } from 'lucide-react';

// Re-export under the expected name used by page imports
// (import { ApiErrorDisplay } from '../components/shared/ErrorBoundary')

interface ApiErrorDisplayProps {
  error: string;
  onRetry?: () => void;
}

export function ApiErrorDisplay({ error, onRetry }: ApiErrorDisplayProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-danger-50 flex items-center justify-center mb-4">
        <AlertTriangle className="w-6 h-6 text-danger-600" />
      </div>
      <h3 className="text-lg font-semibold text-surface-900 mb-1">Failed to load data</h3>
      <p className="text-sm text-surface-500 max-w-md mb-4">{error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      )}
    </div>
  );
}
