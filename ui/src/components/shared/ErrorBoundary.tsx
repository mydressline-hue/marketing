import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// ---------------------------------------------------------------------------
// ApiErrorDisplay – inline error state for failed API fetches
// ---------------------------------------------------------------------------

interface ApiErrorDisplayProps {
  error: string;
  onRetry?: () => void;
  compact?: boolean;
}

export function ApiErrorDisplay({ error, onRetry, compact = false }: ApiErrorDisplayProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm text-danger-600 p-3">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="truncate">{error}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="ml-auto shrink-0 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-danger-50 flex items-center justify-center mb-4">
        <AlertTriangle className="w-6 h-6 text-danger-600" />
      </div>
      <h3 className="text-sm font-semibold text-surface-900 mb-1">Failed to load data</h3>
      <p className="text-sm text-surface-500 max-w-md mb-4">{error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ErrorBoundary – class-based React error boundary
// ---------------------------------------------------------------------------

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <ApiErrorDisplay
            error={this.state.error?.message ?? 'An unexpected error occurred'}
            onRetry={() => this.setState({ hasError: false, error: null })}
          />
        )
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
