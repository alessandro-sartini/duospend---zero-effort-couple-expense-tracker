import { useEffect, useRef, useState } from 'react';

function shouldReduceMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Smoothly interpolates numeric KPI values client-side when they update,
 * while always initializing synchronously at the target value for SSR and first paint.
 */
export function useAnimatedNumber(target: number, durationMs = 420): number {
  const safeTarget = Number.isFinite(target) ? target : 0;
  const [displayValue, setDisplayValue] = useState<number>(safeTarget);
  const currentRef = useRef<number>(safeTarget);

  useEffect(() => {
    const startValue = currentRef.current;
    if (
      Math.abs(safeTarget - startValue) < 0.005 ||
      durationMs <= 0 ||
      typeof window === 'undefined' ||
      typeof window.requestAnimationFrame !== 'function' ||
      shouldReduceMotion()
    ) {
      currentRef.current = safeTarget;
      setDisplayValue(safeTarget);
      return;
    }

    let rafId = 0;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = startValue + (safeTarget - startValue) * eased;
      currentRef.current = next;
      setDisplayValue(next);

      if (t < 1) {
        rafId = window.requestAnimationFrame(step);
      } else {
        currentRef.current = safeTarget;
        setDisplayValue(safeTarget);
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [safeTarget, durationMs]);

  return displayValue;
}
