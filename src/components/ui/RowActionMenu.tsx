import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

export interface RowActionMenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  tone?: 'default' | 'danger';
  onSelect: () => void;
}

interface RowActionMenuProps {
  label: string;
  items: RowActionMenuItem[];
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

interface MenuCoords {
  top?: number;
  bottom?: number;
  right: number;
}

/**
 * Compact Android-style `⋮` action menu rendered via portal so popup items are
 * never clipped by overflow-hidden swipe rows or card containers.
 */
export const RowActionMenu: React.FC<RowActionMenuProps> = ({
  label,
  items,
  onOpenChange,
  className = '',
}) => {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords>({ top: 0, right: 12 });

  const setOpenState = useCallback(
    (next: boolean) => {
      setIsOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange]
  );

  const computePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === 'undefined') return;
    const rect = trigger.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - rect.right);
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 190 && rect.top > 190) {
      setCoords({
        bottom: Math.max(8, window.innerHeight - rect.top + 6),
        right,
      });
    } else {
      setCoords({
        top: Math.max(8, rect.bottom + 6),
        right,
      });
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    computePosition();

    const focusTimer = window.setTimeout(() => {
      const firstItem = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
      firstItem?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpenState(false);
        triggerRef.current?.focus();
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const menuEl = menuRef.current;
        if (!menuEl) return;
        const buttons = Array.from(
          menuEl.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
        );
        if (buttons.length === 0) return;
        event.preventDefault();
        const activeIdx = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const nextIdx =
          activeIdx < 0
            ? 0
            : (activeIdx + delta + buttons.length) % buttons.length;
        buttons[nextIdx]?.focus();
      }
    };

    const handleCloseOnViewportChange = () => {
      setOpenState(false);
    };

    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('scroll', handleCloseOnViewportChange, true);
    window.addEventListener('resize', handleCloseOnViewportChange);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('scroll', handleCloseOnViewportChange, true);
      window.removeEventListener('resize', handleCloseOnViewportChange);
    };
  }, [isOpen, computePosition, setOpenState]);

  if (items.length === 0) return null;

  return (
    <div className={`inline-flex ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        data-no-swipe="true"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          if (!isOpen) {
            computePosition();
          }
          setOpenState(!isOpen);
        }}
        className="min-h-10 min-w-10 rounded-xl text-stone-500 hover:text-stone-900 hover:bg-stone-100 inline-flex items-center justify-center transition-colors cursor-pointer"
      >
        <MoreVertical className="w-4 h-4" aria-hidden="true" />
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              aria-hidden="true"
              onClick={(event) => {
                event.stopPropagation();
                setOpenState(false);
              }}
              className="fixed inset-0 z-50 bg-transparent"
            />
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label={label}
              style={{
                top: coords.top,
                bottom: coords.bottom,
                right: coords.right,
              }}
              className="ds-card fixed z-[51] min-w-48 rounded-2xl p-1.5 shadow-2xl"
            >
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenState(false);
                    item.onSelect();
                  }}
                  className={`min-h-11 w-full flex items-center gap-2.5 rounded-xl px-3 text-left text-xs font-semibold transition-colors cursor-pointer ${
                    item.tone === 'danger'
                      ? 'text-rose-600 hover:bg-rose-50'
                      : 'text-stone-700 hover:bg-stone-100 hover:text-stone-900'
                  }`}
                >
                  <span className="shrink-0" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </div>
  );
};
