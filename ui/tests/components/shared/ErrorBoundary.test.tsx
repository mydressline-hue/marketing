import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary, ErrorFallback } from '../../../src/components/shared/ErrorBoundary';

// Suppress console.error output from ErrorBoundary in tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// A component that throws an error on render
function ThrowingComponent({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error('Test render error');
  }
  return <div>Rendered successfully</div>;
}

describe('ErrorFallback', () => {
  it('renders "Something went wrong" heading', () => {
    const error = new Error('Test error');
    render(<ErrorFallback error={error} resetError={vi.fn()} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('displays the error message', () => {
    const error = new Error('Detailed error message');
    render(<ErrorFallback error={error} resetError={vi.fn()} />);
    expect(screen.getByText('Detailed error message')).toBeInTheDocument();
  });

  it('displays fallback message when error has no message', () => {
    const error = new Error('');
    render(<ErrorFallback error={error} resetError={vi.fn()} />);
    expect(screen.getByText('An unexpected error occurred. Please try again.')).toBeInTheDocument();
  });

  it('renders a "Try again" button', () => {
    const error = new Error('Test');
    render(<ErrorFallback error={error} resetError={vi.fn()} />);
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });

  it('calls resetError when "Try again" is clicked', () => {
    const resetError = vi.fn();
    const error = new Error('Test');
    render(<ErrorFallback error={error} resetError={resetError} />);
    fireEvent.click(screen.getByText('Try again'));
    expect(resetError).toHaveBeenCalledTimes(1);
  });

  it('has role="alert" for accessibility', () => {
    const error = new Error('Test');
    render(<ErrorFallback error={error} resetError={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('has dark mode classes', () => {
    const error = new Error('Test');
    render(<ErrorFallback error={error} resetError={vi.fn()} />);
    const heading = screen.getByText('Something went wrong');
    expect(heading.className).toContain('dark:text-surface-100');
  });
});

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Safe content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  it('catches rendering errors and shows fallback UI', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test render error')).toBeInTheDocument();
  });

  it('"Try again" resets the error state and re-renders children', () => {
    let shouldThrow = true;

    function ConditionalThrower() {
      if (shouldThrow) throw new Error('Boom');
      return <div>Recovered</div>;
    }

    render(
      <ErrorBoundary>
        <ConditionalThrower />
      </ErrorBoundary>
    );

    // Should show error fallback
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Fix the error condition
    shouldThrow = false;

    // Click "Try again"
    fireEvent.click(screen.getByText('Try again'));

    // Should re-render the child
    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });

  it('uses custom fallback renderer when provided', () => {
    render(
      <ErrorBoundary
        fallback={({ error, resetError }) => (
          <div>
            <p>Custom: {error.message}</p>
            <button onClick={resetError}>Reset</button>
          </div>
        )}
      >
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText('Custom: Test render error')).toBeInTheDocument();
    expect(screen.getByText('Reset')).toBeInTheDocument();
  });

  it('calls onError callback when error is caught', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Test render error' }),
      expect.objectContaining({ componentStack: expect.any(String) })
    );
  });

  it('does not call onError when no error occurs', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it('custom fallback reset button resets error state', () => {
    let shouldThrow = true;

    function ConditionalThrower() {
      if (shouldThrow) throw new Error('Custom error');
      return <div>Custom recovered</div>;
    }

    render(
      <ErrorBoundary
        fallback={({ resetError }) => (
          <button onClick={resetError}>Custom Reset</button>
        )}
      >
        <ConditionalThrower />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom Reset')).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByText('Custom Reset'));

    expect(screen.getByText('Custom recovered')).toBeInTheDocument();
  });
});
