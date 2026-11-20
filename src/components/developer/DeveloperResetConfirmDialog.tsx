import React, { useId } from 'react';
import { AlertTriangle, Check, Download } from 'lucide-react';
import { useScrollLock } from '../../hooks/useScrollLock';

interface DeveloperResetConfirmDialogProps {
  isOpen: boolean;
  expensesCount: number;
  settlementsCount: number;
  goalsCount: number;
  resetMode: 'empty' | 'demo';
  resetConfirmText: string;
  isResettingDb: boolean;
  isExported: boolean;
  errorText: string | null;
  onChangeResetMode: (mode: 'empty' | 'demo') => void;
  onChangeConfirmText: (value: string) => void;
  onExportJson: () => void;
  onConfirm: (event: React.FormEvent) => void;
  onCancel: () => void;
}

export const DeveloperResetConfirmDialog: React.FC<DeveloperResetConfirmDialogProps> = ({
  isOpen,
  expensesCount,
  settlementsCount,
  goalsCount,
  resetMode,
  resetConfirmText,
  isResettingDb,
  isExported,
  errorText,
  onChangeResetMode,
  onChangeConfirmText,
  onExportJson,
  onConfirm,
  onCancel,
}) => {
  const resetDialogTitleId = useId();
  useScrollLock(isOpen);

  if (!isOpen) return null;

  const isResetConfirmationReady = resetConfirmText.trim().toUpperCase() === 'RESET';

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={resetDialogTitleId}
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden overscroll-contain bg-black/55 backdrop-blur-xs p-4"
    >
      <form
        onSubmit={onConfirm}
        className="ds-card w-full max-w-md space-y-4 p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-rose-500/12 text-rose-600 border-rose-500/25">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <h3 id={resetDialogTitleId} className="font-bold text-sm font-display text-stone-900">
              Sei sicuro di voler procedere?
            </h3>
            <p className="text-xs leading-relaxed text-stone-600">
              Questa azione sostituirà i dati attuali del database SQLite ({expensesCount}{' '}
              spese, {settlementsCount} pareggi, {goalsCount} obiettivi). Le email autorizzate
              della coppia verranno mantenute.
            </p>
          </div>
        </div>

        <div className="space-y-2 text-xs">
          <span className="font-semibold text-stone-700 block">Modalità reset</span>
          <label className="ds-subcard flex items-start gap-2.5 p-3 cursor-pointer">
            <input
              type="radio"
              name="resetMode"
              value="empty"
              checked={resetMode === 'empty'}
              onChange={() => onChangeResetMode('empty')}
              className="mt-0.5 accent-rose-600"
            />
            <div>
              <span className="font-semibold text-stone-900 block">
                Svuota tutto (0 spese)
              </span>
              <span className="text-[11px] text-stone-500">
                Elimina spese, pareggi, obiettivi e cache Gmail, conservando profilo ed email
                autorizzate.
              </span>
            </div>
          </label>

          <label className="ds-subcard flex items-start gap-2.5 p-3 cursor-pointer">
            <input
              type="radio"
              name="resetMode"
              value="demo"
              checked={resetMode === 'demo'}
              onChange={() => onChangeResetMode('demo')}
              className="mt-0.5 accent-rose-600"
            />
            <div>
              <span className="font-semibold text-stone-900 block">
                Ripristina dati demo iniziali
              </span>
              <span className="text-[11px] text-stone-500">
                Carica le spese e gli obiettivi di esempio, mantenendo le email Google
                configurate.
              </span>
            </div>
          </label>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={onExportJson}
            className="ds-btn-secondary px-3 py-1.5 text-[11px]"
          >
            {isExported ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Download className="w-3.5 h-3.5 text-orange-600" />
            )}
            <span>{isExported ? 'Backup scaricato' : 'Scarica prima backup JSON'}</span>
          </button>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="dev-reset-confirm-input"
            className="text-xs font-semibold text-stone-700 block"
          >
            Digita <code className="font-mono text-rose-600">RESET</code> per abilitare il
            ripristino
          </label>
          <input
            id="dev-reset-confirm-input"
            type="text"
            value={resetConfirmText}
            onChange={(event) => onChangeConfirmText(event.target.value)}
            placeholder="RESET"
            autoComplete="off"
            className="ds-input w-full px-3 py-2 text-xs font-mono uppercase"
          />
        </div>

        {errorText && (
          <div
            role="alert"
            className="p-2.5 rounded-xl border bg-rose-50 border-rose-200 text-xs text-rose-800"
          >
            {errorText}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={isResettingDb}
            className="ds-btn-secondary min-h-10 px-4 text-xs"
          >
            Annulla
          </button>
          <button
            type="submit"
            disabled={!isResetConfirmationReady || isResettingDb}
            className="min-h-10 rounded-xl px-4 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isResettingDb ? 'Ripristino...' : 'Sì, procedi con il reset'}
          </button>
        </div>
      </form>
    </div>
  );
};
