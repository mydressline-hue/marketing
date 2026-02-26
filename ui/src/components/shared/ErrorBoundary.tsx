import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// ---------------------------------------------------------------------------
// ApiErrorDisplay - inline error message with optional retry
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
      className={`flex flex-col items-center justify-center gap-3 py-12 text-center ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-danger-50 flex items-center justify-center">
        <AlertTriangle className="w-6 h-6 text-danger-500" />
      </div>
      <div>
        <p className="text-sm font-semibold text-surface-900">{title}</p>
        <p className="text-xs text-surface-500 mt-1 max-w-sm">{error}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
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

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <ApiErrorDisplay
          error={this.state.error?.message || 'An unexpected error occurred'}
          title="Something went wrong"
          onRetry={this.handleReset}
        />
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
