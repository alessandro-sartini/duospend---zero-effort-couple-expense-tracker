import { useEffect } from 'react';

let activeScrollLockCount = 0;
let previousHtmlOverflow = '';
let previousBodyOverflow = '';
let previousBodyOverscroll = '';

/**
 * Reference-counted scroll lock for modals and dialogs so nested overlays
 * never unlock background scrolling prematurely on mobile or desktop.
 */
export const useScrollLock = (isLocked: boolean): void => {
  useEffect(() => {
    if (!isLocked || typeof document === 'undefined') return;

    if (activeScrollLockCount === 0) {
      previousHtmlOverflow = document.documentElement.style.overflow;
      previousBodyOverflow = document.body.style.overflow;
      previousBodyOverscroll = document.body.style.overscrollBehavior;

      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';
    }
    activeScrollLockCount += 1;

    return () => {
      activeScrollLockCount = Math.max(0, activeScrollLockCount - 1);
      if (activeScrollLockCount === 0) {
        document.documentElement.style.overflow = previousHtmlOverflow;
        document.body.style.overflow = previousBodyOverflow;
        document.body.style.overscrollBehavior = previousBodyOverscroll;
      }
    };
  }, [isLocked]);
};
