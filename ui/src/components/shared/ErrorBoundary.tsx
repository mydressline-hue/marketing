import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// ---------------------------------------------------------------------------
// ApiErrorDisplay – inline error banner with optional retry
// ---------------------------------------------------------------------------

interface ApiErrorDisplayProps {
  error: string;
  onRetry?: () => void;
}

export function ApiErrorDisplay({ error, onRetry }: ApiErrorDisplayProps) {
  return (
    <div className="bg-danger-50 border border-danger-200 rounded-xl p-5 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-danger-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-danger-800 mb-1">Failed to load data</h4>
        <p className="text-sm text-danger-700">{error}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-danger-700 bg-white border border-danger-300 rounded-lg hover:bg-danger-50 transition-colors shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ErrorBoundary – class component to catch render errors
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
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-danger-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-surface-900 mb-1">Something went wrong</h3>
          <p className="text-sm text-surface-600 mb-4">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
