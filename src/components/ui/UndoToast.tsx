import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { shouldDismissSwipeRight } from '../layout/backgroundNotifications';

export interface UndoToastNotice {
  id: string;
  message: string;
  actionLabel?: string;
  onUndo: () => void;
}

interface UndoToastProps {
  notice: UndoToastNotice | null;
  onDismiss: () => void;
  durationMs?: number;
}

const EXIT_DURATION_MS = 200;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export const UndoToast: React.FC<UndoToastProps> = ({
  notice,
  onDismiss,
  durationMs = 8000,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const offsetXRef = useRef(0);
  const exitTimerRef = useRef<number | null>(null);
  const isDismissingRef = useRef(false);
  const pointerStateRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    lastX: number;
    lastTime: number;
    velocityX: number;
    axis: 'pending' | 'horizontal' | 'aborted';
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastTime: 0,
    velocityX: 0,
    axis: 'pending',
  });

  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const clearExitTimer = useCallback(() => {
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearExitTimer();
    isDismissingRef.current = false;
    offsetXRef.current = 0;
    setOffsetX(0);
    setIsDragging(false);
    setIsExiting(false);
    pointerStateRef.current.pointerId = null;
    pointerStateRef.current.axis = 'pending';
  }, [notice?.id, clearExitTimer]);

  useEffect(() => {
    if (!notice || durationMs <= 0) return;
    const timer = window.setTimeout(() => {
      onDismiss();
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [notice, durationMs, onDismiss]);

  useEffect(() => clearExitTimer, [clearExitTimer]);

  const triggerDismiss = useCallback(() => {
    if (isDismissingRef.current) return;
    isDismissingRef.current = true;
    if (prefersReducedMotion()) {
      onDismiss();
      return;
    }
    const width = containerRef.current?.getBoundingClientRect().width || 280;
    const exitDistance = Math.max(width + 40, 300);
    setIsDragging(false);
    setIsExiting(true);
    offsetXRef.current = exitDistance;
    setOffsetX(exitDistance);
    clearExitTimer();
    exitTimerRef.current = window.setTimeout(() => {
      exitTimerRef.current = null;
      onDismiss();
    }, EXIT_DURATION_MS);
  }, [clearExitTimer, onDismiss]);

  if (!notice) return null;

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isDismissingRef.current) return;
    if (event.pointerType === 'mouse') return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('button, a')) return;

    const now = performance.now();
    pointerStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastTime: now,
      velocityX: 0,
      axis: 'pending',
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = pointerStateRef.current;
    if (isDismissingRef.current || state.pointerId !== event.pointerId || state.axis === 'aborted') {
      return;
    }
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (state.axis === 'pending') {
      if (Math.abs(dy) >= 10 && Math.abs(dy) >= Math.abs(dx)) {
        state.axis = 'aborted';
        return;
      }
      if (Math.abs(dx) >= 10 && Math.abs(dx) > Math.abs(dy)) {
        state.axis = 'horizontal';
        setIsDragging(true);
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Ignore capture failure in test environments
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
    offsetXRef.current = visualOffset;
    setOffsetX(visualOffset);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = pointerStateRef.current;
    if (state.pointerId !== event.pointerId) return;
    const wasHorizontal = state.axis === 'horizontal';
    const currentOffset = offsetXRef.current;
    const velocityX = state.velocityX;

    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore capture errors
    }
    state.pointerId = null;
    state.axis = 'pending';
    setIsDragging(false);

    if (isDismissingRef.current || !wasHorizontal) return;

    const width = containerRef.current?.getBoundingClientRect().width || 280;
    if (shouldDismissSwipeRight({ offsetX: currentOffset, velocityX, width })) {
      triggerDismiss();
    } else {
      offsetXRef.current = 0;
      setOffsetX(0);
    }
  };

  const widthForOpacity = containerRef.current?.getBoundingClientRect().width || 280;
  const computedOpacity = isExiting
    ? 0
    : offsetX > 0
      ? Math.max(0.25, 1 - offsetX / (widthForOpacity * 1.15))
      : 1;
  const reducedMotion = prefersReducedMotion();

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] left-3 right-20 lg:bottom-6 lg:left-6 lg:right-auto lg:max-w-md z-[44] pointer-events-none"
    >
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        style={{
          transform: offsetX !== 0 ? `translate3d(${offsetX}px, 0, 0)` : undefined,
          opacity: computedOpacity,
          transition:
            isDragging || reducedMotion
              ? 'none'
              : isExiting
                ? `transform ${EXIT_DURATION_MS}ms ease-out, opacity ${EXIT_DURATION_MS}ms ease-out`
                : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease-out',
        }}
        className="pointer-events-auto ds-card touch-pan-y flex items-center justify-between gap-2 px-3.5 py-2.5 shadow-xl border-stone-300/90"
      >
        <span className="min-w-0 flex-1 text-xs font-medium text-stone-900 break-words">
          {notice.message}
        </span>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              notice.onUndo();
              onDismiss();
            }}
            className="min-h-10 px-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{notice.actionLabel || 'Ripristina'}</span>
          </button>
          <button
            type="button"
            onClick={triggerDismiss}
            aria-label="Chiudi avviso di ripristino"
            className="min-h-10 min-w-10 rounded-xl text-stone-500 hover:text-stone-900 hover:bg-stone-100 inline-flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
