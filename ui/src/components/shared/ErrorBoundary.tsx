import { AlertTriangle, RefreshCw } from 'lucide-react';

// ---------------------------------------------------------------------------
// ApiErrorDisplay – inline error state for failed API calls
// ---------------------------------------------------------------------------

interface ApiErrorDisplayProps {
  error: string;
  onRetry?: () => void;
  className?: string;
}

export function ApiErrorDisplay({ error, onRetry, className = '' }: ApiErrorDisplayProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-xl border border-danger-200 bg-danger-50 p-8 text-center ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-danger-100 flex items-center justify-center">
        <AlertTriangle className="w-6 h-6 text-danger-600" />
      </div>
      <p className="text-sm font-medium text-danger-700">{error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-danger-600 hover:text-danger-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      )}
    </div>
  );
}
