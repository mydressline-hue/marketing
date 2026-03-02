import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBadge from '../../../src/components/shared/StatusBadge';

describe('StatusBadge', () => {
  it('renders the status text', () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('replaces underscores with spaces in status text', () => {
    render(<StatusBadge status="in_progress" />);
    expect(screen.getByText('in progress')).toBeInTheDocument();
  });

  it('applies success styles for active status', () => {
    const { container } = render(<StatusBadge status="active" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('text-success-700');
    expect(badge.className).toContain('bg-success-50');
  });

  it('applies success styles for running status', () => {
    const { container } = render(<StatusBadge status="running" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('text-success-700');
  });

  it('applies warning styles for paused status', () => {
    const { container } = render(<StatusBadge status="paused" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('text-warning-600');
    expect(badge.className).toContain('bg-warning-50');
  });

  it('applies danger styles for error status', () => {
    const { container } = render(<StatusBadge status="error" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('text-danger-700');
    expect(badge.className).toContain('bg-danger-50');
  });

  it('applies danger styles for critical status', () => {
    const { container } = render(<StatusBadge status="critical" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('text-danger-700');
  });

  it('applies primary styles for in_progress status', () => {
    const { container } = render(<StatusBadge status="in_progress" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('text-primary-700');
    expect(badge.className).toContain('bg-primary-50');
  });

  it('applies neutral styles for idle status', () => {
    const { container } = render(<StatusBadge status="idle" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('text-surface-600');
    expect(badge.className).toContain('bg-surface-100');
  });

  it('applies fallback styles for unknown status', () => {
    const { container } = render(<StatusBadge status="unknown_status" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-surface-100');
    expect(badge.className).toContain('text-surface-600');
  });

  it('renders small size by default', () => {
    const { container } = render(<StatusBadge status="active" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('text-xs');
    expect(badge.className).toContain('px-2');
  });

  it('renders medium size when specified', () => {
    const { container } = render(<StatusBadge status="active" size="md" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('text-sm');
    expect(badge.className).toContain('px-3');
  });

  it('has capitalize class for consistent text display', () => {
    const { container } = render(<StatusBadge status="active" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('capitalize');
  });

  it('has dark mode classes', () => {
    const { container } = render(<StatusBadge status="active" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('dark:text-success-300');
  });
});
