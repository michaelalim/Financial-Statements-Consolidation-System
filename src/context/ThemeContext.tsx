import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { ThemeMode, ColorThemeId, COLOR_THEMES } from '../types/theme';

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleDarkMode: () => void;
  themeId: ColorThemeId;
  setThemeId: (id: ColorThemeId) => void;
  useContrastAccent: boolean;
  setUseContrastAccent: (value: boolean) => void;
  toggleContrastAccent: () => void;
}

const LOCAL_STORAGE_KEY_MODE = 'deped_ro6_theme_mode_v3';
const LOCAL_STORAGE_KEY_THEME = 'deped_ro6_color_theme_v1';
const LOCAL_STORAGE_KEY_CONTRAST_ACCENT = 'deped_ro6_contrast_accent_v1';

const VALID_THEME_IDS = new Set<ColorThemeId>(COLOR_THEMES.map((t) => t.id));

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_MODE) as ThemeMode;
      if (saved && ['light', 'dark', 'system'].includes(saved)) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'light';
  });

  const [themeId, setThemeId] = useState<ColorThemeId>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_THEME) as ColorThemeId;
      if (saved && VALID_THEME_IDS.has(saved)) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'midnight-magenta';
  });

  const [useContrastAccent, setUseContrastAccent] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_CONTRAST_ACCENT);
      if (saved === 'false') return false;
      if (saved === 'true') return true;
    } catch {
      // ignore
    }
    return true;
  });

  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Calculate whether dark mode is currently active
  const isDark = useMemo(() => {
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    return systemPrefersDark;
  }, [mode, systemPrefersDark]);

  // Apply dark class, data-theme, and data-contrast-accent attributes to html element
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.setAttribute('data-theme', themeId);
    root.setAttribute('data-contrast-accent', useContrastAccent ? 'true' : 'false');

    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_MODE, mode);
      localStorage.setItem(LOCAL_STORAGE_KEY_THEME, themeId);
      localStorage.setItem(LOCAL_STORAGE_KEY_CONTRAST_ACCENT, String(useContrastAccent));
    } catch {
      // ignore
    }
  }, [isDark, mode, themeId, useContrastAccent]);

  const toggleDarkMode = () => {
    setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const toggleContrastAccent = () => {
    setUseContrastAccent((prev) => !prev);
  };

  return (
    <ThemeContext.Provider
      value={{
        mode,
        isDark,
        setMode,
        toggleDarkMode,
        themeId,
        setThemeId,
        useContrastAccent,
        setUseContrastAccent,
        toggleContrastAccent,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
