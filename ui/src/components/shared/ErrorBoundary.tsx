import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// ---------------------------------------------------------------------------
// ApiErrorDisplay - inline error message with optional retry
// ---------------------------------------------------------------------------

interface ApiErrorDisplayProps {
  error: Error | null;
  onRetry?: () => void;
  message?: string;
}

export function ApiErrorDisplay({ error, onRetry, message }: ApiErrorDisplayProps) {
  if (!error) return null;

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50">
        <AlertTriangle className="w-6 h-6 text-red-500" />
      </div>
      <div>
        <p className="text-sm font-medium text-surface-900">
          {message || 'Failed to load data'}
        </p>
        <p className="text-xs text-surface-500 mt-1 max-w-sm">
          {error.message}
        </p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-800 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ErrorBoundary - class-based React error boundary
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

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <ApiErrorDisplay
            error={this.state.error}
            onRetry={() => this.setState({ hasError: false, error: null })}
          />
        )
      );
    }
    return this.props.children;
  }
}
