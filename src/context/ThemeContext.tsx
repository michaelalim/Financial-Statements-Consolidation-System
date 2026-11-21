import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { ThemeMode, ColorThemeId, COLOR_THEMES, TextScaleMode } from '../types/theme';

export const SECOND_NAV_MIN_HEIGHT = 44;
export const SECOND_NAV_DEFAULT_HEIGHT = 64;
export const SECOND_NAV_MAX_HEIGHT = 140;

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
  textScale: TextScaleMode;
  setTextScale: (scale: TextScaleMode) => void;
  secondNavHeight: number;
  setSecondNavHeight: (height: number) => void;
  resetSecondNavHeight: () => void;
}

const LOCAL_STORAGE_KEY_MODE = 'deped_ro6_theme_mode_v3';
const LOCAL_STORAGE_KEY_THEME = 'deped_ro6_color_theme_v1';
const LOCAL_STORAGE_KEY_CONTRAST_ACCENT = 'deped_ro6_contrast_accent_v1';
const LOCAL_STORAGE_KEY_TEXT_SCALE = 'deped_ro6_text_scale_v1';
const LOCAL_STORAGE_KEY_SECOND_NAV_HEIGHT = 'deped_ro6_second_nav_height_v1';

const VALID_THEME_IDS = new Set<ColorThemeId>(COLOR_THEMES.map((t) => t.id));
const VALID_TEXT_SCALES = new Set<TextScaleMode>(['xs', 'small', 'standard', 'large', 'xlarge']);

const clampSecondNavHeight = (val: number): number =>
  Math.max(SECOND_NAV_MIN_HEIGHT, Math.min(SECOND_NAV_MAX_HEIGHT, Math.round(val)));

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

  const [textScale, setTextScale] = useState<TextScaleMode>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_TEXT_SCALE) as TextScaleMode;
      if (saved && VALID_TEXT_SCALES.has(saved)) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'large';
  });

  const [secondNavHeight, setSecondNavHeightState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_SECOND_NAV_HEIGHT);
      if (saved !== null) {
        const parsed = Number(saved);
        if (Number.isFinite(parsed)) {
          return clampSecondNavHeight(parsed);
        }
      }
    } catch {
      // ignore
    }
    return SECOND_NAV_DEFAULT_HEIGHT;
  });

  const setSecondNavHeight = (height: number) => {
    setSecondNavHeightState(clampSecondNavHeight(height));
  };

  const resetSecondNavHeight = () => {
    setSecondNavHeightState(SECOND_NAV_DEFAULT_HEIGHT);
  };

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

  // Apply dark class, data-theme, data-contrast-accent, and data-text-scale attributes to html element
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.setAttribute('data-theme', themeId);
    root.setAttribute('data-contrast-accent', useContrastAccent ? 'true' : 'false');
    root.setAttribute('data-text-scale', textScale);

    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_MODE, mode);
      localStorage.setItem(LOCAL_STORAGE_KEY_THEME, themeId);
      localStorage.setItem(LOCAL_STORAGE_KEY_CONTRAST_ACCENT, String(useContrastAccent));
      localStorage.setItem(LOCAL_STORAGE_KEY_TEXT_SCALE, textScale);
    } catch {
      // ignore
    }
  }, [isDark, mode, themeId, useContrastAccent, textScale]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_SECOND_NAV_HEIGHT, String(secondNavHeight));
    } catch {
      // ignore
    }
  }, [secondNavHeight]);

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
        textScale,
        setTextScale,
        secondNavHeight,
        setSecondNavHeight,
        resetSecondNavHeight,
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
