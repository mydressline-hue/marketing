import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import KPICard from '../../../src/components/shared/KPICard';

describe('KPICard', () => {
  const defaultProps = {
    label: 'Revenue',
    value: 125000,
    change: 12.5,
    trend: 'up' as const,
  };

  it('renders the label', () => {
    render(<KPICard {...defaultProps} />);
    expect(screen.getByText('Revenue')).toBeInTheDocument();
  });

  it('renders the value formatted with locale string', () => {
    render(<KPICard {...defaultProps} />);
    expect(screen.getByText(/125,000/)).toBeInTheDocument();
  });

  it('renders prefix before value', () => {
    render(<KPICard {...defaultProps} prefix="$" />);
    const valueEl = screen.getByText(/\$125,000/);
    expect(valueEl).toBeInTheDocument();
  });

  it('renders suffix after value', () => {
    render(<KPICard {...defaultProps} value={85} suffix="%" />);
    expect(screen.getByText(/85%/)).toBeInTheDocument();
  });

  it('renders string values without formatting', () => {
    render(<KPICard {...defaultProps} value="N/A" />);
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('shows the change percentage with absolute value', () => {
    render(<KPICard {...defaultProps} change={-8.3} />);
    expect(screen.getByText('8.3%')).toBeInTheDocument();
  });

  it('applies success color for upward trend', () => {
    const { container } = render(<KPICard {...defaultProps} trend="up" />);
    const badge = container.querySelector('.text-success-600');
    expect(badge).toBeTruthy();
  });

  it('applies danger color for downward trend', () => {
    const { container } = render(<KPICard {...defaultProps} trend="down" change={5} />);
    const badge = container.querySelector('.text-danger-600');
    expect(badge).toBeTruthy();
  });

  it('applies neutral color for stable trend', () => {
    const { container } = render(<KPICard {...defaultProps} trend="stable" change={0} />);
    const badge = container.querySelector('.text-surface-500');
    expect(badge).toBeTruthy();
  });

  it('has dark mode classes on the card container', () => {
    const { container } = render(<KPICard {...defaultProps} />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('dark:bg-surface-800');
  });
});
