export interface GmailBackgroundStatus {
  isSyncing: boolean;
  detectedCount: number;
  reviewCount: number;
  scanProgress: { page: number } | null;
}

export interface ReceiptBackgroundStatus {
  isAnalyzing: boolean;
  hasDraft: boolean;
  fallbackUsed: boolean;
}

export interface DismissedBackgroundNotifications {
  gmail?: string;
  receipt?: string;
}

const DISMISSED_BG_NOTIFICATIONS_KEY = 'duospend_dismissed_bg_notifications_v1';

export function getGmailNotificationSignature(state: GmailBackgroundStatus): string | null {
  if (state.isSyncing) {
    return 'syncing';
  }
  if (state.detectedCount > 0 || state.reviewCount > 0) {
    return `ready:${state.detectedCount}:${state.reviewCount}`;
  }
  return null;
}

export function getReceiptNotificationSignature(state: ReceiptBackgroundStatus): string | null {
  if (state.isAnalyzing) {
    return 'analyzing';
  }
  if (state.hasDraft) {
    return `ready:${state.fallbackUsed ? 'fallback' : 'ok'}`;
  }
  return null;
}

export function shouldDismissSwipeRight({
  offsetX,
  velocityX,
  width,
}: {
  offsetX: number;
  velocityX: number;
  width: number;
}): boolean {
  const safeWidth = width > 0 ? width : 280;
  const distanceThreshold = Math.min(110, Math.max(72, safeWidth * 0.35));
  if (offsetX >= distanceThreshold) {
    return true;
  }
  return offsetX >= 28 && velocityX >= 0.45;
}

export function loadDismissedBackgroundNotifications(): DismissedBackgroundNotifications {
  if (typeof sessionStorage === 'undefined') {
    return {};
  }
  try {
    const raw = sessionStorage.getItem(DISMISSED_BG_NOTIFICATIONS_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const result: DismissedBackgroundNotifications = {};
    if (typeof parsed.gmail === 'string' && parsed.gmail.trim()) {
      result.gmail = parsed.gmail;
    }
    if (typeof parsed.receipt === 'string' && parsed.receipt.trim()) {
      result.receipt = parsed.receipt;
    }
    return result;
  } catch {
    return {};
  }
}

export function saveDismissedBackgroundNotifications(
  value: DismissedBackgroundNotifications
): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  try {
    const clean: DismissedBackgroundNotifications = {};
    if (value.gmail) {
      clean.gmail = value.gmail;
    }
    if (value.receipt) {
      clean.receipt = value.receipt;
    }
    if (!clean.gmail && !clean.receipt) {
      sessionStorage.removeItem(DISMISSED_BG_NOTIFICATIONS_KEY);
      return;
    }
    sessionStorage.setItem(DISMISSED_BG_NOTIFICATIONS_KEY, JSON.stringify(clean));
  } catch {
    // Ignore sessionStorage errors
  }
}
