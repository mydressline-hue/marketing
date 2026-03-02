import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, XCircle } from 'lucide-react';

// ---------------------------------------------------------------------------
// ErrorFallback – displayed when the ErrorBoundary catches a render error
// ---------------------------------------------------------------------------

interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

/**
 * A full-section error fallback with a human-readable message and a retry
 * button that resets the boundary.
 */
export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
      role="alert"
    >
      <div className="w-14 h-14 rounded-full bg-danger-50 dark:bg-danger-500/10 flex items-center justify-center mb-4">
        <AlertTriangle className="w-7 h-7 text-danger-600 dark:text-danger-400" />
      </div>
      <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-1">
        Something went wrong
      </h2>
      <p className="text-sm text-surface-500 dark:text-surface-400 max-w-md mb-4">
        {error.message || 'An unexpected error occurred. Please try again.'}
      </p>
      <button
        onClick={resetError}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
      >
        <RefreshCw className="w-4 h-4" />
        Try again
      </button>
      {import.meta.env.DEV && (
        <pre className="mt-6 max-w-xl text-left text-xs text-surface-500 dark:text-surface-400 bg-surface-100 dark:bg-surface-800 rounded-lg p-4 overflow-auto">
          {error.stack}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ErrorBoundary – React class component
// ---------------------------------------------------------------------------

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback renderer. */
  fallback?: (props: ErrorFallbackProps) => ReactNode;
  /** Called whenever an error is caught (useful for logging). */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Standard React error boundary. Wrap any subtree to catch render errors
 * and display a user-friendly fallback instead of a white screen.
 *
 * ```tsx
 * <ErrorBoundary>
 *   <MyPage />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);

    // In development, also log to the console for debugging.
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  private resetError = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) {
        return this.props.fallback({ error, resetError: this.resetError });
      }
      return <ErrorFallback error={error} resetError={this.resetError} />;
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// ApiErrorDisplay – inline error banner for API failures
// ---------------------------------------------------------------------------

export interface ApiErrorDisplayProps {
  error: Error | null;
  /** Called when the user clicks the retry button. */
  onRetry?: () => void;
  /** Called when the user dismisses the error. */
  onDismiss?: () => void;
  /** Additional CSS classes on the outer container. */
  className?: string;
  /** Render in a more compact layout with less padding. */
  compact?: boolean;
  /** Custom title to display instead of the auto-detected one. */
  title?: string;
  /** Custom message to display instead of the error message. */
  message?: string;
}

/**
 * Inline error display meant for API errors within a page section. Unlike
 * `ErrorFallback` (which replaces the entire section), this renders as a
 * compact banner that can sit alongside other content.
 *
 * ```tsx
 * const { data, error, refetch } = useApiQuery<Items[]>('/items');
 * {error && <ApiErrorDisplay error={error} onRetry={refetch} />}
 * ```
 */
export function ApiErrorDisplay({
  error,
  onRetry,
  onDismiss,
  className = '',
  title: titleOverride,
  message: messageOverride,
}: ApiErrorDisplayProps) {
  if (!error) return null;

  // Attempt to extract an HTTP status code from the error message (the
  // existing ApiService throws messages like "API Error: 404 Not Found").
  const statusMatch = error.message.match(/API Error:\s*(\d{3})/);
  const status = statusMatch ? parseInt(statusMatch[1], 10) : null;

  let title = titleOverride ?? 'Request failed';
  if (!titleOverride && status) {
    if (status === 401 || status === 403) title = 'Access denied';
    else if (status === 404) title = 'Not found';
    else if (status === 429) title = 'Too many requests';
    else if (status >= 500) title = 'Server error';
  }

  const displayMessage = messageOverride ?? error.message;

  return (
    <div
      className={`flex items-start gap-3 bg-danger-50 dark:bg-danger-500/10 border border-danger-200 dark:border-danger-500/30 rounded-lg p-4 ${className}`}
      role="alert"
    >
      <XCircle className="w-5 h-5 text-danger-600 dark:text-danger-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-danger-800 dark:text-danger-200">{title}</p>
        <p className="text-sm text-danger-700 dark:text-danger-300 mt-0.5 truncate">
          {displayMessage}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1 text-sm font-medium text-danger-700 dark:text-danger-300 hover:text-danger-900 dark:hover:text-danger-100 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-danger-400 hover:text-danger-600 dark:hover:text-danger-300 transition-colors"
            aria-label="Dismiss error"
          >
            <XCircle className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
