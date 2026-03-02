import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTheme } from '../../src/hooks/useTheme';

// Mock useApp from AppContext
vi.mock('../../src/context/AppContext', () => ({
  useApp: vi.fn(),
}));

import { useApp } from '../../src/context/AppContext';

const mockUseApp = useApp as ReturnType<typeof vi.fn>;

describe('useTheme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clean up any leftover classes
    document.documentElement.classList.remove('dark');
  });

  it('should add "dark" class to <html> when darkMode is true', () => {
    mockUseApp.mockReturnValue({ darkMode: true });

    renderHook(() => useTheme());

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('should not add "dark" class when darkMode is false', () => {
    mockUseApp.mockReturnValue({ darkMode: false });

    renderHook(() => useTheme());

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('should remove "dark" class when darkMode changes from true to false', () => {
    mockUseApp.mockReturnValue({ darkMode: true });

    const { rerender } = renderHook(() => useTheme());
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    mockUseApp.mockReturnValue({ darkMode: false });
    rerender();

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('should add "dark" class when darkMode changes from false to true', () => {
    mockUseApp.mockReturnValue({ darkMode: false });

    const { rerender } = renderHook(() => useTheme());
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    mockUseApp.mockReturnValue({ darkMode: true });
    rerender();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('should return the current darkMode value', () => {
    mockUseApp.mockReturnValue({ darkMode: true });

    const { result } = renderHook(() => useTheme());

    expect(result.current.darkMode).toBe(true);
  });

  it('should return darkMode false when context says false', () => {
    mockUseApp.mockReturnValue({ darkMode: false });

    const { result } = renderHook(() => useTheme());

    expect(result.current.darkMode).toBe(false);
  });
});
