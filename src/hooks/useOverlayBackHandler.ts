import { useEffect, useRef } from 'react';
import {
  registerOverlayHistory,
  unregisterOverlayHistory,
} from '../utils/overlayHistory';

/**
 * Binds an open modal, bottom sheet, dialog or popup menu to the browser/Android
 * hardware Back stack so pressing Back closes the overlay instead of leaving the view.
 */
export function useOverlayBackHandler(isActive: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isActive || typeof window === 'undefined') {
      return;
    }

    const entryId = registerOverlayHistory(() => {
      onCloseRef.current();
    });

    return () => {
      unregisterOverlayHistory(entryId);
    };
  }, [isActive]);
}
