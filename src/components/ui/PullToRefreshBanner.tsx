import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { triggerLightHaptic } from '../../utils/mobileFeedback';

interface PullToRefreshBannerProps {
  isRefreshing: boolean;
  disabled?: boolean;
  onRefresh: () => Promise<void> | void;
}

const PULL_ACTIVATE_PX = 14;
const PULL_THRESHOLD_PX = 52;
const PULL_MAX_PX = 78;

function hasScrolledAncestor(target: EventTarget | null): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.scrollTop > 0) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * In-app touch pull-to-refresh gesture for standalone Android PWA sessions where
 * Chrome disables native pull-to-refresh due to `overscroll-behavior-y: none`.
 */
export const PullToRefreshBanner: React.FC<PullToRefreshBannerProps> = ({
  isRefreshing,
  disabled = false,
  onRefresh,
}) => {
  const [pullDistance, setPullDistance] = useState(0);
  const pullDistanceRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const gestureRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    axis: 'pending' | 'vertical' | 'aborted';
    armed: boolean;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    axis: 'pending',
    armed: false,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const resetGesture = () => {
      gestureRef.current.active = false;
      gestureRef.current.axis = 'pending';
      gestureRef.current.armed = false;
      pullDistanceRef.current = 0;
      setPullDistance(0);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (disabled || isRefreshing || event.touches.length !== 1) return;
      if (window.scrollY > 0) return;

      const targetEl = event.target instanceof Element ? event.target : null;
      if (
        targetEl?.closest(
          '[role="dialog"], [role="alertdialog"], [data-no-swipe="true"], input, textarea, select'
        )
      ) {
        return;
      }
      if (hasScrolledAncestor(event.target)) {
        return;
      }

      const touch = event.touches[0];
      gestureRef.current = {
        active: true,
        startX: touch.clientX,
        startY: touch.clientY,
        axis: 'pending',
        armed: false,
      };
    };

    const handleTouchMove = (event: TouchEvent) => {
      const state = gestureRef.current;
      if (!state.active || state.axis === 'aborted' || event.touches.length !== 1) return;
      if (window.scrollY > 0) {
        resetGesture();
        return;
      }

      const touch = event.touches[0];
      const dx = touch.clientX - state.startX;
      const dy = touch.clientY - state.startY;

      if (state.axis === 'pending') {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          state.axis = 'aborted';
          return;
        }
        if (dy < 0) {
          state.axis = 'aborted';
          return;
        }
        if (dy >= PULL_ACTIVATE_PX && dy > Math.abs(dx) * 1.4) {
          state.axis = 'vertical';
        } else {
          return;
        }
      }

      const damped = Math.min(PULL_MAX_PX, Math.max(0, Math.round((dy - PULL_ACTIVATE_PX) * 0.42)));
      if (!state.armed && damped >= PULL_THRESHOLD_PX) {
        state.armed = true;
        triggerLightHaptic(10);
      } else if (state.armed && damped < PULL_THRESHOLD_PX) {
        state.armed = false;
      }
      pullDistanceRef.current = damped;
      setPullDistance(damped);
    };

    const handleTouchEnd = () => {
      const state = gestureRef.current;
      if (!state.active) return;
      const shouldRefresh =
        state.axis === 'vertical' && pullDistanceRef.current >= PULL_THRESHOLD_PX && !isRefreshing;
      resetGesture();
      if (shouldRefresh) {
        void onRefreshRef.current();
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', resetGesture, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', resetGesture);
    };
  }, [disabled, isRefreshing]);

  const isVisible = pullDistance > 6 || isRefreshing;
  const isReady = pullDistance >= PULL_THRESHOLD_PX;
  const translateY = isRefreshing ? 8 : Math.min(28, Math.round(pullDistance * 0.36));

  if (!isVisible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(3.85rem+env(safe-area-inset-top,0px))] lg:top-[calc(4.35rem+env(safe-area-inset-top,0px))] z-25 flex justify-center px-4"
    >
      <div
        style={{ transform: `translate3d(0, ${translateY}px, 0)` }}
        className={`ds-card inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-semibold shadow-lg transition-colors ${
          isReady || isRefreshing
            ? 'border-orange-500/40 text-orange-600'
            : 'text-stone-600'
        }`}
      >
        <RefreshCw
          className={`h-3.5 w-3.5 shrink-0 ${
            isRefreshing ? 'animate-spin text-orange-600' : ''
          }`}
          style={
            !isRefreshing
              ? { transform: `rotate(${Math.min(180, pullDistance * 3)}deg)` }
              : undefined
          }
          aria-hidden="true"
        />
        <span>
          {isRefreshing
            ? 'Sincronizzazione...'
            : isReady
              ? 'Rilascia per aggiornare'
              : 'Scorri giù per aggiornare'}
        </span>
      </div>
    </div>
  );
};
