import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConfidenceScore from '../../../src/components/shared/ConfidenceScore';

describe('ConfidenceScore', () => {
  it('displays the score number', () => {
    render(<ConfidenceScore score={75} />);
    expect(screen.getByText('75')).toBeInTheDocument();
  });

  it('displays a score of 0', () => {
    render(<ConfidenceScore score={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('displays a score of 100', () => {
    render(<ConfidenceScore score={100} />);
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('shows "High" label for score >= 80', () => {
    render(<ConfidenceScore score={85} />);
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('shows "Good" label for score >= 60 and < 80', () => {
    render(<ConfidenceScore score={65} />);
    expect(screen.getByText('Good')).toBeInTheDocument();
  });

  it('shows "Medium" label for score >= 40 and < 60', () => {
    render(<ConfidenceScore score={50} />);
    expect(screen.getByText('Medium')).toBeInTheDocument();
  });

  it('shows "Low" label for score < 40', () => {
    render(<ConfidenceScore score={20} />);
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('hides label when showLabel is false', () => {
    render(<ConfidenceScore score={85} showLabel={false} />);
    expect(screen.queryByText('High')).not.toBeInTheDocument();
  });

  it('applies success ring color for score >= 80', () => {
    const { container } = render(<ConfidenceScore score={90} />);
    const ring = container.querySelector('.text-success-500');
    expect(ring).toBeTruthy();
  });

  it('applies primary ring color for score >= 60 and < 80', () => {
    const { container } = render(<ConfidenceScore score={70} />);
    const ring = container.querySelector('.text-primary-500');
    expect(ring).toBeTruthy();
  });

  it('applies warning ring color for score >= 40 and < 60', () => {
    const { container } = render(<ConfidenceScore score={45} />);
    const ring = container.querySelector('.text-warning-500');
    expect(ring).toBeTruthy();
  });

  it('applies danger ring color for score < 40', () => {
    const { container } = render(<ConfidenceScore score={15} />);
    const ring = container.querySelector('.text-danger-500');
    expect(ring).toBeTruthy();
  });

  it('renders small size dimensions', () => {
    const { container } = render(<ConfidenceScore score={50} size="sm" />);
    const sizeDiv = container.querySelector('.w-10.h-10');
    expect(sizeDiv).toBeTruthy();
  });

  it('renders medium size dimensions by default', () => {
    const { container } = render(<ConfidenceScore score={50} />);
    const sizeDiv = container.querySelector('.w-14.h-14');
    expect(sizeDiv).toBeTruthy();
  });

  it('renders large size dimensions', () => {
    const { container } = render(<ConfidenceScore score={50} size="lg" />);
    const sizeDiv = container.querySelector('.w-20.h-20');
    expect(sizeDiv).toBeTruthy();
  });

  it('renders SVG circle elements for the ring', () => {
    const { container } = render(<ConfidenceScore score={50} />);
    const circles = container.querySelectorAll('circle');
    expect(circles).toHaveLength(2);
  });
});
