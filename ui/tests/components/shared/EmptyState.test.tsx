import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EmptyState from '../../../src/components/shared/EmptyState';

describe('EmptyState', () => {
  it('renders the title', () => {
    render(<EmptyState title="No data found" />);
    expect(screen.getByText('No data found')).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(<EmptyState title="No data" description="Try adjusting your filters" />);
    expect(screen.getByText('Try adjusting your filters')).toBeInTheDocument();
  });

  it('renders the message prop as description alias', () => {
    render(<EmptyState title="No data" message="Try again later" />);
    expect(screen.getByText('Try again later')).toBeInTheDocument();
  });

  it('prefers description over message when both are provided', () => {
    render(<EmptyState title="No data" description="Description text" message="Message text" />);
    expect(screen.getByText('Description text')).toBeInTheDocument();
    expect(screen.queryByText('Message text')).not.toBeInTheDocument();
  });

  it('does not render description when neither description nor message provided', () => {
    const { container } = render(<EmptyState title="No data" />);
    const descEl = container.querySelector('.text-sm.text-surface-500');
    expect(descEl).toBeNull();
  });

  it('renders action button when provided', () => {
    const handleClick = vi.fn();
    render(
      <EmptyState
        title="No campaigns"
        action={<button onClick={handleClick}>Create Campaign</button>}
      />
    );
    const button = screen.getByText('Create Campaign');
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not render action container when no action provided', () => {
    const { container } = render(<EmptyState title="No data" />);
    const actionDiv = container.querySelector('.mt-1');
    expect(actionDiv).toBeNull();
  });

  it('renders default Inbox icon when no icon is provided', () => {
    const { container } = render(<EmptyState title="No data" />);
    const iconContainer = container.querySelector('.w-12.h-12');
    expect(iconContainer).toBeTruthy();
  });

  it('applies custom className', () => {
    const { container } = render(<EmptyState title="No data" className="my-custom-class" />);
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toContain('my-custom-class');
  });

  it('applies compact padding when compact is true', () => {
    const { container } = render(<EmptyState title="No data" compact />);
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toContain('py-8');
  });

  it('applies full padding when compact is false', () => {
    const { container } = render(<EmptyState title="No data" />);
    const outer = container.firstChild as HTMLElement;
    expect(outer.className).toContain('py-16');
  });

  it('has dark mode classes on the icon container', () => {
    const { container } = render(<EmptyState title="No data" />);
    const iconContainer = container.querySelector('.w-12.h-12');
    expect(iconContainer?.className).toContain('dark:bg-surface-700');
  });
});
