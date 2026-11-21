import React, { useEffect, useRef, useState } from 'react';
import { Check, ShieldCheck, Sparkles, Target } from 'lucide-react';
import { formatCurrency } from '../../constants/categories';
import {
  generateIdempotencyKey,
  previewChallengeContribution,
} from '../../services/savings-challenges';
import type { ContributionPreview, SavingsChallenge } from '../../types';
import { ModalShell } from '../ui/ModalShell';
import { formatDateTimeShort } from './challengeStatusMeta';

interface ContributionConfirmModalProps {
  isOpen: boolean;
  challenge: SavingsChallenge | null;
  onClose: () => void;
  onConfirm: (payload: {
    challengeId: string;
    amount: number;
    expectedVersion: number;
    idempotencyKey: string;
  }) => Promise<void>;
}

export const ContributionConfirmModal: React.FC<ContributionConfirmModalProps> = ({
  isOpen,
  challenge,
  onClose,
  onConfirm,
}) => {
  const [preview, setPreview] = useState<ContributionPreview | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [explicitChecked, setExplicitChecked] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attemptKeyRef = useRef<string>('');

  useEffect(() => {
    if (!isOpen || !challenge) return;
    attemptKeyRef.current = generateIdempotencyKey();
    setPreview(null);
    setExplicitChecked(false);
    setError(null);
    setIsLoadingPreview(true);

    let cancelled = false;
    void previewChallengeContribution(challenge.id)
      .then((res) => {
        if (cancelled) return;
        setPreview(res.preview);
        setAmountInput(String(res.preview.proposedAmount));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : 'Impossibile calcolare l’anteprima del contributo.'
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPreview(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, challenge]);

  if (!challenge) return null;

  const parsedAmount = Number(amountInput.replace(',', '.'));
  const maxAvailable = preview?.availableVirtualSavings ?? 0;
  const safeAmount =
    Number.isFinite(parsedAmount) && parsedAmount > 0
      ? Math.min(maxAvailable, Math.round(parsedAmount * 100) / 100)
      : 0;
  const projectedTotal = preview
    ? Math.round((preview.currentGoalAmount + safeAmount) * 100) / 100
    : 0;
  const projectedPercent =
    preview && preview.targetGoalAmount > 0
      ? Math.min(100, Math.round((projectedTotal / preview.targetGoalAmount) * 100))
      : 0;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview || isSubmitting || !explicitChecked) return;
    if (safeAmount <= 0 || safeAmount > maxAvailable) {
      setError('Inserisci un importo valido entro il risparmio virtuale disponibile.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm({
        challengeId: challenge.id,
        amount: safeAmount,
        expectedVersion: preview.challengeVersion,
        idempotencyKey: attemptKeyRef.current,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Conferma del contributo non riuscita.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Conferma contributo virtuale"
      subtitle="Anteprima autoritativa server · Operazione reversibile"
      icon={Sparkles}
      maxWidth="md"
      mobileBottomSheet
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="ds-btn-secondary min-h-10 px-4 text-xs"
          >
            Annulla
          </button>
          <button
            type="submit"
            form="confirm-contribution-form"
            disabled={
              isLoadingPreview ||
              isSubmitting ||
              !preview ||
              !explicitChecked ||
              safeAmount <= 0
            }
            className="ds-btn-primary min-h-10 px-4 text-xs"
          >
            <Check className="w-4 h-4" aria-hidden="true" />
            <span>{isSubmitting ? 'Registrazione...' : 'Conferma contributo virtuale'}</span>
          </button>
        </div>
      }
    >
      <form
        id="confirm-contribution-form"
        onSubmit={(e) => void handleConfirm(e)}
        className="p-4 sm:p-6 space-y-4 text-xs"
      >
        {isLoadingPreview ? (
          <div className="p-6 text-center text-stone-500">
            Calcolo anteprima dal database centrale...
          </div>
        ) : preview ? (
          <>
            <div className="ds-subcard p-3.5 space-y-2">
              <div className="flex items-center gap-2 font-bold text-stone-900">
                <Target className="w-4 h-4 text-orange-600 shrink-0" aria-hidden="true" />
                <span className="truncate">{preview.goalTitle}</span>
              </div>
              <p className="text-[11px] text-stone-600">{preview.explanation}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="ds-subcard p-3">
                <span className="text-[11px] text-stone-500 block">Disponibile ora</span>
                <strong className="font-mono tabular-nums text-base text-emerald-600">
                  {formatCurrency(preview.availableVirtualSavings, preview.currency)}
                </strong>
              </div>
              <div className="ds-subcard p-3">
                <span className="text-[11px] text-stone-500 block">Nuovo totale obiettivo</span>
                <strong className="font-mono tabular-nums text-base text-stone-900">
                  {formatCurrency(projectedTotal, preview.currency)} ({projectedPercent}%)
                </strong>
              </div>
            </div>

            <div>
              <label
                htmlFor="contribution-amount-input"
                className="block font-semibold text-stone-700 mb-1"
              >
                Importo virtuale da assegnare ({preview.currency})
              </label>
              <input
                id="contribution-amount-input"
                type="number"
                min="0.01"
                max={preview.availableVirtualSavings}
                step="0.01"
                required
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                className="ds-input w-full px-3 py-2 text-sm font-mono min-h-10"
              />
            </div>

            {preview.previousContributions.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-stone-700">
                  Storico contributi precedenti ({preview.previousContributions.length})
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {preview.previousContributions.map((item) => (
                    <div
                      key={item.id}
                      className="ds-subcard px-2.5 py-1.5 flex items-center justify-between text-[11px] font-mono"
                    >
                      <span>{formatDateTimeShort(item.createdAt)}</span>
                      <span>
                        {formatCurrency(item.amount, item.currency)} ·{' '}
                        {item.status === 'reverted' ? 'Stornato' : 'Applicato'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-[11px] text-emerald-900 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{preview.virtualDisclaimer}</span>
            </div>

            <label className="flex items-start gap-2.5 p-3 ds-subcard cursor-pointer">
              <input
                type="checkbox"
                checked={explicitChecked}
                onChange={(e) => setExplicitChecked(e.target.checked)}
                className="h-4 w-4 mt-0.5 accent-orange-600 shrink-0"
              />
              <span className="text-xs font-medium text-stone-900 leading-snug">
                Confermo di voler registrare{' '}
                <strong className="font-mono">
                  {formatCurrency(safeAmount, preview.currency)}
                </strong>{' '}
                come contributo virtuale verso &ldquo;{preview.goalTitle}&rdquo;.
              </span>
            </label>
          </>
        ) : null}

        {error && (
          <p role="alert" className="text-xs font-semibold text-rose-600">
            {error}
          </p>
        )}
      </form>
    </ModalShell>
  );
};
