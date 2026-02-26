import { AlertTriangle, RefreshCw } from 'lucide-react';

// ---------------------------------------------------------------------------
// ApiErrorDisplay – inline error block with optional retry
// ---------------------------------------------------------------------------

interface ApiErrorDisplayProps {
  error: string;
  onRetry?: () => void;
}

export function ApiErrorDisplay({ error, onRetry }: ApiErrorDisplayProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
        <AlertTriangle className="w-6 h-6 text-red-500" />
      </div>
      <div>
        <p className="text-sm font-semibold text-surface-800 mb-1">Failed to load data</p>
        <p className="text-xs text-surface-500 max-w-sm">{error}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </button>
      )}
    </div>
  );
}
