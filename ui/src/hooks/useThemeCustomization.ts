import { useState, useEffect, useCallback } from 'react';

export type AccentColor = 'blue' | 'purple' | 'green' | 'orange' | 'rose' | 'teal';
export type Density = 'compact' | 'normal' | 'comfortable';

interface ThemeCustomization {
  accentColor: AccentColor;
  density: Density;
  fontSize: number;
  borderRadius: number;
}

const ACCENT_COLORS: Record<AccentColor, Record<string, string>> = {
  blue: {
    '--color-primary-50': '#eff6ff',
    '--color-primary-100': '#dbeafe',
    '--color-primary-200': '#bfdbfe',
    '--color-primary-300': '#93c5fd',
    '--color-primary-400': '#60a5fa',
    '--color-primary-500': '#3b82f6',
    '--color-primary-600': '#2563eb',
    '--color-primary-700': '#1d4ed8',
    '--color-primary-800': '#1e40af',
    '--color-primary-900': '#1e3a8a',
    '--color-primary-950': '#172554',
  },
  purple: {
    '--color-primary-50': '#faf5ff',
    '--color-primary-100': '#f3e8ff',
    '--color-primary-200': '#e9d5ff',
    '--color-primary-300': '#d8b4fe',
    '--color-primary-400': '#c084fc',
    '--color-primary-500': '#a855f7',
    '--color-primary-600': '#9333ea',
    '--color-primary-700': '#7e22ce',
    '--color-primary-800': '#6b21a8',
    '--color-primary-900': '#581c87',
    '--color-primary-950': '#3b0764',
  },
  green: {
    '--color-primary-50': '#f0fdf4',
    '--color-primary-100': '#dcfce7',
    '--color-primary-200': '#bbf7d0',
    '--color-primary-300': '#86efac',
    '--color-primary-400': '#4ade80',
    '--color-primary-500': '#22c55e',
    '--color-primary-600': '#16a34a',
    '--color-primary-700': '#15803d',
    '--color-primary-800': '#166534',
    '--color-primary-900': '#14532d',
    '--color-primary-950': '#052e16',
  },
  orange: {
    '--color-primary-50': '#fff7ed',
    '--color-primary-100': '#ffedd5',
    '--color-primary-200': '#fed7aa',
    '--color-primary-300': '#fdba74',
    '--color-primary-400': '#fb923c',
    '--color-primary-500': '#f97316',
    '--color-primary-600': '#ea580c',
    '--color-primary-700': '#c2410c',
    '--color-primary-800': '#9a3412',
    '--color-primary-900': '#7c2d12',
    '--color-primary-950': '#431407',
  },
  rose: {
    '--color-primary-50': '#fff1f2',
    '--color-primary-100': '#ffe4e6',
    '--color-primary-200': '#fecdd3',
    '--color-primary-300': '#fda4af',
    '--color-primary-400': '#fb7185',
    '--color-primary-500': '#f43f5e',
    '--color-primary-600': '#e11d48',
    '--color-primary-700': '#be123c',
    '--color-primary-800': '#9f1239',
    '--color-primary-900': '#881337',
    '--color-primary-950': '#4c0519',
  },
  teal: {
    '--color-primary-50': '#f0fdfa',
    '--color-primary-100': '#ccfbf1',
    '--color-primary-200': '#99f6e4',
    '--color-primary-300': '#5eead4',
    '--color-primary-400': '#2dd4bf',
    '--color-primary-500': '#14b8a6',
    '--color-primary-600': '#0d9488',
    '--color-primary-700': '#0f766e',
    '--color-primary-800': '#115e59',
    '--color-primary-900': '#134e4a',
    '--color-primary-950': '#042f2e',
  },
};

const STORAGE_KEY = 'theme-customization';

function loadCustomization(): ThemeCustomization {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* stored value unparseable — use defaults */ }
  return { accentColor: 'blue', density: 'normal', fontSize: 15, borderRadius: 8 };
}

function saveCustomization(customization: ThemeCustomization) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(customization));
}

function applyCustomization(customization: ThemeCustomization) {
  const root = document.documentElement;

  // Apply accent color
  const colors = ACCENT_COLORS[customization.accentColor];
  for (const [prop, value] of Object.entries(colors)) {
    root.style.setProperty(prop, value);
  }

  // Apply density
  root.classList.remove('density-compact', 'density-comfortable');
  if (customization.density === 'compact') {
    root.classList.add('density-compact');
  } else if (customization.density === 'comfortable') {
    root.classList.add('density-comfortable');
  }

  // Apply font size
  root.style.setProperty('--base-font-size', `${customization.fontSize}px`);
  root.style.fontSize = `${customization.fontSize}px`;

  // Apply border radius
  root.style.setProperty('--border-radius', `${customization.borderRadius}px`);
}

export function useThemeCustomization() {
  const [customization, setCustomization] = useState<ThemeCustomization>(loadCustomization);

  useEffect(() => {
    applyCustomization(customization);
  }, [customization]);

  const setAccentColor = useCallback((color: AccentColor) => {
    setCustomization(prev => {
      const next = { ...prev, accentColor: color };
      saveCustomization(next);
      return next;
    });
  }, []);

  const setDensity = useCallback((density: Density) => {
    setCustomization(prev => {
      const next = { ...prev, density };
      saveCustomization(next);
      return next;
    });
  }, []);

  const setFontSize = useCallback((fontSize: number) => {
    setCustomization(prev => {
      const next = { ...prev, fontSize: Math.max(14, Math.min(18, fontSize)) };
      saveCustomization(next);
      return next;
    });
  }, []);

  const setBorderRadius = useCallback((borderRadius: number) => {
    setCustomization(prev => {
      const next = { ...prev, borderRadius: Math.max(0, Math.min(16, borderRadius)) };
      saveCustomization(next);
      return next;
    });
  }, []);

  return {
    ...customization,
    setAccentColor,
    setDensity,
    setFontSize,
    setBorderRadius,
    accentColors: Object.keys(ACCENT_COLORS) as AccentColor[],
  };
}
