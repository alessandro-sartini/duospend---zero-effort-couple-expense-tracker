import { useEffect } from 'react';

interface WakeLockSentinelLike {
  released?: boolean;
  release: () => Promise<void>;
}

/**
 * Keeps the smartphone screen awake during active Gmail/OCR background operations
 * and releases automatically when finished or when the page becomes hidden.
 */
export function useWakeLock(isActive: boolean): void {
  useEffect(() => {
    if (!isActive || typeof navigator === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const wakeLock = (
      navigator as Partial<{ wakeLock: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } }>
    ).wakeLock;
    if (!wakeLock || typeof wakeLock.request !== 'function') {
      return;
    }

    let cancelled = false;
    let sentinel: WakeLockSentinelLike | null = null;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        const lock = await wakeLock.request('screen');
        if (!lock) return;
        if (cancelled) {
          await lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
      } catch {
        // Ignore battery-saver or unsupported environment wake lock rejections
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !sentinel?.released) {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (sentinel && !sentinel.released) {
        void sentinel.release().catch(() => {});
      }
      sentinel = null;
    };
  }, [isActive]);
}
