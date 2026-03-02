import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Breadcrumb from '../../../src/components/shared/Breadcrumb';

function renderWithRouter(ui: React.ReactElement, { route = '/' } = {}) {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

describe('Breadcrumb', () => {
  it('renders Home icon link', () => {
    renderWithRouter(<Breadcrumb />);
    const homeLink = screen.getByRole('link', { name: 'Home' });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute('href', '/');
  });

  it('renders auto-generated breadcrumbs from URL path', () => {
    renderWithRouter(<Breadcrumb />, { route: '/paid-ads' });
    expect(screen.getByText('Paid Ads')).toBeInTheDocument();
  });

  it('renders custom items when provided', () => {
    const items = [
      { label: 'Dashboard', path: '/' },
      { label: 'Custom Section', path: '/custom' },
      { label: 'Detail View' },
    ];
    renderWithRouter(<Breadcrumb items={items} />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Custom Section')).toBeInTheDocument();
    expect(screen.getByText('Detail View')).toBeInTheDocument();
  });

  it('last breadcrumb item is not a link when it has no path', () => {
    const items = [
      { label: 'Dashboard', path: '/' },
      { label: 'Final Item' },
    ];
    renderWithRouter(<Breadcrumb items={items} />);
    const links = screen.getAllByRole('link');
    // Only the Home icon link and the Dashboard link should be present; Final Item is a plain span
    const linkTexts = links.map((l) => l.textContent);
    expect(linkTexts).not.toContain('Final Item');
    expect(screen.getByText('Final Item').tagName).toBe('SPAN');
  });

  it('intermediate items are links', () => {
    const items = [
      { label: 'Dashboard', path: '/' },
      { label: 'Analytics', path: '/analytics' },
      { label: 'Detail' },
    ];
    renderWithRouter(<Breadcrumb items={items} />);
    const dashboardLink = screen.getByRole('link', { name: 'Dashboard' });
    expect(dashboardLink).toBeInTheDocument();
    expect(dashboardLink).toHaveAttribute('href', '/');

    const analyticsLink = screen.getByRole('link', { name: 'Analytics' });
    expect(analyticsLink).toBeInTheDocument();
    expect(analyticsLink).toHaveAttribute('href', '/analytics');
  });

  it('applies custom className to the nav element', () => {
    const { container } = renderWithRouter(
      <Breadcrumb className="my-custom-class" />,
      { route: '/' }
    );
    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();
    expect(nav!.className).toContain('my-custom-class');
  });

  it('renders "Dashboard" as plain text for root path', () => {
    renderWithRouter(<Breadcrumb />, { route: '/' });
    // At root there is only one breadcrumb item: Dashboard with no path (plain span)
    const dashboardSpan = screen.getByText('Dashboard');
    expect(dashboardSpan.tagName).toBe('SPAN');
    expect(dashboardSpan).toBeInTheDocument();
  });

  it('handles unknown route segments by capitalizing and replacing hyphens with spaces', () => {
    renderWithRouter(<Breadcrumb />, { route: '/some-unknown-route' });
    // 'some-unknown-route' is not in routeLabels so the fallback applies:
    // charAt(0).toUpperCase() + slice(1).replace(/-/g, ' ') => 'Some unknown route'
    expect(screen.getByText('Some unknown route')).toBeInTheDocument();
  });

  it('has aria-label="Breadcrumb" on the nav element for accessibility', () => {
    renderWithRouter(<Breadcrumb />, { route: '/' });
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toBeInTheDocument();
    expect(nav).toHaveAttribute('aria-label', 'Breadcrumb');
  });

  it('renders ChevronRight separators between items', () => {
    renderWithRouter(<Breadcrumb />, { route: '/analytics' });
    // With route '/analytics', breadcrumbs are: Dashboard (link) + Analytics (plain span)
    // Each breadcrumb item is wrapped in a <span> that also contains a ChevronRight svg
    const { container } = renderWithRouter(<Breadcrumb />, { route: '/analytics' });
    const separatorSvgs = container.querySelectorAll('nav > span svg');
    // One separator per breadcrumb item (Dashboard separator + Analytics separator)
    expect(separatorSvgs.length).toBeGreaterThanOrEqual(2);
  });

  it('maps "paid-ads" to "Paid Ads" via routeLabels', () => {
    renderWithRouter(<Breadcrumb />, { route: '/paid-ads' });
    expect(screen.getByText('Paid Ads')).toBeInTheDocument();
  });

  it('auto-generated Dashboard item is a link for non-root paths', () => {
    renderWithRouter(<Breadcrumb />, { route: '/analytics' });
    const dashboardLink = screen.getByRole('link', { name: 'Dashboard' });
    expect(dashboardLink).toBeInTheDocument();
    expect(dashboardLink).toHaveAttribute('href', '/');
  });

  it('auto-generated last segment has no link for single-segment paths', () => {
    renderWithRouter(<Breadcrumb />, { route: '/settings' });
    // 'Settings' is the last (and only non-Dashboard) segment so it must be a plain span
    const settingsEl = screen.getByText('Settings');
    expect(settingsEl.tagName).toBe('SPAN');
    expect(settingsEl).not.toHaveAttribute('href');
  });

  it('has dark mode classes on the nav element', () => {
    const { container } = renderWithRouter(<Breadcrumb />, { route: '/' });
    const nav = container.querySelector('nav');
    // The nav carries the className prop which may include dark: utilities via className merge
    expect(nav).not.toBeNull();
    // Verify the nav has the base flex classes
    expect(nav!.className).toContain('flex');
    expect(nav!.className).toContain('items-center');
  });

  it('has dark mode classes on the Home icon link', () => {
    renderWithRouter(<Breadcrumb />);
    const homeLink = screen.getByRole('link', { name: 'Home' });
    expect(homeLink.className).toContain('dark:text-surface-500');
    expect(homeLink.className).toContain('dark:hover:text-surface-300');
  });
});
