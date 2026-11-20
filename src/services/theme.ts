export type Theme = 'dark' | 'light';

export const THEME_CHROME_COLORS: Record<Theme, string> = {
  dark: '#131210',
  light: '#efece6',
};

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
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  const chromeColor = THEME_CHROME_COLORS[theme];
  const existingMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (existingMeta) {
    existingMeta.content = chromeColor;
  } else {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = chromeColor;
    document.head.appendChild(meta);
  }
}

export function saveThemePreference(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.warn('Theme preference could not be saved:', error);
  }
}
