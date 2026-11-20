import React, { useEffect } from 'react';
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
  children,
}) => {
  useScrollLock(isOpen);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden overscroll-contain p-3 sm:p-4 bg-black/55 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`ds-card shadow-2xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] ${MAX_WIDTH_MAP[maxWidth]} w-full overflow-hidden flex flex-col`}
      >
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-stone-100 bg-stone-50/60 shrink-0">
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
          <div className="px-4 sm:px-6 py-3.5 border-t border-stone-100 bg-stone-50/60 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
