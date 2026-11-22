import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  computeHybridSwipeOffset,
  computeHybridSwipeVisual,
  determineSwipeAxis,
  resolveHybridSwipeRelease,
  SWIPE_ACTION_TRAY_WIDTH,
  type SwipeAxis,
  type SwipeOpenSide,
} from '../../utils/swipeGestures';

export interface SwipeRightActionConfig {
  label: string;
  armedLabel?: string;
  icon: React.ReactNode;
  tone: 'primary' | 'emerald' | 'amber';
  onTrigger: () => void;
}

export interface SwipeLeftActionConfig {
  label: string;
  armedLabel?: string;
  icon: React.ReactNode;
  tone: 'danger' | 'amber' | 'neutral';
  onTrigger: () => void;
}

interface SwipeableActionRowProps {
  leftAction?: SwipeRightActionConfig;
  rightAction?: SwipeLeftActionConfig;
  openSide?: SwipeOpenSide;
  onOpenSideChange?: (side: SwipeOpenSide) => void;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

const SOLID_TONE_CLASSES: Record<
  SwipeRightActionConfig['tone'] | SwipeLeftActionConfig['tone'],
  { normal: string; armed: string }
> = {
  primary: {
    normal: 'bg-orange-600 text-white hover:bg-orange-700',
    armed: 'bg-orange-500 text-white',
  },
  emerald: {
    normal: 'bg-emerald-600 text-white hover:bg-emerald-700',
    armed: 'bg-emerald-500 text-white',
  },
  amber: {
    normal: 'bg-amber-600 text-white hover:bg-amber-700',
    armed: 'bg-amber-500 text-white',
  },
  danger: {
    normal: 'bg-rose-600 text-white hover:bg-rose-700',
    armed: 'bg-rose-500 text-white',
  },
  neutral: {
    normal: 'bg-stone-700 text-white hover:bg-stone-800',
    armed: 'bg-stone-600 text-white',
  },
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function triggerHapticPulse(): void {
  if (prefersReducedMotion()) return;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(14);
    }
  } catch {
    // Ignore vibration errors in unsupported environments
  }
}

/**
 * Android-style hybrid swipeable list row (Revolut / Splitwise pattern):
 * - Short swipe latches open a solid side action button tray
 * - Long decisive swipe enters armed state (haptic + icon pop) and triggers on release
 * - Vertical scroll always wins axis-lock ties; pointercancel cleanly snaps back
 */
export const SwipeableActionRow: React.FC<SwipeableActionRowProps> = ({
  leftAction,
  rightAction,
  openSide: controlledOpenSide,
  onOpenSideChange,
  disabled = false,
  className = '',
  contentClassName = '',
  children,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragOffsetXRef = useRef(0);
  const suppressClickTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const pointerStateRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    lastX: number;
    lastTime: number;
    velocityX: number;
    baseOffset: number;
    axis: SwipeAxis;
    didDrag: boolean;
    wasArmed: boolean;
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastTime: 0,
    velocityX: 0,
    baseOffset: 0,
    axis: 'pending',
    didDrag: false,
    wasArmed: false,
  });

  const [internalOpenSide, setInternalOpenSide] = useState<SwipeOpenSide>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const effectiveOpenSide =
    controlledOpenSide !== undefined ? controlledOpenSide : internalOpenSide;

  const setOpenSide = useCallback(
    (next: SwipeOpenSide) => {
      if (controlledOpenSide === undefined) {
        setInternalOpenSide(next);
      }
      onOpenSideChange?.(next);
    },
    [controlledOpenSide, onOpenSideChange]
  );

  const allowRight = Boolean(leftAction);
  const allowLeft = Boolean(rightAction);
  const canSwipe = !disabled && (allowLeft || allowRight);

  const restingOffset =
    effectiveOpenSide === 'right'
      ? SWIPE_ACTION_TRAY_WIDTH
      : effectiveOpenSide === 'left'
        ? -SWIPE_ACTION_TRAY_WIDTH
        : 0;
  const displayOffset = isDragging ? dragOffsetX : restingOffset;

  useEffect(() => {
    return () => {
      if (suppressClickTimerRef.current !== null) {
        window.clearTimeout(suppressClickTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (disabled) {
      dragOffsetXRef.current = 0;
      setDragOffsetX(0);
      setIsDragging(false);
      pointerStateRef.current.pointerId = null;
      pointerStateRef.current.axis = 'pending';
      if (effectiveOpenSide !== null) {
        setOpenSide(null);
      }
    }
  }, [disabled, effectiveOpenSide, setOpenSide]);

  useEffect(() => {
    if (!effectiveOpenSide) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenSide(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [effectiveOpenSide, setOpenSide]);

  const releasePointer = useCallback((el: HTMLDivElement, pointerId: number) => {
    try {
      if (el.hasPointerCapture(pointerId)) {
        el.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore capture errors when pointer already left
    }
    pointerStateRef.current.pointerId = null;
    pointerStateRef.current.axis = 'pending';
    setIsDragging(false);
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canSwipe) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const target = event.target instanceof Element ? event.target : null;
    if (
      target?.closest(
        'button, a, input, textarea, select, [contenteditable="true"], [data-no-swipe="true"]'
      )
    ) {
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
      baseOffset: restingOffset,
      axis: 'pending',
      didDrag: false,
      wasArmed: false,
    };
    suppressClickRef.current = false;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = pointerStateRef.current;
    if (!canSwipe || state.pointerId !== event.pointerId || state.axis === 'vertical') {
      return;
    }

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;

    if (state.axis === 'pending') {
      const nextAxis = determineSwipeAxis(dx, dy);
      if (nextAxis === 'vertical') {
        state.axis = 'vertical';
        if (effectiveOpenSide !== null) {
          setOpenSide(null);
        }
        return;
      }
      if (nextAxis === 'horizontal') {
        state.axis = 'horizontal';
        state.didDrag = true;
        try {
          window.getSelection?.()?.removeAllRanges();
        } catch {
          // Ignore selection clearing errors
        }
        setIsDragging(true);
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Ignore capture failures in synthetic environments
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

    const width = containerRef.current?.getBoundingClientRect().width || 360;
    const nextOffset = computeHybridSwipeOffset({
      baseOffset: state.baseOffset,
      rawDx: dx,
      allowLeft,
      allowRight,
      width,
    });
    const visual = computeHybridSwipeVisual(nextOffset, width);
    if (!state.wasArmed && visual.armed) {
      triggerHapticPulse();
    }
    state.wasArmed = visual.armed;

    dragOffsetXRef.current = nextOffset;
    setDragOffsetX(nextOffset);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = pointerStateRef.current;
    if (state.pointerId !== event.pointerId) return;

    const wasHorizontal = state.axis === 'horizontal';
    const currentOffset = dragOffsetXRef.current;
    const baseOffset = state.baseOffset;
    const velocityX = state.velocityX;

    if (state.didDrag) {
      suppressClickRef.current = true;
      if (suppressClickTimerRef.current !== null) {
        window.clearTimeout(suppressClickTimerRef.current);
      }
      suppressClickTimerRef.current = window.setTimeout(() => {
        suppressClickRef.current = false;
        suppressClickTimerRef.current = null;
      }, 120);
    }

    releasePointer(event.currentTarget, event.pointerId);
    dragOffsetXRef.current = 0;
    setDragOffsetX(0);

    if (!wasHorizontal || !canSwipe) {
      return;
    }

    const width = containerRef.current?.getBoundingClientRect().width || 360;
    const outcome = resolveHybridSwipeRelease({
      offsetX: currentOffset,
      baseOffset,
      velocityX,
      width,
      allowLeft,
      allowRight,
    });

    if (outcome.trigger === 'right' && leftAction) {
      setOpenSide(null);
      leftAction.onTrigger();
      return;
    }

    if (outcome.trigger === 'left' && rightAction) {
      setOpenSide(null);
      rightAction.onTrigger();
      return;
    }

    setOpenSide(outcome.openSide);
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = pointerStateRef.current;
    if (state.pointerId !== event.pointerId) return;

    releasePointer(event.currentTarget, event.pointerId);
    dragOffsetXRef.current = 0;
    setDragOffsetX(0);
    setOpenSide(null);
  };

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (effectiveOpenSide !== null) {
      event.preventDefault();
      event.stopPropagation();
      setOpenSide(null);
    }
  };

  const rowWidth = containerRef.current?.getBoundingClientRect().width || 360;
  const visual = computeHybridSwipeVisual(displayOffset, rowWidth);
  const reducedMotion = prefersReducedMotion();
  const showTrays = displayOffset !== 0 || effectiveOpenSide !== null;
  const isLeftTrayLatched = effectiveOpenSide === 'right' && !isDragging;
  const isRightTrayLatched = effectiveOpenSide === 'left' && !isDragging;

  const leftTone = leftAction
    ? visual.direction === 'right' && visual.armed
      ? SOLID_TONE_CLASSES[leftAction.tone].armed
      : SOLID_TONE_CLASSES[leftAction.tone].normal
    : '';
  const rightTone = rightAction
    ? visual.direction === 'left' && visual.armed
      ? SOLID_TONE_CLASSES[rightAction.tone].armed
      : SOLID_TONE_CLASSES[rightAction.tone].normal
    : '';

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      {showTrays && (
        <div className="absolute inset-0 flex items-stretch justify-between">
          {leftAction && displayOffset > 0 ? (
            <div
              className={`flex items-stretch justify-start transition-colors ${leftTone}`}
              style={{
                width:
                  visual.armed && isDragging
                    ? `${Math.max(SWIPE_ACTION_TRAY_WIDTH, Math.round(displayOffset))}px`
                    : `${Math.max(SWIPE_ACTION_TRAY_WIDTH, Math.ceil(displayOffset))}px`,
              }}
            >
              <button
                type="button"
                tabIndex={isLeftTrayLatched ? 0 : -1}
                aria-hidden={!isLeftTrayLatched}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpenSide(null);
                  leftAction.onTrigger();
                }}
                className={`flex h-full flex-col items-center justify-center gap-1 px-3 text-[11px] font-bold tracking-tight transition-transform cursor-pointer ${
                  visual.armed ? 'flex-1 items-start pl-5' : 'w-[88px] shrink-0'
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center transition-transform duration-150 ${
                    visual.armed ? 'scale-125' : ''
                  }`}
                >
                  {leftAction.icon}
                </span>
                <span className="truncate">
                  {visual.armed && leftAction.armedLabel ? leftAction.armedLabel : leftAction.label}
                </span>
              </button>
            </div>
          ) : (
            <div aria-hidden="true" />
          )}

          {rightAction && displayOffset < 0 ? (
            <div
              className={`ml-auto flex items-stretch justify-end transition-colors ${rightTone}`}
              style={{
                width: `${Math.max(SWIPE_ACTION_TRAY_WIDTH, Math.ceil(Math.abs(displayOffset)))}px`,
              }}
            >
              <button
                type="button"
                tabIndex={isRightTrayLatched ? 0 : -1}
                aria-hidden={!isRightTrayLatched}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpenSide(null);
                  rightAction.onTrigger();
                }}
                className={`flex h-full flex-col items-center justify-center gap-1 px-3 text-[11px] font-bold tracking-tight transition-transform cursor-pointer ${
                  visual.armed ? 'flex-1 items-end pr-5' : 'w-[88px] shrink-0'
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center transition-transform duration-150 ${
                    visual.armed ? 'scale-125' : ''
                  }`}
                >
                  {rightAction.icon}
                </span>
                <span className="truncate">
                  {visual.armed && rightAction.armedLabel
                    ? rightAction.armedLabel
                    : rightAction.label}
                </span>
              </button>
            </div>
          ) : (
            <div aria-hidden="true" />
          )}
        </div>
      )}

      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClickCapture={handleClickCapture}
        style={{
          transform: displayOffset !== 0 ? `translate3d(${displayOffset}px, 0, 0)` : undefined,
          transition:
            isDragging || reducedMotion
              ? 'none'
              : 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        className={`relative z-[1] touch-pan-y bg-[var(--theme-surface)] ${
          isDragging ? 'select-none' : ''
        } ${displayOffset !== 0 ? 'shadow-md' : ''}`}
      >
        <div className={contentClassName}>{children}</div>
      </div>
    </div>
  );
};
