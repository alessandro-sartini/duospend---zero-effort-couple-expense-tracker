export interface OverlayHistoryEntry {
  id: number;
  onClose: () => void;
}

const stack: OverlayHistoryEntry[] = [];
let nextEntryId = 1;
let pushedDepth = 0;
let lastOverlayHref: string | null = null;
let pendingGoBack = false;
let pendingBackTimer: ReturnType<typeof setTimeout> | null = null;
let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;

function readHistoryOverlayDepth(state: unknown): number {
  if (!state || typeof state !== 'object') return 0;
  const candidate = (state as { __dsOverlayDepth?: unknown }).__dsOverlayDepth;
  if (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate < 0) {
    return 0;
  }
  return Math.floor(candidate);
}

function clearPendingBackTimer(): void {
  if (pendingBackTimer !== null) {
    clearTimeout(pendingBackTimer);
    pendingBackTimer = null;
  }
}

function handlePopState(event: PopStateEvent): void {
  const rawDepth = readHistoryOverlayDepth(event.state);

  if (pendingGoBack) {
    clearPendingBackTimer();
    pendingGoBack = false;
    pushedDepth = rawDepth;
    lastOverlayHref = rawDepth > 0 && typeof window !== 'undefined' ? window.location.href : null;
    scheduleReconcile();
    return;
  }

  pushedDepth = rawDepth;
  lastOverlayHref = rawDepth > 0 && typeof window !== 'undefined' ? window.location.href : null;

  if (stack.length > rawDepth) {
    const closing = stack.splice(rawDepth);
    for (let i = closing.length - 1; i >= 0; i -= 1) {
      try {
        closing[i]?.onClose();
      } catch (error) {
        console.error('Overlay back close handler failed:', error);
      }
    }
  }
}

function ensureInitialized(): void {
  if (initialized || typeof window === 'undefined') return;
  window.addEventListener('popstate', handlePopState);
  initialized = true;
}

function reconcileNow(): void {
  if (typeof window === 'undefined' || typeof window.history === 'undefined') return;
  if (pendingGoBack) return;

  const targetDepth = stack.length;

  if (targetDepth > pushedDepth) {
    for (let depth = pushedDepth + 1; depth <= targetDepth; depth += 1) {
      const baseState =
        window.history.state && typeof window.history.state === 'object'
          ? { ...(window.history.state as Record<string, unknown>) }
          : {};
      window.history.pushState(
        { ...baseState, __dsOverlayDepth: depth },
        '',
        window.location.href
      );
    }
    pushedDepth = targetDepth;
    lastOverlayHref = window.location.href;
    return;
  }

  if (targetDepth < pushedDepth) {
    if (lastOverlayHref !== null && window.location.href !== lastOverlayHref) {
      pushedDepth = targetDepth;
      lastOverlayHref = targetDepth > 0 ? window.location.href : null;
      return;
    }

    const delta = pushedDepth - targetDepth;
    pendingGoBack = true;
    clearPendingBackTimer();
    pendingBackTimer = setTimeout(() => {
      pendingBackTimer = null;
      if (pendingGoBack) {
        pendingGoBack = false;
        pushedDepth = targetDepth;
        lastOverlayHref = targetDepth > 0 ? window.location.href : null;
        reconcileNow();
      }
    }, 180);

    window.history.go(-delta);
  }
}

function scheduleReconcile(): void {
  if (typeof window === 'undefined' || reconcileTimer !== null) return;
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    reconcileNow();
  }, 0);
}

/**
 * Registers an open overlay/bottom-sheet/menu so the hardware/browser Back button
 * closes only the topmost active overlay before navigating back in app history.
 */
export function registerOverlayHistory(onClose: () => void): number {
  ensureInitialized();
  const id = nextEntryId++;
  stack.push({ id, onClose });
  scheduleReconcile();
  return id;
}

/**
 * Unregisters an overlay when closed programmatically (button, backdrop, Escape, swipe).
 */
export function unregisterOverlayHistory(id: number): void {
  const index = stack.findIndex((entry) => entry.id === id);
  if (index === -1) return;
  stack.splice(index, 1);
  scheduleReconcile();
}

/**
 * Coordinates SPA tab navigation with active overlay history entries so switching routes
 * from a drawer/menu replaces the overlay history slot cleanly without stale Back steps.
 */
export function pushAppRouteHistory(state: Record<string, unknown>, targetPath: string): void {
  if (typeof window === 'undefined' || typeof window.history === 'undefined') return;
  ensureInitialized();

  if (reconcileTimer !== null) {
    clearTimeout(reconcileTimer);
    reconcileTimer = null;
  }
  clearPendingBackTimer();
  pendingGoBack = false;
  stack.length = 0;

  if (pushedDepth === 1) {
    pushedDepth = 0;
    lastOverlayHref = null;
    window.history.replaceState(state, '', targetPath);
    return;
  }

  pushedDepth = 0;
  lastOverlayHref = null;
  window.history.pushState(state, '', targetPath);
}

export function getOverlayHistorySnapshot(): { stackLength: number; pushedDepth: number } {
  return { stackLength: stack.length, pushedDepth };
}

export function resetOverlayHistoryForTests(): void {
  if (reconcileTimer !== null) {
    clearTimeout(reconcileTimer);
    reconcileTimer = null;
  }
  clearPendingBackTimer();
  if (initialized && typeof window !== 'undefined') {
    window.removeEventListener('popstate', handlePopState);
  }
  stack.length = 0;
  nextEntryId = 1;
  pushedDepth = 0;
  lastOverlayHref = null;
  pendingGoBack = false;
  initialized = false;
}
