import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

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
            error={this.state.error?.message || 'An unexpected error occurred'}
            onRetry={() => this.setState({ hasError: false, error: null })}
          />
        )
      );
    }
    return this.props.children;
  }
}

interface ApiErrorDisplayProps {
  error: string | null;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

export function ApiErrorDisplay({ error, onRetry, className = '', compact = false }: ApiErrorDisplayProps) {
  if (!error) return null;

  if (compact) {
    return (
      <div className={`flex items-center gap-2 p-3 rounded-lg bg-danger-50 border border-danger-200 ${className}`}>
        <AlertTriangle className="w-4 h-4 text-danger-500 shrink-0" />
        <p className="text-sm text-danger-700 flex-1">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1 text-xs font-medium text-danger-600 hover:text-danger-700"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 ${className}`}>
      <div className="w-12 h-12 rounded-full bg-danger-100 flex items-center justify-center mb-4">
        <AlertTriangle className="w-6 h-6 text-danger-500" />
      </div>
      <h3 className="text-lg font-semibold text-surface-900 mb-1">Something went wrong</h3>
      <p className="text-sm text-surface-500 text-center max-w-md mb-4">{error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      )}
    </div>
  );
}
