export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Triggers a short, subtle tactile vibration on supported Android/mobile browsers,
 * respecting user reduced-motion preferences.
 */
export function triggerLightHaptic(durationMs = 8): void {
  if (prefersReducedMotion()) return;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(durationMs);
    }
  } catch {
    // Ignore vibration errors in restricted contexts
  }
}

/**
 * Updates the installed PWA home-screen icon badge counter when supported by Chrome/Android.
 */
export function syncPwaAppBadge(count: number): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Partial<{
    setAppBadge: (contents?: number) => Promise<void>;
    clearAppBadge: () => Promise<void>;
  }>;
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  try {
    if (safeCount > 0 && typeof nav.setAppBadge === 'function') {
      void nav.setAppBadge(safeCount).catch(() => {});
    } else if (safeCount === 0 && typeof nav.clearAppBadge === 'function') {
      void nav.clearAppBadge().catch(() => {});
    }
  } catch {
    // Ignore unsupported App Badging API errors
  }
}

export function scrollViewportToTop(smooth = true): void {
  if (typeof window === 'undefined' || typeof window.scrollTo !== 'function') return;
  try {
    window.scrollTo({
      top: 0,
      behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto',
    });
  } catch {
    window.scrollTo(0, 0);
  }
}
