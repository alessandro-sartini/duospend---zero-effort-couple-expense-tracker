import React, { useEffect, useRef, useState } from 'react';
import { X, type LucideIcon } from 'lucide-react';
import { useScrollLock } from '../../hooks/useScrollLock';

interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  iconClassName?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | '2xl';
  closeLabel?: string;
  headerExtra?: React.ReactNode;
  footer?: React.ReactNode;
  mobileBottomSheet?: boolean;
  closeOnBackdrop?: boolean;
  children: React.ReactNode;
}

const MAX_WIDTH_MAP = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  '2xl': 'max-w-2xl',
};

export const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon: Icon,
  iconClassName = 'bg-orange-500/12 text-orange-600 border-orange-500/25',
  maxWidth = 'lg',
  closeLabel = 'Chiudi finestra',
  headerExtra,
  footer,
  mobileBottomSheet = false,
  closeOnBackdrop = false,
  children,
}) => {
  useScrollLock(isOpen);

  const [isExpanded, setIsExpanded] = useState(false);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    y: number;
    time: number;
    pointerId: number;
    fromHandle: boolean;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setIsExpanded(false);
      setDragOffsetY(0);
      setIsDragging(false);
      dragStartRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSheetPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    fromHandle: boolean
  ) => {
    if (!mobileBottomSheet) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!fromHandle && event.target instanceof Element && event.target.closest('button, a, input, select, textarea')) {
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragStartRef.current = {
      y: event.clientY,
      time: Date.now(),
      pointerId: event.pointerId,
      fromHandle,
    };
    setIsDragging(true);
  };

  const handleSheetPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current || dragStartRef.current.pointerId !== event.pointerId) return;
    const deltaY = event.clientY - dragStartRef.current.y;
    if (deltaY >= 0) {
      setDragOffsetY(deltaY);
    } else {
      setDragOffsetY(Math.max(-32, deltaY * 0.35));
    }
  };

  const handleSheetPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current || dragStartRef.current.pointerId !== event.pointerId) return;
    const { y, time, fromHandle } = dragStartRef.current;
    dragStartRef.current = null;
    setIsDragging(false);

    const deltaY = event.clientY - y;
    const dt = Math.max(1, Date.now() - time);
    const velocityY = deltaY / dt;

    if (Math.abs(deltaY) < 6 && fromHandle) {
      setIsExpanded((prev) => !prev);
      setDragOffsetY(0);
      return;
    }

    if (deltaY < -35 || velocityY < -0.4) {
      setIsExpanded(true);
      setDragOffsetY(0);
      return;
    }

    if (deltaY > 0) {
      if (isExpanded && deltaY >= 45 && deltaY < 160 && velocityY < 0.85) {
        setIsExpanded(false);
        setDragOffsetY(0);
        return;
      }
      if (deltaY >= (isExpanded ? 160 : 75) || velocityY > 0.65) {
        setDragOffsetY(0);
        setIsExpanded(false);
        onClose();
        return;
      }
    }

    setDragOffsetY(0);
  };

  const mobileHeightClass = isExpanded
    ? 'rounded-t-3xl rounded-b-none sm:rounded-2xl h-[94dvh] max-h-[94dvh] sm:h-auto sm:max-h-[calc(100dvh-2rem)]'
    : 'rounded-t-3xl rounded-b-none sm:rounded-2xl max-h-[78dvh] sm:max-h-[calc(100dvh-2rem)]';

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center overflow-hidden overscroll-contain bg-black/55 backdrop-blur-xs ${
        mobileBottomSheet ? 'items-end sm:items-center p-0 sm:p-4' : 'items-center p-3 sm:p-4'
      }`}
      role="dialog"
      aria-modal="true"
      onClick={
        closeOnBackdrop
          ? (event) => {
              if (event.target === event.currentTarget) {
                onClose();
              }
            }
          : undefined
      }
    >
      <div
        className={`ds-card shadow-2xl ${MAX_WIDTH_MAP[maxWidth]} w-full overflow-hidden flex flex-col transition-[max-height,height] duration-200 ease-out ${
          mobileBottomSheet
            ? mobileHeightClass
            : 'max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)]'
        }`}
        style={
          mobileBottomSheet
            ? {
                transform:
                  dragOffsetY !== 0
                    ? `translateY(${Math.max(-24, dragOffsetY)}px)`
                    : 'translateY(0px)',
                transition: isDragging
                  ? 'none'
                  : 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), max-height 200ms ease-out, height 200ms ease-out',
              }
            : undefined
        }
      >
        {mobileBottomSheet && (
          <div
            role="button"
            tabIndex={0}
            aria-label={
              isExpanded
                ? 'Riduci pannello o trascina giù per chiudere'
                : 'Espandi pannello o trascina giù per chiudere'
            }
            onPointerDown={(e) => handleSheetPointerDown(e, true)}
            onPointerMove={handleSheetPointerMove}
            onPointerUp={handleSheetPointerEnd}
            onPointerCancel={handleSheetPointerEnd}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsExpanded((prev) => !prev);
              }
            }}
            className="pt-3 pb-1.5 flex justify-center bg-stone-50/60 shrink-0 sm:hidden touch-none select-none cursor-grab active:cursor-grabbing"
          >
            <span className="h-1 w-10 rounded-full bg-stone-300/80" aria-hidden="true" />
          </div>
        )}
        <div
          onPointerDown={mobileBottomSheet ? (e) => handleSheetPointerDown(e, false) : undefined}
          onPointerMove={mobileBottomSheet ? handleSheetPointerMove : undefined}
          onPointerUp={mobileBottomSheet ? handleSheetPointerEnd : undefined}
          onPointerCancel={mobileBottomSheet ? handleSheetPointerEnd : undefined}
          className={`flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-stone-100 bg-stone-50/60 shrink-0 ${
            mobileBottomSheet ? 'touch-none sm:touch-auto' : ''
          }`}
        >
          <div className="flex min-w-0 items-center gap-3">
            {Icon && (
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${iconClassName}`}
              >
                <Icon className="h-4.5 w-4.5" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-base font-bold text-stone-900 font-display truncate">
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs text-stone-500 mt-0.5 truncate">{subtitle}</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerExtra}
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 min-w-10 rounded-xl hover:bg-stone-200/60 text-stone-500 hover:text-stone-900 transition-colors inline-flex items-center justify-center cursor-pointer"
              aria-label={closeLabel}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>

        {footer && (
          <div
            className={`px-4 sm:px-6 pt-3.5 border-t border-stone-100 bg-stone-50/60 shrink-0 ${
              mobileBottomSheet
                ? 'pb-[calc(0.875rem+env(safe-area-inset-bottom,0px))] sm:pb-3.5'
                : 'pb-3.5'
            }`}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
