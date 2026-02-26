/**
 * API Error Display component.
 *
 * Shows a user-friendly error message with an optional retry button.
 * Used alongside useApiQuery when an endpoint returns an error.
 */

import { AlertCircle, RefreshCw } from 'lucide-react';

interface ApiErrorDisplayProps {
  error: string;
  onRetry?: () => void;
}

export function ApiErrorDisplay({ error, onRetry }: ApiErrorDisplayProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-danger-50 flex items-center justify-center mb-4">
        <AlertCircle className="w-6 h-6 text-danger-600" />
      </div>
      <h3 className="text-sm font-semibold text-surface-900 mb-1">Something went wrong</h3>
      <p className="text-sm text-surface-500 max-w-md mb-4">{error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </button>
      )}
    </div>
  );
}
