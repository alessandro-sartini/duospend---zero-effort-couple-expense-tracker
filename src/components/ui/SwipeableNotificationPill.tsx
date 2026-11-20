import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { shouldDismissSwipeRight } from '../layout/backgroundNotifications';

interface SwipeableNotificationPillProps {
  onClick: () => void;
  onDismiss: () => void;
  className: string;
  dismissLabel: string;
  children: React.ReactNode;
}

const EXIT_DURATION_MS = 220;

export const SwipeableNotificationPill: React.FC<SwipeableNotificationPillProps> = ({
  onClick,
  onDismiss,
  className,
  dismissLabel,
  children,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerStateRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    lastX: number;
    lastTime: number;
    velocityX: number;
    axis: 'pending' | 'horizontal' | 'aborted';
    didDrag: boolean;
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastTime: 0,
    velocityX: 0,
    axis: 'pending',
    didDrag: false,
  });
  const suppressClickRef = useRef(false);
  const dismissTimerRef = useRef<number | null>(null);
  const isDismissingRef = useRef(false);

  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

  const triggerDismiss = useCallback(() => {
    if (isDismissingRef.current) return;
    isDismissingRef.current = true;
    const width = containerRef.current?.getBoundingClientRect().width || 280;
    const exitDistance = Math.max(width + 48, 320);

    setIsDragging(false);
    setIsExiting(true);
    setOffsetX(exitDistance);

    dismissTimerRef.current = window.setTimeout(() => {
      dismissTimerRef.current = null;
      onDismiss();
    }, EXIT_DURATION_MS);
  }, [onDismiss]);

  const resetPointer = useCallback((el: HTMLDivElement, pointerId: number) => {
    try {
      if (el.hasPointerCapture(pointerId)) {
        el.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore release errors when pointer already left
    }
    pointerStateRef.current.pointerId = null;
    pointerStateRef.current.axis = 'pending';
    setIsDragging(false);
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isDismissingRef.current) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-dismiss-button="true"]')) {
      return;
    }

    const now = performance.now();
    pointerStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastTime: now,
      velocityX: 0,
      axis: 'pending',
      didDrag: false,
    };
    suppressClickRef.current = false;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = pointerStateRef.current;
    if (isDismissingRef.current || state.pointerId !== event.pointerId || state.axis === 'aborted') {
      return;
    }

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;

    if (state.axis === 'pending') {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        state.axis = 'aborted';
        return;
      }
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        state.axis = 'horizontal';
        state.didDrag = true;
        setIsDragging(true);
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Ignore capture errors in synthetic test environments
        }
      } else {
        return;
      }
    }

    const now = performance.now();
    const dt = now - state.lastTime;
    if (dt > 0) {
      const instantVelocity = (event.clientX - state.lastX) / dt;
      state.velocityX = state.velocityX * 0.35 + instantVelocity * 0.65;
      state.lastX = event.clientX;
      state.lastTime = now;
    }

    const visualOffset = dx >= 0 ? dx : dx * 0.2;
    setOffsetX(visualOffset);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = pointerStateRef.current;
    if (state.pointerId !== event.pointerId) return;

    const wasHorizontal = state.axis === 'horizontal';
    const velocityX = state.velocityX;
    const currentOffset = offsetX;

    if (state.didDrag) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 80);
    }

    resetPointer(event.currentTarget, event.pointerId);

    if (isDismissingRef.current || !wasHorizontal) {
      return;
    }

    const width = containerRef.current?.getBoundingClientRect().width || 280;
    if (shouldDismissSwipeRight({ offsetX: currentOffset, velocityX, width })) {
      triggerDismiss();
    } else {
      setOffsetX(0);
    }
  };

  const handleBodyClick = () => {
    if (suppressClickRef.current || isDismissingRef.current) {
      return;
    }
    onClick();
  };

  const widthForOpacity = containerRef.current?.getBoundingClientRect().width || 280;
  const computedOpacity = isExiting
    ? 0
    : offsetX > 0
      ? Math.max(0.25, 1 - offsetX / (widthForOpacity * 1.15))
      : 1;

  return (
    <div
      ref={containerRef}
      role="status"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      style={{
        transform: `translate3d(${offsetX}px, 0, 0)`,
        opacity: computedOpacity,
        transition: isDragging
          ? 'none'
          : isExiting
            ? `transform ${EXIT_DURATION_MS}ms ease-out, opacity ${EXIT_DURATION_MS}ms ease-out`
            : 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease-out',
      }}
      className={`pointer-events-auto touch-pan-y select-none max-w-full sm:max-w-md flex items-center rounded-full border text-xs font-semibold shadow-lg ${className}`}
    >
      <button
        type="button"
        onClick={handleBodyClick}
        className="flex-1 min-w-0 flex items-center gap-2 text-left py-2 pl-3.5 pr-1 cursor-pointer"
      >
        {children}
      </button>
      <button
        type="button"
        data-dismiss-button="true"
        onClick={(event) => {
          event.stopPropagation();
          triggerDismiss();
        }}
        aria-label={dismissLabel}
        title={dismissLabel}
        className="h-7 w-7 mr-1.5 rounded-full flex items-center justify-center shrink-0 text-current opacity-75 hover:opacity-100 hover:bg-current/10 transition-colors cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
