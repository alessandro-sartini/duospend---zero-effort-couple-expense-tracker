import React, { useState } from 'react';
import { Check, Plus, Sparkles, X } from 'lucide-react';
import { SavingGoal, CoupleProfile } from '../types';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { GoalCardItem } from './vision/GoalCardItem';
import { VisionImageGenerator } from './vision/VisionImageGenerator';

interface VisionBoardProps {
  goals: SavingGoal[];
  profile: CoupleProfile;
  onUpdateGoalImage: (goalId: string, imageUrl: string, resolution: string) => void;
  onAddGoal: (goal: SavingGoal) => void;
  onUpdateGoal: (goal: SavingGoal) => void;
  onDeleteGoal: (id: string) => void;
}

export const VisionBoard: React.FC<VisionBoardProps> = ({
  goals,
  profile,
  onUpdateGoalImage,
  onAddGoal,
  onUpdateGoal,
  onDeleteGoal,
}) => {
  const [lastCreatedGoalId, setLastCreatedGoalId] = useState<string | undefined>(undefined);

  // Stato creazione nuovo obiettivo
  const [isAddingGoal, setIsAddingGoal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTargetAmount, setNewTargetAmount] = useState('3000');
  const [newCurrentAmount, setNewCurrentAmount] = useState('0');
  const [newTargetDate, setNewTargetDate] = useState('');
  const [goalFormError, setGoalFormError] = useState<string | null>(null);

  // Stato modifica inline obiettivo esistente
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);

  // Stato conferma eliminazione
  const [goalPendingDelete, setGoalPendingDelete] = useState<SavingGoal | null>(null);

  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = newTitle.trim();
    const parsedTarget = Number(newTargetAmount.replace(',', '.'));
    const parsedCurrent = Number(newCurrentAmount.replace(',', '.'));

    if (!cleanTitle) {
      setGoalFormError('Inserisci il titolo dell’obiettivo.');
      return;
    }
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      setGoalFormError('Inserisci un importo traguardo maggiore di 0.');
      return;
    }

    const validCurrent =
      Number.isFinite(parsedCurrent) && parsedCurrent >= 0
        ? Math.round(parsedCurrent * 100) / 100
        : 0;

    const created: SavingGoal = {
      id: `goal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: cleanTitle.slice(0, 100),
      targetAmount: Math.round(parsedTarget * 100) / 100,
      currentAmount: validCurrent,
      targetDate: newTargetDate.trim() || undefined,
    };

    onAddGoal(created);
    setLastCreatedGoalId(created.id);
    setNewTitle('');
    setNewTargetAmount('3000');
    setNewCurrentAmount('0');
    setNewTargetDate('');
    setGoalFormError(null);
    setIsAddingGoal(false);
  };

  const handleSaveGoalEdit = (updatedGoal: SavingGoal) => {
    onUpdateGoal(updatedGoal);
    setEditingGoalId(null);
  };

  const handleQuickAdd = (goal: SavingGoal, delta: number) => {
    const nextAmount = Math.round(Math.max(0, goal.currentAmount + delta) * 100) / 100;
    onUpdateGoal({ ...goal, currentAmount: nextAmount });
  };

  return (
    <div className="space-y-6">
      {/* Intestazione */}
      <div className="ds-card p-5 sm:p-6">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500/12 border border-orange-500/25 text-orange-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-stone-900 font-display">
              Bacheca Obiettivi & Progetti di Coppia
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Pianifica i vostri risparmi condivisi e visualizza ogni traguardo con immagini dedicate
            </p>
          </div>
        </div>
      </div>

      {/* Sezione Generatore Immagini */}
      <VisionImageGenerator
        goals={goals}
        preferredGoalId={lastCreatedGoalId}
        onUpdateGoalImage={onUpdateGoalImage}
      />

      {/* Elenco Traguardi Attivi */}
      <div className="ds-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-stone-900 font-display">
              Traguardi e Risparmi di Coppia Attivi
            </h3>
            <p className="text-xs text-stone-500">
              Monitora l&apos;avanzamento, aggiungi quote rapide o fai doppio clic per modificare un obiettivo
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsAddingGoal((current) => !current);
              setGoalFormError(null);
            }}
            className="ds-btn-primary min-h-10 px-4 py-2 text-xs shrink-0 self-start sm:self-auto"
          >
            {isAddingGoal ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{isAddingGoal ? 'Chiudi Form' : 'Nuovo Obiettivo'}</span>
          </button>
        </div>

        {isAddingGoal && (
          <form
            onSubmit={handleCreateGoal}
            className="ds-subcard p-4 space-y-3 border border-orange-500/25"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="sm:col-span-2 lg:col-span-1">
                <label
                  htmlFor="new-goal-title"
                  className="block text-[11px] font-semibold text-stone-700 mb-1"
                >
                  Titolo Obiettivo
                </label>
                <input
                  id="new-goal-title"
                  type="text"
                  maxLength={100}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Es. Viaggio in Giappone"
                  className="ds-input w-full px-3 py-2 text-xs min-h-10"
                />
              </div>
              <div>
                <label
                  htmlFor="new-goal-current"
                  className="block text-[11px] font-semibold text-stone-700 mb-1"
                >
                  Risparmiati ({profile.currency})
                </label>
                <input
                  id="new-goal-current"
                  type="number"
                  min="0"
                  step="any"
                  value={newCurrentAmount}
                  onChange={(e) => setNewCurrentAmount(e.target.value)}
                  className="ds-input w-full px-3 py-2 text-xs font-mono min-h-10"
                />
              </div>
              <div>
                <label
                  htmlFor="new-goal-target"
                  className="block text-[11px] font-semibold text-stone-700 mb-1"
                >
                  Traguardo ({profile.currency})
                </label>
                <input
                  id="new-goal-target"
                  type="number"
                  min="0.01"
                  step="any"
                  value={newTargetAmount}
                  onChange={(e) => setNewTargetAmount(e.target.value)}
                  className="ds-input w-full px-3 py-2 text-xs font-mono min-h-10"
                />
              </div>
              <div>
                <label
                  htmlFor="new-goal-date"
                  className="block text-[11px] font-semibold text-stone-700 mb-1"
                >
                  Data Obiettivo (opzionale)
                </label>
                <input
                  id="new-goal-date"
                  type="date"
                  value={newTargetDate}
                  onChange={(e) => setNewTargetDate(e.target.value)}
                  className="ds-input w-full px-3 py-2 text-xs font-mono min-h-10"
                />
              </div>
            </div>

            {goalFormError && (
              <p className="text-xs font-semibold text-rose-600">{goalFormError}</p>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddingGoal(false)}
                className="ds-btn-secondary min-h-9 px-3 text-xs"
              >
                Annulla
              </button>
              <button type="submit" className="ds-btn-primary min-h-9 px-4 text-xs">
                <Check className="w-3.5 h-3.5" />
                <span>Salva Obiettivo</span>
              </button>
            </div>
          </form>
        )}

        {goals.length === 0 ? (
          <div className="ds-subcard p-8 text-center text-xs text-stone-500 space-y-3">
            <p>Non avete ancora creato nessun obiettivo condiviso.</p>
            <button
              type="button"
              onClick={() => setIsAddingGoal(true)}
              className="ds-btn-primary min-h-10 px-4 text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Crea il Primo Obiettivo</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {goals.map((goal) => (
              <GoalCardItem
                key={goal.id}
                goal={goal}
                currency={profile.currency}
                isEditing={editingGoalId === goal.id}
                onStartEdit={(targetGoal) => setEditingGoalId(targetGoal.id)}
                onCancelEdit={() => setEditingGoalId(null)}
                onSaveEdit={handleSaveGoalEdit}
                onQuickAdd={handleQuickAdd}
                onRequestDelete={(targetGoal) => setGoalPendingDelete(targetGoal)}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={Boolean(goalPendingDelete)}
        variant="danger"
        title="Eliminare questo obiettivo?"
        description={
          goalPendingDelete
            ? `L’obiettivo “${goalPendingDelete.title}” verrà rimosso dalla bacheca. L’azione non può essere annullata.`
            : ''
        }
        confirmLabel="Elimina"
        cancelLabel="Annulla"
        onConfirm={() => {
          if (goalPendingDelete) {
            onDeleteGoal(goalPendingDelete.id);
          }
          setGoalPendingDelete(null);
        }}
        onCancel={() => setGoalPendingDelete(null)}
      />
    </div>
  );
};
