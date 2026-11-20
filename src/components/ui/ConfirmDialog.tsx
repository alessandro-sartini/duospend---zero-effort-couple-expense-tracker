import React, { useId } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useScrollLock } from '../../hooks/useScrollLock';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Annulla',
  variant = 'danger',
  onConfirm,
  onCancel,
}) => {
  const titleId = useId();
  useScrollLock(isOpen);

  if (!isOpen) return null;

  const isWarning = variant === 'warning';

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden overscroll-contain bg-black/55 backdrop-blur-xs p-4"
    >
      <div className="ds-card w-full max-w-sm space-y-4 p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
              isWarning
                ? 'bg-amber-500/12 text-amber-700 border-amber-500/25'
                : 'bg-rose-500/12 text-rose-600 border-rose-500/25'
            }`}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <h3
              id={titleId}
              className={`font-bold text-sm font-display ${
                isWarning ? 'text-amber-900' : 'text-stone-900'
              }`}
            >
              {title}
            </h3>
            <p className="break-words text-xs leading-relaxed text-stone-600">
              {description}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="ds-btn-secondary min-h-10 px-4 text-xs"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-10 rounded-xl px-4 text-xs font-semibold text-white transition-colors cursor-pointer ${
              isWarning
                ? 'bg-amber-700 hover:bg-amber-800'
                : 'bg-rose-600 hover:bg-rose-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
