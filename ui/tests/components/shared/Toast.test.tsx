import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider, useToast } from '../../../src/components/shared/Toast';

// Helper component to trigger toasts from tests
function ToastTrigger({ type, message, duration }: { type: 'success' | 'error' | 'warning' | 'info'; message: string; duration?: number }) {
  const toast = useToast();
  return (
    <button onClick={() => toast.toast(type, message, duration)}>
      Show Toast
    </button>
  );
}

function SuccessTrigger() {
  const toast = useToast();
  return <button onClick={() => toast.success('Success message')}>Success</button>;
}

function ErrorTrigger() {
  const toast = useToast();
  return <button onClick={() => toast.error('Error message')}>Error</button>;
}

function WarningTrigger() {
  const toast = useToast();
  return <button onClick={() => toast.warning('Warning message')}>Warning</button>;
}

function InfoTrigger() {
  const toast = useToast();
  return <button onClick={() => toast.info('Info message')}>Info</button>;
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders toast with success variant', () => {
    render(
      <ToastProvider>
        <SuccessTrigger />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('Success'));
    act(() => { vi.advanceTimersByTime(50); });
    expect(screen.getByText('Success message')).toBeInTheDocument();
  });

  it('renders toast with error variant', () => {
    render(
      <ToastProvider>
        <ErrorTrigger />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('Error'));
    act(() => { vi.advanceTimersByTime(50); });
    expect(screen.getByText('Error message')).toBeInTheDocument();
  });

  it('renders toast with warning variant', () => {
    render(
      <ToastProvider>
        <WarningTrigger />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('Warning'));
    act(() => { vi.advanceTimersByTime(50); });
    expect(screen.getByText('Warning message')).toBeInTheDocument();
  });

  it('renders toast with info variant', () => {
    render(
      <ToastProvider>
        <InfoTrigger />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('Info'));
    act(() => { vi.advanceTimersByTime(50); });
    expect(screen.getByText('Info message')).toBeInTheDocument();
  });

  it('applies correct styles for success variant', () => {
    render(
      <ToastProvider>
        <SuccessTrigger />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('Success'));
    act(() => { vi.advanceTimersByTime(50); });
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('bg-success-50');
    expect(alert.className).toContain('border-success-200');
  });

  it('applies correct styles for error variant', () => {
    render(
      <ToastProvider>
        <ErrorTrigger />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('Error'));
    act(() => { vi.advanceTimersByTime(50); });
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('bg-danger-50');
    expect(alert.className).toContain('border-danger-200');
  });

  it('auto-dismisses after default timeout (5000ms)', () => {
    render(
      <ToastProvider>
        <SuccessTrigger />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('Success'));
    act(() => { vi.advanceTimersByTime(50); });
    expect(screen.getByText('Success message')).toBeInTheDocument();

    // Advance past the 5000ms duration + 200ms animation
    act(() => { vi.advanceTimersByTime(5200); });
    expect(screen.queryByText('Success message')).not.toBeInTheDocument();
  });

  it('can be manually closed via close button', () => {
    render(
      <ToastProvider>
        <SuccessTrigger />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('Success'));
    act(() => { vi.advanceTimersByTime(50); });
    expect(screen.getByText('Success message')).toBeInTheDocument();

    const closeButton = screen.getByLabelText('Close notification');
    fireEvent.click(closeButton);

    // Wait for dismiss animation
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.queryByText('Success message')).not.toBeInTheDocument();
  });

  it('renders multiple toasts simultaneously', () => {
    function MultiTrigger() {
      const toast = useToast();
      return (
        <button onClick={() => {
          toast.success('First toast');
          toast.error('Second toast');
        }}>
          Show Both
        </button>
      );
    }

    render(
      <ToastProvider>
        <MultiTrigger />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('Show Both'));
    act(() => { vi.advanceTimersByTime(50); });
    expect(screen.getByText('First toast')).toBeInTheDocument();
    expect(screen.getByText('Second toast')).toBeInTheDocument();
  });

  it('has notifications container with aria-label', () => {
    const { container } = render(
      <ToastProvider>
        <div>child</div>
      </ToastProvider>
    );
    const notifContainer = container.querySelector('[aria-label="Notifications"]');
    expect(notifContainer).toBeTruthy();
  });

  it('throws error when useToast is used outside of ToastProvider', () => {
    function BadComponent() {
      useToast();
      return <div>bad</div>;
    }

    // Suppress console.error from React error boundary
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<BadComponent />)).toThrow('useToast must be used within ToastProvider');
  });

  it('toast has role="alert" and aria-live="polite"', () => {
    render(
      <ToastProvider>
        <SuccessTrigger />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('Success'));
    act(() => { vi.advanceTimersByTime(50); });
    const alert = screen.getByRole('alert');
    expect(alert.getAttribute('aria-live')).toBe('polite');
  });
});
