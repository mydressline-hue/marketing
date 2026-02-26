import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/* ---- Inline Error Display (non-boundary) ---- */

interface ApiErrorDisplayProps {
  error: Error | null;
  onRetry?: () => void;
  message?: string;
}

export function ApiErrorDisplay({ error, onRetry, message }: ApiErrorDisplayProps) {
  if (!error) return null;

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
      <div className="w-12 h-12 rounded-full bg-danger-50 flex items-center justify-center">
        <AlertTriangle className="w-6 h-6 text-danger-600" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-surface-900">
          {message || 'Failed to load data'}
        </h3>
        <p className="text-xs text-surface-500 max-w-xs">
          {error.message}
        </p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
      )}
    </div>
  );
}

/* ---- Class-based Error Boundary ---- */

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

export default ErrorBoundary;
