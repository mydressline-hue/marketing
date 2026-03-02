import { useEffect } from 'react';
import { useApp } from '../context/AppContext';

export function useTheme() {
  const { darkMode } = useApp();

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  return { darkMode };
}
