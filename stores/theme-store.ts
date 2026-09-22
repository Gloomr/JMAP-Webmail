/**
 * The application's theme, which is light.
 *
 * There is one and it is not chosen. GLOOMR Mail is shipped light, on
 * every machine, whatever the machine prefers — the same way the
 * letters it sends stand light inline. A dark application around a
 * light letter is a letter proof-read against the wrong background, and
 * a theme picker is a promise that both are supported, which they are
 * not.
 *
 * The store keeps the shape the rest of the application reads
 * (`resolvedTheme` for the toaster), so nothing else had to change. The
 * setters exist for the same reason and do nothing: a caller asking for
 * dark gets light and is told so by the returned state.
 */

import { create } from 'zustand';

/**
 * Kept as wide as the readers expect. Three components still branch on
 * `resolvedTheme === 'dark'`; the branch is never taken, and narrowing
 * the type would only make three upstream files ours to carry through
 * every rebase for no change in behaviour.
 */
type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  resolvedTheme: Theme;
  setTheme: (theme: string) => void;
  toggleTheme: () => void;
  initializeTheme: () => void;
}

/** Puts the light class on the document and takes any dark one off. */
const applyLight = () => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('dark');
  root.classList.add('light');
  // A value an older build persisted must not bring dark back on reload.
  try {
    localStorage.setItem('theme-applied', 'light');
    localStorage.removeItem('theme-storage');
  } catch {
    /* storage may be unavailable; the class above is what matters */
  }
};

export const useThemeStore = create<ThemeState>()(() => ({
  theme: 'light',
  resolvedTheme: 'light',
  setTheme: () => applyLight(),
  toggleTheme: () => applyLight(),
  initializeTheme: () => applyLight(),
}));
