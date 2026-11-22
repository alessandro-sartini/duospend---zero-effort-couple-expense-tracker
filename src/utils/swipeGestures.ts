export const SWIPE_AXIS_LOCK_PX = 8;
export const SWIPE_ACTION_TRAY_WIDTH = 88;
export const SWIPE_REVEAL_OPEN_THRESHOLD = 40;

export type SwipeAxis = 'pending' | 'horizontal' | 'vertical';
export type SwipeOpenSide = 'left' | 'right' | null;
export type SwipeTriggerDirection = 'left' | 'right' | 'none';

/**
 * Determines whether a drag gesture is vertical scrolling or horizontal row swipe.
 * Vertical scroll always wins ties so vertical page scrolling is never hijacked.
 */
export function determineSwipeAxis(
  dx: number,
  dy: number,
  threshold = SWIPE_AXIS_LOCK_PX
): SwipeAxis {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absY >= threshold && absY >= absX) {
    return 'vertical';
  }
  if (absX >= threshold && absX > absY) {
    return 'horizontal';
  }
  return 'pending';
}

/**
 * Distance threshold (px) required to arm and immediately trigger a full-swipe action.
 */
export function getFullSwipeThreshold(width: number): number {
  const safeWidth = width > 0 ? width : 360;
  return Math.min(220, Math.max(152, safeWidth * 0.48));
}

/**
 * Computes the horizontal translation during a hybrid Android swipe:
 * tracks 1:1 up to fullThreshold, applies rubber-band dampening past fullThreshold,
 * and resists movement in disabled directions.
 */
export function computeHybridSwipeOffset({
  baseOffset,
  rawDx,
  allowLeft,
  allowRight,
  width,
}: {
  baseOffset: number;
  rawDx: number;
  allowLeft: boolean;
  allowRight: boolean;
  width: number;
}): number {
  const safeWidth = width > 0 ? width : 360;
  const fullThreshold = getFullSwipeThreshold(safeWidth);
  const maxTravel = safeWidth * 0.82;
  const candidate = baseOffset + rawDx;

  if (candidate === 0) return 0;

  if (candidate > 0) {
    if (!allowRight) {
      return Math.min(18, candidate * 0.14);
    }
    const damped =
      candidate <= fullThreshold
        ? candidate
        : fullThreshold + (candidate - fullThreshold) * 0.35;
    return Math.min(maxTravel, damped);
  }

  if (!allowLeft) {
    return Math.max(-18, candidate * 0.14);
  }
  const damped =
    candidate >= -fullThreshold
      ? candidate
      : -fullThreshold + (candidate + fullThreshold) * 0.35;
  return Math.max(-maxTravel, damped);
}

/**
 * Resolves a released hybrid Android swipe:
 * - Long/fast swipe past full threshold triggers the action directly (snapping closed)
 * - Short swipe latches the side action tray open (`left` or `right`)
 * - Returning swipe or sub-threshold drag snaps back to closed (`null`)
 */
export function resolveHybridSwipeRelease({
  offsetX,
  baseOffset,
  velocityX,
  width,
  allowLeft,
  allowRight,
}: {
  offsetX: number;
  baseOffset: number;
  velocityX: number;
  width: number;
  allowLeft: boolean;
  allowRight: boolean;
}): { openSide: SwipeOpenSide; trigger: SwipeTriggerDirection } {
  const fullThreshold = getFullSwipeThreshold(width);

  if (allowLeft && (offsetX <= -fullThreshold || (offsetX <= -110 && velocityX <= -0.85))) {
    return { openSide: null, trigger: 'left' };
  }
  if (allowRight && (offsetX >= fullThreshold || (offsetX >= 110 && velocityX >= 0.85))) {
    return { openSide: null, trigger: 'right' };
  }

  if (baseOffset < 0 && (velocityX > 0.25 || offsetX > -SWIPE_REVEAL_OPEN_THRESHOLD)) {
    return { openSide: null, trigger: 'none' };
  }
  if (baseOffset > 0 && (velocityX < -0.25 || offsetX < SWIPE_REVEAL_OPEN_THRESHOLD)) {
    return { openSide: null, trigger: 'none' };
  }

  if (
    allowLeft &&
    (offsetX <= -SWIPE_REVEAL_OPEN_THRESHOLD || (offsetX <= -20 && velocityX <= -0.35))
  ) {
    return { openSide: 'left', trigger: 'none' };
  }
  if (
    allowRight &&
    (offsetX >= SWIPE_REVEAL_OPEN_THRESHOLD || (offsetX >= 20 && velocityX >= 0.35))
  ) {
    return { openSide: 'right', trigger: 'none' };
  }

  return { openSide: null, trigger: 'none' };
}

/**
 * Computes visual reveal and full-swipe armed ratios for feedback styling.
 */
export function computeHybridSwipeVisual(
  offsetX: number,
  width: number
): {
  direction: SwipeTriggerDirection;
  revealRatio: number;
  fullRatio: number;
  armed: boolean;
} {
  if (offsetX === 0) {
    return { direction: 'none', revealRatio: 0, fullRatio: 0, armed: false };
  }
  const fullThreshold = getFullSwipeThreshold(width);
  const absOffset = Math.abs(offsetX);
  return {
    direction: offsetX > 0 ? 'right' : 'left',
    revealRatio: Math.min(1, absOffset / SWIPE_ACTION_TRAY_WIDTH),
    fullRatio: Math.min(1, absOffset / fullThreshold),
    armed: absOffset >= fullThreshold,
  };
}
