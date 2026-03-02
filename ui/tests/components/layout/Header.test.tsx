import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Header from '../../../src/components/layout/Header';

const mockToggleSidebar = vi.fn();
const mockToggleDarkMode = vi.fn();
const mockSetAutonomyMode = vi.fn();

// Mock the useApp hook
vi.mock('../../../src/context/AppContext', () => ({
  useApp: () => ({
    sidebarOpen: true,
    darkMode: false,
    toggleSidebar: mockToggleSidebar,
    toggleDarkMode: mockToggleDarkMode,
    autonomyMode: 'semi' as const,
    setAutonomyMode: mockSetAutonomyMode,
    alerts: [
      { id: '1', type: 'warning', source: 'test', message: 'Test alert', timestamp: new Date().toISOString(), acknowledged: false },
      { id: '2', type: 'info', source: 'test', message: 'Info alert', timestamp: new Date().toISOString(), acknowledged: true },
    ],
    killSwitch: { global: false, campaigns: false, automation: false, apiKeys: false, countrySpecific: {} },
    setKillSwitch: vi.fn(),
    addAlert: vi.fn(),
    dismissAlert: vi.fn(),
    selectedCountry: null,
    setSelectedCountry: vi.fn(),
  }),
}));

beforeEach(() => {
  mockToggleSidebar.mockClear();
  mockToggleDarkMode.mockClear();
  mockSetAutonomyMode.mockClear();
});

describe('Header', () => {
  it('renders the header element with banner role', () => {
    render(<Header />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('renders the search input', () => {
    render(<Header />);
    const searchInput = screen.getByLabelText('Search');
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toHaveAttribute('placeholder', 'Search agents, campaigns, countries...');
  });

  it('renders sidebar toggle button', () => {
    render(<Header />);
    const toggleButton = screen.getByLabelText('Toggle sidebar');
    expect(toggleButton).toBeInTheDocument();
  });

  it('calls toggleSidebar when sidebar toggle is clicked', () => {
    render(<Header />);
    fireEvent.click(screen.getByLabelText('Toggle sidebar'));
    expect(mockToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('renders all three autonomy mode buttons', () => {
    render(<Header />);
    expect(screen.getByText('Manual')).toBeInTheDocument();
    expect(screen.getByText('Semi-Auto')).toBeInTheDocument();
    expect(screen.getByText('Full Auto')).toBeInTheDocument();
  });

  it('highlights the active autonomy mode (semi)', () => {
    render(<Header />);
    const semiButton = screen.getByText('Semi-Auto');
    expect(semiButton.className).toContain('text-primary-700');
    expect(semiButton.className).toContain('bg-white');
  });

  it('calls setAutonomyMode when a mode button is clicked', () => {
    render(<Header />);
    fireEvent.click(screen.getByText('Manual'));
    expect(mockSetAutonomyMode).toHaveBeenCalledWith('manual');

    fireEvent.click(screen.getByText('Full Auto'));
    expect(mockSetAutonomyMode).toHaveBeenCalledWith('full');
  });

  it('renders dark mode toggle button', () => {
    render(<Header />);
    const darkModeButton = screen.getByLabelText('Switch to dark mode');
    expect(darkModeButton).toBeInTheDocument();
  });

  it('calls toggleDarkMode when dark mode button is clicked', () => {
    render(<Header />);
    fireEvent.click(screen.getByLabelText('Switch to dark mode'));
    expect(mockToggleDarkMode).toHaveBeenCalledTimes(1);
  });

  it('renders notification bell button', () => {
    render(<Header />);
    const bellButton = screen.getByLabelText('Notifications');
    expect(bellButton).toBeInTheDocument();
  });

  it('displays unread alert count badge', () => {
    render(<Header />);
    // Only 1 alert is unacknowledged
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders security status button', () => {
    render(<Header />);
    const securityButton = screen.getByLabelText('Security status');
    expect(securityButton).toBeInTheDocument();
  });

  it('renders user avatar with initials', () => {
    render(<Header />);
    expect(screen.getByText('AI')).toBeInTheDocument();
  });

  it('has dark mode classes on the header', () => {
    render(<Header />);
    const header = screen.getByRole('banner');
    expect(header.className).toContain('dark:bg-surface-900');
    expect(header.className).toContain('dark:border-surface-700');
  });

  it('has dark mode classes on the search input', () => {
    render(<Header />);
    const searchInput = screen.getByLabelText('Search');
    expect(searchInput.className).toContain('dark:bg-surface-800');
    expect(searchInput.className).toContain('dark:text-surface-100');
  });
});
