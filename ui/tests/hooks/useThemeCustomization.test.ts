import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThemeCustomization } from '../../src/hooks/useThemeCustomization';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'theme-customization';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // Reset root element styles and classes
  const root = document.documentElement;
  root.removeAttribute('style');
  root.classList.remove('density-compact', 'density-comfortable');
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useThemeCustomization', () => {
  it('should apply accent color CSS variables to the document root', () => {
    const { result } = renderHook(() => useThemeCustomization());

    act(() => {
      result.current.setAccentColor('purple');
    });

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--color-primary-500')).toBe('#a855f7');
    expect(root.style.getPropertyValue('--color-primary-600')).toBe('#9333ea');
  });

  it('should apply density class to the document root', () => {
    const { result } = renderHook(() => useThemeCustomization());
    const root = document.documentElement;

    act(() => {
      result.current.setDensity('compact');
    });

    expect(root.classList.contains('density-compact')).toBe(true);
    expect(root.classList.contains('density-comfortable')).toBe(false);

    act(() => {
      result.current.setDensity('comfortable');
    });

    expect(root.classList.contains('density-comfortable')).toBe(true);
    expect(root.classList.contains('density-compact')).toBe(false);
  });

  it('should remove density classes when density is normal', () => {
    const { result } = renderHook(() => useThemeCustomization());
    const root = document.documentElement;

    act(() => {
      result.current.setDensity('compact');
    });
    expect(root.classList.contains('density-compact')).toBe(true);

    act(() => {
      result.current.setDensity('normal');
    });

    expect(root.classList.contains('density-compact')).toBe(false);
    expect(root.classList.contains('density-comfortable')).toBe(false);
  });

  it('should clamp font size to range 14-18', () => {
    const { result } = renderHook(() => useThemeCustomization());
    const root = document.documentElement;

    // Below minimum
    act(() => {
      result.current.setFontSize(10);
    });
    expect(result.current.fontSize).toBe(14);
    expect(root.style.getPropertyValue('--base-font-size')).toBe('14px');

    // Above maximum
    act(() => {
      result.current.setFontSize(24);
    });
    expect(result.current.fontSize).toBe(18);
    expect(root.style.getPropertyValue('--base-font-size')).toBe('18px');
  });

  it('should accept font sizes within the valid range', () => {
    const { result } = renderHook(() => useThemeCustomization());

    act(() => {
      result.current.setFontSize(16);
    });

    expect(result.current.fontSize).toBe(16);
    expect(document.documentElement.style.getPropertyValue('--base-font-size')).toBe('16px');
  });

  it('should clamp border radius to range 0-16', () => {
    const { result } = renderHook(() => useThemeCustomization());
    const root = document.documentElement;

    // Below minimum
    act(() => {
      result.current.setBorderRadius(-5);
    });
    expect(result.current.borderRadius).toBe(0);
    expect(root.style.getPropertyValue('--border-radius')).toBe('0px');

    // Above maximum
    act(() => {
      result.current.setBorderRadius(20);
    });
    expect(result.current.borderRadius).toBe(16);
    expect(root.style.getPropertyValue('--border-radius')).toBe('16px');
  });

  it('should accept border radius within the valid range', () => {
    const { result } = renderHook(() => useThemeCustomization());

    act(() => {
      result.current.setBorderRadius(12);
    });

    expect(result.current.borderRadius).toBe(12);
    expect(document.documentElement.style.getPropertyValue('--border-radius')).toBe('12px');
  });

  it('should persist customization to localStorage', () => {
    const { result } = renderHook(() => useThemeCustomization());

    act(() => {
      result.current.setAccentColor('green');
    });

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.accentColor).toBe('green');
  });

  it('should load customization from localStorage on mount', () => {
    const saved = {
      accentColor: 'rose',
      density: 'compact',
      fontSize: 16,
      borderRadius: 4,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

    const { result } = renderHook(() => useThemeCustomization());

    expect(result.current.accentColor).toBe('rose');
    expect(result.current.density).toBe('compact');
    expect(result.current.fontSize).toBe(16);
    expect(result.current.borderRadius).toBe(4);
  });

  it('should use defaults when localStorage is empty', () => {
    const { result } = renderHook(() => useThemeCustomization());

    expect(result.current.accentColor).toBe('blue');
    expect(result.current.density).toBe('normal');
    expect(result.current.fontSize).toBe(15);
    expect(result.current.borderRadius).toBe(8);
  });

  it('should expose the list of available accent colors', () => {
    const { result } = renderHook(() => useThemeCustomization());

    expect(result.current.accentColors).toEqual(
      expect.arrayContaining(['blue', 'purple', 'green', 'orange', 'rose', 'teal']),
    );
    expect(result.current.accentColors).toHaveLength(6);
  });
});
