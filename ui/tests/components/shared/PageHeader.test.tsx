import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PageHeader from '../../../src/components/shared/PageHeader';

describe('PageHeader', () => {
  it('renders the title', () => {
    render(<PageHeader title="Dashboard" />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders the title as an h1 heading', () => {
    render(<PageHeader title="Dashboard" />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Dashboard');
  });

  it('renders the subtitle when provided', () => {
    render(<PageHeader title="Dashboard" subtitle="Overview of all metrics" />);
    expect(screen.getByText('Overview of all metrics')).toBeInTheDocument();
  });

  it('does not render subtitle when not provided', () => {
    const { container } = render(<PageHeader title="Dashboard" />);
    const subtitle = container.querySelector('.text-sm.text-surface-500');
    expect(subtitle).toBeNull();
  });

  it('renders icon when provided', () => {
    render(<PageHeader title="Dashboard" icon={<svg data-testid="test-icon" />} />);
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('does not render icon container when icon is not provided', () => {
    const { container } = render(<PageHeader title="Dashboard" />);
    const iconContainer = container.querySelector('.bg-primary-100');
    expect(iconContainer).toBeNull();
  });

  it('renders actions when provided', () => {
    render(
      <PageHeader
        title="Dashboard"
        actions={<button>Export</button>}
      />
    );
    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  it('renders multiple action buttons', () => {
    render(
      <PageHeader
        title="Dashboard"
        actions={
          <>
            <button>Export</button>
            <button>Settings</button>
          </>
        }
      />
    );
    expect(screen.getByText('Export')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('does not render actions container when no actions provided', () => {
    const { container } = render(<PageHeader title="Dashboard" />);
    const actionsContainer = container.querySelector('.flex.items-center.gap-2');
    expect(actionsContainer).toBeNull();
  });

  it('has dark mode classes on the title', () => {
    render(<PageHeader title="Dashboard" />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.className).toContain('dark:text-surface-100');
  });

  it('has dark mode classes on the icon container when icon is provided', () => {
    const { container } = render(
      <PageHeader title="Dashboard" icon={<svg data-testid="icon" />} />
    );
    const iconContainer = container.querySelector('.bg-primary-100');
    expect(iconContainer?.className).toContain('dark:bg-primary-500/10');
  });
});
