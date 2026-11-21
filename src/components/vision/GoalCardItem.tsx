import React, { useEffect, useState } from 'react';
import { Check, Image as ImageIcon, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { formatCurrency } from '../../constants/categories';
import type { GoalVirtualSavingsSummary, SavingGoal } from '../../types';

interface GoalCardItemProps {
  goal: SavingGoal;
  currency: string;
  isEditing: boolean;
  virtualSummary?: GoalVirtualSavingsSummary;
  onStartEdit: (goal: SavingGoal) => void;
  onCancelEdit: () => void;
  onSaveEdit: (updatedGoal: SavingGoal) => void;
  onQuickAdd: (goal: SavingGoal, delta: number) => void;
  onRequestDelete: (goal: SavingGoal) => void;
  onCreateChallenge?: (goalId: string) => void;
}

export const GoalCardItem: React.FC<GoalCardItemProps> = ({
  goal,
  currency,
  isEditing,
  virtualSummary,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onQuickAdd,
  onRequestDelete,
  onCreateChallenge,
}) => {
  const [editTitle, setEditTitle] = useState(goal.title);
  const [editCurrentAmount, setEditCurrentAmount] = useState(String(goal.currentAmount));
  const [editTargetAmount, setEditTargetAmount] = useState(String(goal.targetAmount));
  const [editTargetDate, setEditTargetDate] = useState(goal.targetDate || '');

  useEffect(() => {
    if (isEditing) {
      setEditTitle(goal.title);
      setEditCurrentAmount(String(goal.currentAmount));
      setEditTargetAmount(String(goal.targetAmount));
      setEditTargetDate(goal.targetDate || '');
    }
  }, [isEditing, goal]);

  const percent =
    goal.targetAmount > 0
      ? Math.min(Math.round((goal.currentAmount / goal.targetAmount) * 100), 100)
      : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = editTitle.trim() || goal.title;
    const parsedCurrent = Number(editCurrentAmount.replace(',', '.'));
    const parsedTarget = Number(editTargetAmount.replace(',', '.'));

    onSaveEdit({
      ...goal,
      title: cleanTitle.slice(0, 100),
      currentAmount:
        Number.isFinite(parsedCurrent) && parsedCurrent >= 0
          ? Math.round(parsedCurrent * 100) / 100
          : goal.currentAmount,
      targetAmount:
        Number.isFinite(parsedTarget) && parsedTarget > 0
          ? Math.round(parsedTarget * 100) / 100
          : goal.targetAmount,
      targetDate: editTargetDate.trim() || undefined,
    });
  };

  return (
    <div
      onDoubleClick={() => {
        if (!isEditing) onStartEdit(goal);
      }}
      title={!isEditing ? 'Doppio clic per modificare questo obiettivo' : undefined}
      className="ds-subcard rounded-2xl overflow-hidden flex flex-col justify-between transition-colors"
    >
      {goal.imageUrl ? (
        <div className="w-full h-40 bg-stone-900 relative">
          <img
            src={goal.imageUrl}
            alt={goal.title}
            className="w-full h-full object-cover"
          />
          {goal.imageResolution && (
            <span className="absolute top-2 right-2 font-mono text-[9px] font-bold bg-black/60 text-white px-1.5 py-0.5 rounded backdrop-blur-xs">
              {goal.imageResolution}
            </span>
          )}
        </div>
      ) : (
        <div className="w-full h-24 bg-stone-100/70 flex items-center justify-center text-stone-400">
          <ImageIcon className="w-8 h-8 opacity-40" />
        </div>
      )}

      <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
        {isEditing ? (
          <form onSubmit={handleSubmit} className="space-y-2.5 text-xs">
            <div>
              <label className="block text-[10px] font-semibold text-stone-600 mb-1">
                Titolo
              </label>
              <input
                type="text"
                maxLength={100}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="ds-input w-full px-2.5 py-1.5 text-xs min-h-9"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-stone-600 mb-1">
                  Attuale ({currency})
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={editCurrentAmount}
                  onChange={(e) => setEditCurrentAmount(e.target.value)}
                  className="ds-input w-full px-2.5 py-1.5 text-xs font-mono min-h-9"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-stone-600 mb-1">
                  Traguardo ({currency})
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={editTargetAmount}
                  onChange={(e) => setEditTargetAmount(e.target.value)}
                  className="ds-input w-full px-2.5 py-1.5 text-xs font-mono min-h-9"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-stone-600 mb-1">
                Data Scadenza
              </label>
              <input
                type="date"
                value={editTargetDate}
                onChange={(e) => setEditTargetDate(e.target.value)}
                className="ds-input w-full px-2.5 py-1.5 text-xs font-mono min-h-9"
              />
            </div>
            <div className="flex items-center justify-end gap-1.5 pt-1">
              <button
                type="button"
                onClick={onCancelEdit}
                className="ds-btn-secondary min-h-8 px-2.5 text-[11px]"
              >
                Annulla
              </button>
              <button type="submit" className="ds-btn-primary min-h-8 px-3 text-[11px]">
                <Check className="w-3 h-3" />
                <span>Salva</span>
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-stone-900 truncate">{goal.title}</h4>
                {goal.targetDate && (
                  <span className="text-[11px] text-stone-500 font-mono">
                    Obiettivo: {goal.targetDate}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onStartEdit(goal)}
                  className="min-h-8 min-w-8 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-200/60 flex items-center justify-center transition-colors cursor-pointer"
                  aria-label={`Modifica obiettivo ${goal.title}`}
                  title="Modifica obiettivo"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onRequestDelete(goal)}
                  className="min-h-8 min-w-8 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer"
                  aria-label={`Elimina obiettivo ${goal.title}`}
                  title="Elimina obiettivo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap justify-between gap-x-2 gap-y-1 text-xs font-mono">
                <span className="font-bold text-stone-900">
                  {formatCurrency(goal.currentAmount, currency)}
                </span>
                <span className="text-stone-500">
                  Traguardo: {formatCurrency(goal.targetAmount, currency)}
                </span>
              </div>
              <div className="w-full h-2 bg-stone-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 rounded-full transition-all"
                  style={{ width: `${percent}%` }}
                ></div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onQuickAdd(goal, 50)}
                    className="ds-btn-secondary min-h-8 px-2 py-0.5 text-[11px] font-mono"
                  >
                    +€50
                  </button>
                  <button
                    type="button"
                    onClick={() => onQuickAdd(goal, 100)}
                    className="ds-btn-secondary min-h-8 px-2 py-0.5 text-[11px] font-mono"
                  >
                    +€100
                  </button>
                  {onCreateChallenge && (
                    <button
                      type="button"
                      onClick={() => onCreateChallenge(goal.id)}
                      className="ds-btn-secondary min-h-8 px-2 py-0.5 text-[11px]"
                      title={`Crea sfida di risparmio per ${goal.title}`}
                    >
                      <Sparkles className="w-3 h-3 text-orange-600" aria-hidden="true" />
                      <span>Sfida</span>
                    </button>
                  )}
                </div>
                <span className="text-[11px] text-stone-500 font-mono font-semibold shrink-0">
                  {percent}%
                </span>
              </div>

              {virtualSummary &&
                (virtualSummary.totalVirtualApplied > 0 ||
                  virtualSummary.activeChallengesCount > 0 ||
                  virtualSummary.lastCompletedChallengeTitle) && (
                  <div className="pt-2 border-t border-stone-200/70 text-[10px] text-stone-500 space-y-0.5">
                    {virtualSummary.totalVirtualApplied > 0 && (
                      <div className="font-mono text-emerald-700 font-semibold">
                        Contributo virtuale sfide: +
                        {formatCurrency(virtualSummary.totalVirtualApplied, currency)}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-x-2">
                      {virtualSummary.activeChallengesCount > 0 && (
                        <span>
                          {virtualSummary.activeChallengesCount}{' '}
                          {virtualSummary.activeChallengesCount === 1
                            ? 'sfida attiva'
                            : 'sfide attive'}
                        </span>
                      )}
                      {virtualSummary.lastCompletedChallengeTitle && (
                        <span className="truncate">
                          Ultima completata: {virtualSummary.lastCompletedChallengeTitle}
                        </span>
                      )}
                    </div>
                  </div>
                )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
