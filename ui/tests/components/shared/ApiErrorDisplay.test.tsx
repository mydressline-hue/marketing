import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApiErrorDisplay } from '../../../src/components/shared/ErrorBoundary';

describe('ApiErrorDisplay', () => {
  it('returns null when error is null', () => {
    const { container } = render(<ApiErrorDisplay error={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders error message when error is provided', () => {
    const error = new Error('Something went wrong');
    render(<ApiErrorDisplay error={error} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('displays "Request failed" as default title', () => {
    const error = new Error('Connection lost');
    render(<ApiErrorDisplay error={error} />);
    expect(screen.getByText('Request failed')).toBeInTheDocument();
  });

  it('renders retry button when onRetry is provided', () => {
    const error = new Error('Failed');
    const onRetry = vi.fn();
    render(<ApiErrorDisplay error={error} onRetry={onRetry} />);
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('calls onRetry when retry button is clicked', () => {
    const error = new Error('Failed');
    const onRetry = vi.fn();
    render(<ApiErrorDisplay error={error} onRetry={onRetry} />);
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not render retry button when onRetry is not provided', () => {
    const error = new Error('Failed');
    render(<ApiErrorDisplay error={error} />);
    expect(screen.queryByText('Retry')).not.toBeInTheDocument();
  });

  it('renders dismiss button when onDismiss is provided', () => {
    const error = new Error('Failed');
    const onDismiss = vi.fn();
    render(<ApiErrorDisplay error={error} onDismiss={onDismiss} />);
    const dismissButton = screen.getByLabelText('Dismiss error');
    expect(dismissButton).toBeInTheDocument();
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    const error = new Error('Failed');
    const onDismiss = vi.fn();
    render(<ApiErrorDisplay error={error} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText('Dismiss error'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('displays "Access denied" title for 401 error', () => {
    const error = new Error('API Error: 401 Unauthorized');
    render(<ApiErrorDisplay error={error} />);
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });

  it('displays "Access denied" title for 403 error', () => {
    const error = new Error('API Error: 403 Forbidden');
    render(<ApiErrorDisplay error={error} />);
    expect(screen.getByText('Access denied')).toBeInTheDocument();
  });

  it('displays "Not found" title for 404 error', () => {
    const error = new Error('API Error: 404 Not Found');
    render(<ApiErrorDisplay error={error} />);
    expect(screen.getByText('Not found')).toBeInTheDocument();
  });

  it('displays "Too many requests" title for 429 error', () => {
    const error = new Error('API Error: 429 Rate Limited');
    render(<ApiErrorDisplay error={error} />);
    expect(screen.getByText('Too many requests')).toBeInTheDocument();
  });

  it('displays "Server error" title for 500+ error', () => {
    const error = new Error('API Error: 503 Service Unavailable');
    render(<ApiErrorDisplay error={error} />);
    expect(screen.getByText('Server error')).toBeInTheDocument();
  });

  it('uses custom title override when provided', () => {
    const error = new Error('API Error: 404 Not Found');
    render(<ApiErrorDisplay error={error} title="Custom Title" />);
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
    expect(screen.queryByText('Not found')).not.toBeInTheDocument();
  });

  it('uses custom message override when provided', () => {
    const error = new Error('Original message');
    render(<ApiErrorDisplay error={error} message="Custom message" />);
    expect(screen.getByText('Custom message')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const error = new Error('Failed');
    const { container } = render(<ApiErrorDisplay error={error} className="my-class" />);
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.className).toContain('my-class');
  });

  it('has role="alert" for accessibility', () => {
    const error = new Error('Failed');
    render(<ApiErrorDisplay error={error} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('has dark mode classes', () => {
    const error = new Error('Failed');
    const { container } = render(<ApiErrorDisplay error={error} />);
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.className).toContain('dark:bg-danger-500/10');
  });
});
