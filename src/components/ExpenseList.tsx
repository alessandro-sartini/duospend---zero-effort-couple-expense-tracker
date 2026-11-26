import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  Download,
  Edit3,
  GitMerge,
  Plane,
  Receipt,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  formatCompactSplitLabel,
  formatCurrency,
  formatShortExpenseDate,
  formatSplitLabel,
  getActiveCategories,
} from '../constants/categories';
import { CoupleProfile, Expense, SavingGoal, TripProject } from '../types';
import type { SwipeOpenSide } from '../utils/swipeGestures';
import { CategoryBadge } from './ui/CategoryBadge';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { RowActionMenu, type RowActionMenuItem } from './ui/RowActionMenu';
import { SourceBadge } from './ui/SourceBadge';
import { SwipeableActionRow } from './ui/SwipeableActionRow';
import { triggerLightHaptic } from '../utils/mobileFeedback';

function escapeCsvCell(value: string | number): string {
  const raw = String(value ?? '');
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

interface ExpenseListProps {
  expenses: Expense[];
  profile: CoupleProfile;
  goals?: SavingGoal[];
  trips?: TripProject[];
  onEditExpense: (expense: Expense) => void;
  onDeleteExpense: (id: string) => void;
  onMergeDuplicateExpense?: (duplicateExpenseId: string, candidateExpenseId: string) => void;
  onDismissDuplicateExpense?: (expenseId: string) => void;
  onOpenScanReceipt: () => void;
  onlyZeroAmount?: boolean;
  onClearZeroAmountFilter?: () => void;
}

const EXPENSE_MONTH_OPTIONS = [
  { value: 1, label: 'Gennaio' },
  { value: 2, label: 'Febbraio' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Aprile' },
  { value: 5, label: 'Maggio' },
  { value: 6, label: 'Giugno' },
  { value: 7, label: 'Luglio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Settembre' },
  { value: 10, label: 'Ottobre' },
  { value: 11, label: 'Novembre' },
  { value: 12, label: 'Dicembre' },
];

export const ExpenseList: React.FC<ExpenseListProps> = ({
  expenses,
  profile,
  goals = [],
  trips = [],
  onEditExpense,
  onDeleteExpense,
  onMergeDuplicateExpense,
  onDismissDuplicateExpense,
  onOpenScanReceipt,
  onlyZeroAmount = false,
  onClearZeroAmountFilter,
}) => {
  const currentYear = new Date().getFullYear();
  const expenseById = React.useMemo(
    () => new Map(expenses.map((item) => [item.id, item])),
    [expenses]
  );
  const tripNameById = React.useMemo(
    () => new Map(trips.map((trip) => [trip.id, trip.name])),
    [trips]
  );
  const availableYears = React.useMemo(() => {
    const years = new Set<number>([currentYear]);
    for (const exp of expenses) {
      const y = Number(exp.date.slice(0, 4));
      if (Number.isInteger(y) && y >= 2000 && y <= 2100) {
        years.add(y);
      }
    }
    return [...years].sort((a, b) => b - a);
  }, [expenses, currentYear]);
  const filterCategories = React.useMemo(() => {
    const active = getActiveCategories(profile, goals);
    const seen = new Set(active);
    const extraFromHistory: string[] = [];
    for (const exp of expenses) {
      if (exp.category && !seen.has(exp.category)) {
        seen.add(exp.category);
        extraFromHistory.push(exp.category);
      }
    }
    return [...active, ...extraFromHistory];
  }, [profile, goals, expenses]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPayer, setSelectedPayer] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expensePendingDelete, setExpensePendingDelete] = useState<Expense | null>(null);
  const [openSwipe, setOpenSwipe] = useState<{
    id: string;
    side: Exclude<SwipeOpenSide, null>;
  } | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [csvExported, setCsvExported] = useState(false);

  useEffect(() => {
    if (!csvExported) return;
    const timer = window.setTimeout(() => setCsvExported(false), 2000);
    return () => window.clearTimeout(timer);
  }, [csvExported]);

  useEffect(() => {
    setOpenSwipe(null);
  }, [searchTerm, selectedYear, selectedMonth, selectedCategory, selectedPayer, onlyZeroAmount]);

  useEffect(() => {
    if (expensePendingDelete) {
      setOpenSwipe(null);
    }
  }, [expensePendingDelete]);

  const filteredExpenses = expenses.filter((exp) => {
    const expYear = Number(exp.date.slice(0, 4));
    const expMonth = Number(exp.date.slice(5, 7));
    const matchesYear = selectedYear === 'all' || expYear === selectedYear;
    const matchesMonth = selectedMonth === 'all' || expMonth === selectedMonth;
    const matchesSearch =
      exp.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (exp.notes && exp.notes.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory =
      selectedCategory === 'all' || exp.category === selectedCategory;
    const matchesPayer =
      selectedPayer === 'all' || exp.payer === selectedPayer;
    const matchesZeroAmount = !onlyZeroAmount || exp.amount <= 0;
    return (
      matchesYear &&
      matchesMonth &&
      matchesSearch &&
      matchesCategory &&
      matchesPayer &&
      matchesZeroAmount
    );
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
    triggerLightHaptic(10);
    setCsvExported(true);
  };

  return (
    <div className="space-y-6">
      {/* Intestazione e Controlli */}
      <div className="ds-card p-4 sm:p-6 space-y-4">
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div className="min-w-0">
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
              <span className="sm:hidden">
                Scorri a destra per modificare, a sinistra per eliminare, oppure tocca ⋮
              </span>
              <span className="hidden sm:inline">
                Trascina una riga o fai doppio clic per modificare
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredExpenses.length === 0}
              className={`ds-btn-secondary min-h-10 px-3 py-2 text-xs shrink-0 disabled:opacity-50 ${
                csvExported ? 'border-emerald-500/40 text-emerald-700' : ''
              }`}
              title="Esporta spese filtrate in CSV"
              aria-label="Esporta CSV"
            >
              {csvExported ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span className="sm:hidden">{csvExported ? 'Fatto' : 'CSV'}</span>
              <span className="hidden sm:inline">{csvExported ? 'Esportato' : 'Esporta CSV'}</span>
            </button>
          </div>
        </div>

        {/* Barre di filtro */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3 pt-1">
          <div className="relative col-span-2 lg:col-span-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              aria-label="Cerca spese per negozio, articolo o nota"
              placeholder="Cerca per negozio, articolo o nota..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`ds-input w-full min-h-10 pl-9 ${searchTerm ? 'pr-9' : 'pr-3'} py-2 text-xs`}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                aria-label="Cancella ricerca"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 inline-flex items-center justify-center cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={selectedYear === 'all' ? 'all' : String(selectedYear)}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedYear(val === 'all' ? 'all' : Number(val));
              if (val === 'all') setSelectedMonth('all');
            }}
            aria-label="Filtra per anno"
            className="ds-input w-full min-h-10 px-3 py-2 text-xs"
          >
            <option value="all">Tutti gli anni</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>
                Anno {y}
              </option>
            ))}
          </select>

          <select
            value={selectedMonth === 'all' ? 'all' : String(selectedMonth)}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedMonth(val === 'all' ? 'all' : Number(val));
            }}
            aria-label="Filtra per mese"
            className="ds-input w-full min-h-10 px-3 py-2 text-xs"
          >
            <option value="all">Tutti i mesi</option>
            {EXPENSE_MONTH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            aria-label="Filtra per categoria"
            className="ds-input w-full min-h-10 px-3 py-2 text-xs"
          >
            <option value="all">Tutte le Categorie</option>
            {filterCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            value={selectedPayer}
            onChange={(e) => setSelectedPayer(e.target.value)}
            aria-label="Filtra per pagatore"
            className="ds-input w-full min-h-10 px-3 py-2 text-xs"
          >
            <option value="all">Tutti i Pagatori</option>
            <option value="user">Pagato da {profile.userName}</option>
            <option value="partner">Pagato da {profile.partnerName}</option>
          </select>
        </div>

        {filteredExpenses.length === 0 && expenses.length > 0 && selectedYear !== 'all' && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200/80 bg-stone-50/70 px-3 py-2 text-xs text-stone-700">
            <span>
              Nessuna spesa visibile per l&apos;anno <strong>{selectedYear}</strong> con i filtri attuali.
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedYear('all');
                setSelectedMonth('all');
              }}
              className="font-semibold text-orange-600 hover:underline cursor-pointer"
            >
              Mostra tutti gli anni
            </button>
          </div>
        )}

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
          <div className="ds-stagger divide-y divide-stone-100">
            {filteredExpenses.map((exp) => {
              const isExpanded = expandedId === exp.id;
              const hasDetails = Boolean((exp.items && exp.items.length > 0) || exp.receiptUrl);
              const payerName = exp.payer === 'user' ? profile.userName : profile.partnerName;
              const mobileMenuItems: RowActionMenuItem[] = [
                ...(hasDetails
                  ? [
                      {
                        id: 'details',
                        label: isExpanded ? 'Nascondi dettagli' : 'Vedi dettagli scontrino',
                        icon: <ChevronDown className={`w-4 h-4 ${isExpanded ? 'rotate-180' : ''}`} />,
                        onSelect: () => setExpandedId(isExpanded ? null : exp.id),
                      },
                    ]
                  : []),
                {
                  id: 'edit',
                  label: 'Modifica spesa',
                  icon: <Edit3 className="w-4 h-4 text-orange-600" />,
                  onSelect: () => onEditExpense(exp),
                },
                {
                  id: 'delete',
                  label: 'Elimina spesa',
                  icon: <Trash2 className="w-4 h-4" />,
                  tone: 'danger',
                  onSelect: () => setExpensePendingDelete(exp),
                },
              ];

              const hasSecondaryBadges =
                exp.source !== 'manual' ||
                Boolean(exp.linkedSources && exp.linkedSources.length > 1) ||
                Boolean(exp.recurringRuleId) ||
                Boolean(exp.tripId && tripNameById.get(exp.tripId)) ||
                exp.amount <= 0 ||
                exp.reconciliationStatus === 'zero_quarantine' ||
                exp.reconciliationStatus === 'possible_duplicate';
              const hasAnyTags = hasSecondaryBadges || hasDetails;
              const duplicateCandidate =
                exp.reconciliationStatus === 'possible_duplicate' && exp.duplicateCandidateId
                  ? expenseById.get(exp.duplicateCandidateId)
                  : undefined;

              return (
                <SwipeableActionRow
                  key={exp.id}
                  disabled={isExpanded || openMenuId === exp.id}
                  openSide={openSwipe?.id === exp.id ? openSwipe.side : null}
                  onOpenSideChange={(side) => {
                    setOpenSwipe((current) => {
                      if (side) return { id: exp.id, side };
                      return current?.id === exp.id ? null : current;
                    });
                  }}
                  leftAction={{
                    label: 'Modifica',
                    armedLabel: 'Modifica',
                    icon: <Edit3 className="w-5 h-5" />,
                    tone: 'primary',
                    onTrigger: () => onEditExpense(exp),
                  }}
                  rightAction={{
                    label: 'Elimina',
                    armedLabel: 'Elimina',
                    icon: <Trash2 className="w-5 h-5" />,
                    tone: 'danger',
                    onTrigger: () => setExpensePendingDelete(exp),
                  }}
                  contentClassName={`px-3.5 py-3 sm:px-4 sm:py-3.5 hover:bg-stone-50/50 transition-colors ${
                    exp.amount <= 0 ? 'border-l-4 border-amber-400 bg-amber-50/40' : ''
                  }`}
                >
                  <div
                    onDoubleClick={(e) => {
                      if (!(e.target as HTMLElement).closest('button')) {
                        onEditExpense(exp);
                      }
                    }}
                    title="Trascina o fai doppio clic per modificare questa spesa"
                  >
                    <div
                      className="flex items-start gap-3 cursor-pointer sm:cursor-auto"
                      onClick={(e) => {
                        if (
                          window.innerWidth < 640 &&
                          !(e.target as HTMLElement).closest('button')
                        ) {
                          onEditExpense(exp);
                        }
                      }}
                    >
                      <CategoryBadge category={exp.category} size="lg" className="mt-0.5" />

                      <div className="min-w-0 flex-1">
                        {/* Riga 1: Titolo a tutta larghezza libera + Importo + Azioni */}
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="min-w-0 flex-1 truncate text-[14px] sm:text-[15px] font-bold leading-snug text-stone-900">
                            {exp.title}
                          </h4>

                          <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
                            <span className="text-[14px] sm:text-base font-bold font-mono text-stone-900 tabular-nums">
                              {formatCurrency(exp.amount, exp.currency)}
                            </span>

                            <div className="sm:hidden shrink-0">
                              <RowActionMenu
                                label={`Azioni per ${exp.title}`}
                                items={mobileMenuItems}
                                onOpenChange={(open) => setOpenMenuId(open ? exp.id : null)}
                                triggerClassName="-mr-2 -my-1.5"
                              />
                            </div>

                            <div className="hidden sm:flex items-center justify-end gap-1">
                              {hasDetails && (
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
                                className="min-h-10 min-w-10 px-2 py-2 rounded-xl text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                                title="Modifica spesa"
                                aria-label={`Modifica ${exp.title}`}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
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

                        {/* Riga 2: Metadati compatti su smartphone, completi su desktop */}
                        <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-stone-500 sm:hidden">
                          <div className="min-w-0 truncate">
                            <time dateTime={exp.date}>{formatShortExpenseDate(exp.date)}</time>
                            {' · '}
                            <span className="font-medium text-stone-700">{payerName}</span>
                            {' · '}
                            <span>{exp.category}</span>
                          </div>
                          <span className="shrink-0 font-mono text-[11px] font-medium text-stone-500">
                            {formatCompactSplitLabel(exp)}
                          </span>
                        </div>

                        <div className="mt-1 hidden sm:flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-stone-500">
                          <time dateTime={exp.date} className="font-mono text-[11px]">
                            {exp.date}
                          </time>
                          <span aria-hidden="true">·</span>
                          <span>{exp.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            Pagato da <strong className="text-stone-700">{payerName}</strong>
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatSplitLabel(exp)}</span>
                        </div>

                        {/* Riga 3: Badge origine / stato / dettagli scontrino */}
                        {hasAnyTags && (
                          <div className={hasSecondaryBadges ? 'mt-1.5' : 'mt-1.5 sm:hidden'}>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {exp.source !== 'manual' && (
                                <SourceBadge source={exp.source} compact />
                              )}
                              {exp.linkedSources && exp.linkedSources.length > 1 && (
                                <span
                                  title={`Riconciliata su ${exp.linkedSources.length} canali`}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700"
                                >
                                  <GitMerge className="h-3 w-3" />
                                  {exp.linkedSources.length} fonti
                                </span>
                              )}
                              {exp.recurringRuleId && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-indigo-500/25 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                                  <RefreshCw className="h-2.5 w-2.5" />
                                  Fissa
                                </span>
                              )}
                              {exp.tripId && tripNameById.get(exp.tripId) && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-orange-500/25 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
                                  <Plane className="h-2.5 w-2.5" />
                                  {tripNameById.get(exp.tripId)}
                                </span>
                              )}
                              {(exp.amount <= 0 || exp.reconciliationStatus === 'zero_quarantine') && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-500/25 bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                                  <AlertTriangle className="h-3 w-3" />
                                  Quarantena 0 €
                                </span>
                              )}
                              {exp.reconciliationStatus === 'possible_duplicate' && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                  <AlertTriangle className="h-3 w-3" />
                                  Possibile doppione
                                </span>
                              )}
                              {hasDetails && (
                                <button
                                  type="button"
                                  data-no-swipe="true"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedId(isExpanded ? null : exp.id);
                                  }}
                                  className="sm:hidden inline-flex items-center gap-1 rounded-md border border-orange-500/25 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 cursor-pointer"
                                >
                                  <ChevronDown
                                    className={`h-3 w-3 transition-transform ${
                                      isExpanded ? 'rotate-180' : ''
                                    }`}
                                    aria-hidden="true"
                                  />
                                  <span>{isExpanded ? 'Nascondi scontrino' : 'Scontrino'}</span>
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {exp.notes && (
                          <p className="mt-1 break-words text-[11px] sm:text-xs text-stone-500 line-clamp-1 sm:line-clamp-2">
                            {exp.notes}
                          </p>
                        )}

                        {exp.reconciliationStatus === 'possible_duplicate' &&
                          (onMergeDuplicateExpense || onDismissDuplicateExpense) && (
                            <div
                              data-no-swipe="true"
                              onClick={(e) => e.stopPropagation()}
                              className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-900"
                            >
                              <span className="min-w-0 flex-1">
                                {duplicateCandidate
                                  ? `Simile a “${duplicateCandidate.title}” (${duplicateCandidate.date}). È lo stesso pagamento?`
                                  : 'Possibile movimento duplicato da notifica.'}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {duplicateCandidate && onMergeDuplicateExpense && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onMergeDuplicateExpense(exp.id, duplicateCandidate.id);
                                    }}
                                    className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 transition-colors cursor-pointer"
                                  >
                                    <GitMerge className="h-3 w-3" />
                                    Unisci
                                  </button>
                                )}
                                {onDismissDuplicateExpense && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDismissDuplicateExpense(exp.id);
                                    }}
                                    className="inline-flex items-center gap-1 rounded-lg border border-amber-500/35 bg-white/80 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-white transition-colors cursor-pointer"
                                  >
                                    <Check className="h-3 w-3" />
                                    {duplicateCandidate ? 'Mantieni separate' : 'Conferma'}
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="ds-expand-in mt-3 pt-3 border-t border-stone-100 bg-stone-50/50 -mx-3.5 sm:-mx-4 -mb-3 sm:-mb-3.5 p-4 rounded-b-xl space-y-3">
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
                </SwipeableActionRow>
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
            ? `“${expensePendingDelete.title}” (${formatCurrency(
                expensePendingDelete.amount,
                expensePendingDelete.currency
              )} · ${expensePendingDelete.date} · pagata da ${
                expensePendingDelete.payer === 'user' ? profile.userName : profile.partnerName
              }) verrà rimossa dal registro. Potrai ripristinarla subito dall’avviso in basso.`
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
