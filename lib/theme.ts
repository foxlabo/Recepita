// lib/theme.ts
// Light/dark theme: the `dark` class on <html> (Tailwind's `dark:` variant is
// bound to it in app/globals.css). The user's choice is stored in
// localStorage; without a stored choice the OS setting (prefers-color-scheme)
// is followed.

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'rx_theme';

/**
 * Inline script for <head> in the root layout: applies the theme before the
 * first paint so there is no light→dark flash. Kept dependency-free.
 */
export const themeInitScript = `(function(){try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export function getStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

export function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function storeTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage unavailable (private mode etc.): the choice lasts for this page only */
  }
}
