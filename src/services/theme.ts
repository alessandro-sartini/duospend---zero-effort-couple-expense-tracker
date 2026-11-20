export type Theme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'duospend-theme';

export function loadThemePreference(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch (error) {
    console.warn('Theme preference could not be loaded:', error);
    return 'dark';
  }
}

export function applyThemePreference(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function saveThemePreference(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.warn('Theme preference could not be saved:', error);
  }
}
