import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProgressBar from '../../../src/components/shared/ProgressBar';

describe('ProgressBar', () => {
  it('renders the progress bar container', () => {
    const { container } = render(<ProgressBar value={50} />);
    expect(container.querySelector('.w-full')).toBeTruthy();
  });

  it('sets the bar width to 0% for value 0', () => {
    const { container } = render(<ProgressBar value={0} />);
    const bar = container.querySelector('[style]') as HTMLElement;
    expect(bar.style.width).toBe('0%');
  });

  it('sets the bar width to 50% for value 50', () => {
    const { container } = render(<ProgressBar value={50} />);
    const bar = container.querySelector('[style]') as HTMLElement;
    expect(bar.style.width).toBe('50%');
  });

  it('sets the bar width to 100% for value 100', () => {
    const { container } = render(<ProgressBar value={100} />);
    const bar = container.querySelector('[style]') as HTMLElement;
    expect(bar.style.width).toBe('100%');
  });

  it('caps the bar width at 100% when value exceeds max', () => {
    const { container } = render(<ProgressBar value={150} max={100} />);
    const bar = container.querySelector('[style]') as HTMLElement;
    expect(bar.style.width).toBe('100%');
  });

  it('calculates percentage based on custom max', () => {
    const { container } = render(<ProgressBar value={25} max={50} />);
    const bar = container.querySelector('[style]') as HTMLElement;
    expect(bar.style.width).toBe('50%');
  });

  it('renders label when provided', () => {
    render(<ProgressBar value={50} label="Progress" />);
    expect(screen.getByText('Progress')).toBeInTheDocument();
  });

  it('does not render label row when no label or showValue', () => {
    const { container } = render(<ProgressBar value={50} />);
    const labelSpan = container.querySelector('.text-sm.text-surface-600');
    expect(labelSpan).toBeNull();
  });

  it('renders percentage text when showValue is true', () => {
    render(<ProgressBar value={75} showValue />);
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('renders rounded percentage when value is fractional', () => {
    render(<ProgressBar value={33} max={100} showValue />);
    expect(screen.getByText('33%')).toBeInTheDocument();
  });

  it('applies primary color by default', () => {
    const { container } = render(<ProgressBar value={50} />);
    const bar = container.querySelector('.bg-primary-500');
    expect(bar).toBeTruthy();
  });

  it('applies success color variant', () => {
    const { container } = render(<ProgressBar value={50} color="success" />);
    const bar = container.querySelector('.bg-success-500');
    expect(bar).toBeTruthy();
  });

  it('applies warning color variant', () => {
    const { container } = render(<ProgressBar value={50} color="warning" />);
    const bar = container.querySelector('.bg-warning-500');
    expect(bar).toBeTruthy();
  });

  it('applies danger color variant', () => {
    const { container } = render(<ProgressBar value={50} color="danger" />);
    const bar = container.querySelector('.bg-danger-500');
    expect(bar).toBeTruthy();
  });

  it('applies medium size by default', () => {
    const { container } = render(<ProgressBar value={50} />);
    const track = container.querySelector('.h-2\\.5');
    expect(track).toBeTruthy();
  });

  it('applies small size variant', () => {
    const { container } = render(<ProgressBar value={50} size="sm" />);
    const track = container.querySelector('.h-1\\.5');
    expect(track).toBeTruthy();
  });

  it('has dark mode classes on the track', () => {
    const { container } = render(<ProgressBar value={50} />);
    const track = container.querySelector('.dark\\:bg-surface-700');
    expect(track).toBeTruthy();
  });
});
