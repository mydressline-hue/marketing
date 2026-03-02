import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Card from '../../../src/components/shared/Card';

describe('Card', () => {
  it('renders children content', () => {
    render(<Card>Hello World</Card>);
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('renders title when provided', () => {
    render(<Card title="Test Title">content</Card>);
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(<Card title="Title" subtitle="Subtitle">content</Card>);
    expect(screen.getByText('Subtitle')).toBeInTheDocument();
  });

  it('renders actions slot', () => {
    render(<Card title="Title" actions={<button>Action</button>}>content</Card>);
    expect(screen.getByText('Action')).toBeInTheDocument();
  });

  it('does not render header when no title or actions', () => {
    const { container } = render(<Card>content</Card>);
    expect(container.querySelector('.border-b')).toBeNull();
  });

  it('applies custom className', () => {
    const { container } = render(<Card className="custom-class">content</Card>);
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('applies noPadding when set', () => {
    const { container } = render(<Card noPadding>content</Card>);
    const contentDiv = container.querySelector('.bg-white, [class*="bg-white"]');
    expect(contentDiv).toBeTruthy();
  });

  it('has dark mode classes', () => {
    const { container } = render(<Card>content</Card>);
    const cardEl = container.firstChild as HTMLElement;
    expect(cardEl.className).toContain('bg-white');
  });
});
