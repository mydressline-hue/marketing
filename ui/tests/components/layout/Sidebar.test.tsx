import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../../../src/components/layout/Sidebar';

const mockToggleSidebar = vi.fn();

// Mock the useApp hook
vi.mock('../../../src/context/AppContext', () => ({
  useApp: () => ({
    sidebarOpen: true,
    darkMode: false,
    toggleSidebar: mockToggleSidebar,
    toggleDarkMode: vi.fn(),
    autonomyMode: 'semi' as const,
    setAutonomyMode: vi.fn(),
    alerts: [],
    killSwitch: { global: false, campaigns: false, automation: false, apiKeys: false, countrySpecific: {} },
    setKillSwitch: vi.fn(),
    addAlert: vi.fn(),
    dismissAlert: vi.fn(),
    selectedCountry: null,
    setSelectedCountry: vi.fn(),
  }),
}));

function renderSidebar(initialRoute = '/') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Sidebar />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockToggleSidebar.mockClear();
});

describe('Sidebar', () => {
  it('renders the Growth Engine branding', () => {
    renderSidebar();
    expect(screen.getByText('Growth Engine')).toBeInTheDocument();
    expect(screen.getByText('AI International')).toBeInTheDocument();
  });

  it('renders the Dashboard nav item', () => {
    renderSidebar();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders the Market Intelligence nav item', () => {
    renderSidebar();
    expect(screen.getByText('Market Intelligence')).toBeInTheDocument();
  });

  it('renders the Country Strategy nav item', () => {
    renderSidebar();
    expect(screen.getByText('Country Strategy')).toBeInTheDocument();
  });

  it('renders the Paid Ads nav item', () => {
    renderSidebar();
    expect(screen.getByText('Paid Ads')).toBeInTheDocument();
  });

  it('renders all 24 navigation items', () => {
    renderSidebar();
    const expectedLabels = [
      'Dashboard', 'Market Intelligence', 'Country Strategy', 'Paid Ads',
      'Organic Social', 'Content & Blog', 'Creative Studio', 'Video Generation',
      'Analytics', 'Budget Optimizer', 'A/B Testing', 'Conversion', 'Shopify',
      'Localization', 'Compliance', 'Competitive Intel', 'Fraud Detection',
      'Brand Consistency', 'Data Engineering', 'Security', 'Revenue Forecast',
      'Orchestrator', 'Kill Switch', 'Settings',
    ];
    expectedLabels.forEach(label => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    // Also verify count
    const navLinks = screen.getAllByRole('link');
    expect(navLinks).toHaveLength(24);
  });

  it('renders nav items as links with correct paths', () => {
    renderSidebar();
    const dashboardLink = screen.getByText('Dashboard').closest('a');
    expect(dashboardLink).toHaveAttribute('href', '/');

    const analyticsLink = screen.getByText('Analytics').closest('a');
    expect(analyticsLink).toHaveAttribute('href', '/analytics');
  });

  it('highlights the active route', () => {
    renderSidebar('/analytics');
    const analyticsLink = screen.getByText('Analytics').closest('a');
    expect(analyticsLink?.className).toContain('bg-primary-50');
  });

  it('does not highlight inactive routes', () => {
    renderSidebar('/');
    const analyticsLink = screen.getByText('Analytics').closest('a');
    expect(analyticsLink?.className).not.toContain('bg-primary-50');
  });

  it('calls toggleSidebar when close button is clicked', () => {
    renderSidebar();
    const closeButton = screen.getByLabelText('Close sidebar');
    fireEvent.click(closeButton);
    expect(mockToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('renders the system status indicator', () => {
    renderSidebar();
    expect(screen.getByText('System Active')).toBeInTheDocument();
    expect(screen.getByText('20 agents running')).toBeInTheDocument();
  });

  it('renders navigation with proper ARIA role and label', () => {
    renderSidebar();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(nav).toBeInTheDocument();
  });

  it('has dark mode classes on the sidebar container', () => {
    const { container } = renderSidebar();
    const aside = container.querySelector('aside');
    expect(aside?.className).toContain('dark:bg-surface-900');
    expect(aside?.className).toContain('dark:border-surface-700');
  });

  it('nav links have focus-visible ring class for keyboard navigation', () => {
    renderSidebar();
    const link = screen.getByText('Dashboard').closest('a');
    expect(link?.className).toContain('focus-visible:ring-2');
    expect(link?.className).toContain('focus-visible:ring-primary-500');
  });

  it('renders backdrop overlay when sidebar is open', () => {
    const { container } = renderSidebar();
    const backdrop = container.querySelector('.bg-black\\/40');
    expect(backdrop).toBeTruthy();
  });

  it('clicking backdrop overlay calls toggleSidebar', () => {
    const { container } = renderSidebar();
    const backdrop = container.querySelector('.bg-black\\/40');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(mockToggleSidebar).toHaveBeenCalledTimes(1);
  });
});
