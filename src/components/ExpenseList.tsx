import React, { useState } from 'react';
import {
  AlertTriangle,
  Camera,
  ChevronDown,
  Download,
  Edit3,
  Receipt,
  Search,
  Trash2,
} from 'lucide-react';
import {
  EXPENSE_CATEGORIES,
  formatCurrency,
  formatSplitLabel,
} from '../constants/categories';
import { CoupleProfile, Expense } from '../types';
import { CategoryBadge } from './ui/CategoryBadge';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { SourceBadge } from './ui/SourceBadge';

function escapeCsvCell(value: string | number): string {
  const raw = String(value ?? '');
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

interface ExpenseListProps {
  expenses: Expense[];
  profile: CoupleProfile;
  onEditExpense: (expense: Expense) => void;
  onDeleteExpense: (id: string) => void;
  onOpenScanReceipt: () => void;
  onlyZeroAmount?: boolean;
  onClearZeroAmountFilter?: () => void;
}

export const ExpenseList: React.FC<ExpenseListProps> = ({
  expenses,
  profile,
  onEditExpense,
  onDeleteExpense,
  onOpenScanReceipt,
  onlyZeroAmount = false,
  onClearZeroAmountFilter,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPayer, setSelectedPayer] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expensePendingDelete, setExpensePendingDelete] = useState<Expense | null>(null);

  const filteredExpenses = expenses.filter((exp) => {
    const matchesSearch =
      exp.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (exp.notes && exp.notes.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory =
      selectedCategory === 'all' || exp.category === selectedCategory;
    const matchesPayer =
      selectedPayer === 'all' || exp.payer === selectedPayer;
    const matchesZeroAmount = !onlyZeroAmount || exp.amount <= 0;
    return matchesSearch && matchesCategory && matchesPayer && matchesZeroAmount;
  });

  const totalFiltered = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  const handleExportCsv = () => {
    if (filteredExpenses.length === 0) return;

    const header = [
      'Data',
      'Esercente',
      'Categoria',
      'Pagato da',
      'Ripartizione',
      'Importo',
      'Valuta',
      'Origine',
      'Note',
    ];

    const rows = filteredExpenses.map((exp) => [
      escapeCsvCell(exp.date),
      escapeCsvCell(exp.title),
      escapeCsvCell(exp.category),
      escapeCsvCell(exp.payer === 'user' ? profile.userName : profile.partnerName),
      escapeCsvCell(formatSplitLabel(exp)),
      escapeCsvCell(exp.amount.toFixed(2)),
      escapeCsvCell(exp.currency || profile.currency),
      escapeCsvCell(exp.source),
      escapeCsvCell(exp.notes || ''),
    ]);

    const csvContent = `\uFEFF${[header.map(escapeCsvCell).join(','), ...rows.map((r) => r.join(','))].join('\r\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `duospend-spese-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Intestazione e Controlli */}
      <div className="ds-card p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-stone-900 font-display">
              Registro Spese di Coppia
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Visualizzazione di {filteredExpenses.length} su {expenses.length} spese totali (Totale:{' '}
              <span className="font-mono font-bold text-stone-900">
                {formatCurrency(totalFiltered, profile.currency)}
              </span>
              )
            </p>
            <p className="text-[11px] text-stone-400 mt-1">
              Suggerimento: doppio clic su una riga (o tocca Modifica su smartphone) per modificarla al volo
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredExpenses.length === 0}
              className="ds-btn-secondary px-3 py-2 text-xs shrink-0 disabled:opacity-50"
              title="Esporta spese filtrate in CSV"
              aria-label="Esporta CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Esporta CSV</span>
            </button>
          </div>
        </div>

        {/* Barre di filtro */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cerca per negozio, articolo o nota..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="ds-input w-full pl-9 pr-3 py-2 text-xs"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            aria-label="Filtra per categoria"
            className="ds-input w-full px-3 py-2 text-xs"
          >
            <option value="all">Tutte le Categorie</option>
            {EXPENSE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            value={selectedPayer}
            onChange={(e) => setSelectedPayer(e.target.value)}
            aria-label="Filtra per pagatore"
            className="ds-input w-full px-3 py-2 text-xs"
          >
            <option value="all">Tutti i Pagatori</option>
            <option value="user">Pagato da {profile.userName}</option>
            <option value="partner">Pagato da {profile.partnerName}</option>
          </select>
        </div>

        {onlyZeroAmount && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              Filtro attivo: solo spese con importo 0 €
            </span>
            {onClearZeroAmountFilter && (
              <button
                type="button"
                onClick={onClearZeroAmountFilter}
                className="font-semibold underline hover:no-underline cursor-pointer"
              >
                Mostra tutte
              </button>
            )}
          </div>
        )}
      </div>

      {/* Elenco Spese */}
      <div className="ds-card overflow-hidden">
        {filteredExpenses.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-400 flex items-center justify-center mx-auto">
              <Receipt className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-stone-800">Nessuna spesa trovata</p>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              Modifica i filtri di ricerca, oppure scatta una foto a uno scontrino per aggiungere la prima spesa.
            </p>
            <button
              type="button"
              onClick={onOpenScanReceipt}
              className="ds-btn-primary mt-2 px-4 py-2 text-xs"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Scansiona Scontrino con Fotocamera</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {filteredExpenses.map((exp) => {
              const isExpanded = expandedId === exp.id;
              const payerName = exp.payer === 'user' ? profile.userName : profile.partnerName;

              return (
                <div
                  key={exp.id}
                  onDoubleClick={(e) => {
                    if (!(e.target as HTMLElement).closest('button')) {
                      onEditExpense(exp);
                    }
                  }}
                  title="Doppio clic per modificare questa spesa"
                  className={`p-3.5 sm:p-4 hover:bg-stone-50/50 transition-colors ${
                    exp.amount <= 0 ? 'border-l-4 border-amber-400 bg-amber-50/40' : ''
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div
                      className="flex items-start gap-3 min-w-0 flex-1 sm:cursor-auto cursor-pointer"
                      onClick={() => {
                        if (window.innerWidth < 640) {
                          onEditExpense(exp);
                        }
                      }}
                    >
                      <CategoryBadge category={exp.category} size="lg" />

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h4 className="min-w-0 text-sm font-bold text-stone-900 break-words sm:truncate">
                            {exp.title}
                          </h4>
                          {exp.source !== 'manual' && (
                            <SourceBadge source={exp.source} compact />
                          )}
                          {exp.amount <= 0 && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-500/25 bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                              <AlertTriangle className="h-3 w-3" />
                              Importo da verificare
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-stone-500">
                          <span className="font-mono text-[11px]">{exp.date}</span>
                          <span aria-hidden="true">·</span>
                          <span>{exp.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            Pagato da <strong className="text-stone-700">{payerName}</strong>
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatSplitLabel(exp)}</span>
                        </div>

                        {exp.notes && (
                          <p className="mt-1 break-words text-xs italic text-stone-600">
                            {exp.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex w-full shrink-0 items-center justify-between sm:w-auto sm:flex-col sm:items-end sm:text-right">
                      <div className="text-base font-bold font-mono text-stone-900 tabular-nums">
                        {formatCurrency(exp.amount, exp.currency)}
                      </div>
                      <div className="flex items-center justify-end gap-1 sm:mt-1.5">
                        {((exp.items && exp.items.length > 0) || exp.receiptUrl) && (
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : exp.id)}
                            className="min-h-10 min-w-10 p-2 rounded-xl text-stone-500 hover:text-stone-700 hover:bg-stone-100 transition-colors flex items-center justify-center cursor-pointer"
                            title="Vedi dettaglio articoli"
                            aria-label={`Vedi dettagli di ${exp.title}`}
                          >
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition-transform ${
                                isExpanded ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onEditExpense(exp)}
                          className="min-h-10 min-w-10 px-2.5 sm:px-2 py-2 rounded-xl text-stone-600 sm:text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                          title="Modifica spesa"
                          aria-label={`Modifica ${exp.title}`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span className="sm:hidden text-[11px] font-semibold">Modifica</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpensePendingDelete(exp)}
                          className="min-h-10 min-w-10 p-2 rounded-xl text-stone-500 hover:text-rose-600 hover:bg-rose-50 transition-colors flex items-center justify-center cursor-pointer"
                          title="Elimina spesa"
                          aria-label={`Elimina ${exp.title}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-stone-100 bg-stone-50/50 -mx-3.5 sm:-mx-4 -mb-3.5 sm:-mb-4 p-4 rounded-b-xl space-y-3">
                      {exp.items && exp.items.length > 0 && (
                        <div>
                          <span className="text-[11px] font-semibold text-stone-600 uppercase tracking-wide block mb-1">
                            Articoli Rilevati nello Scontrino
                          </span>
                          <div className="space-y-1">
                            {exp.items.map((it, idx) => (
                              <div
                                key={idx}
                                className="flex justify-between text-xs text-stone-700 py-0.5 border-b border-stone-100 last:border-0"
                              >
                                <span>{it.name}</span>
                                <span className="font-mono tabular-nums">
                                  {formatCurrency(it.price, exp.currency)}
                                </span>
                              </div>
                            ))}
                            {exp.tax && exp.tax > 0 && (
                              <div className="flex justify-between text-xs text-stone-500 pt-1">
                                <span>IVA (Imposta)</span>
                                <span className="font-mono tabular-nums">
                                  {formatCurrency(exp.tax, exp.currency)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {exp.receiptUrl && (
                        <div>
                          <span className="text-[11px] font-semibold text-stone-600 uppercase tracking-wide block mb-1">
                            Foto Scontrino Allegata
                          </span>
                          <div className="w-36 h-36 rounded-xl overflow-hidden border border-stone-200 bg-stone-900">
                            <img
                              src={exp.receiptUrl}
                              alt="Scontrino allegato"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={Boolean(expensePendingDelete)}
        variant="danger"
        title="Eliminare questa spesa?"
        description={
          expensePendingDelete
            ? `“${expensePendingDelete.title}” verrà rimossa dal registro. L’azione non può essere annullata.`
            : ''
        }
        confirmLabel="Elimina"
        cancelLabel="Annulla"
        onConfirm={() => {
          if (expensePendingDelete) {
            onDeleteExpense(expensePendingDelete.id);
          }
          setExpensePendingDelete(null);
        }}
        onCancel={() => setExpensePendingDelete(null)}
      />
    </div>
  );
};
