import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Check, Filter, Flag, Mail, Sparkles, Users, Wallet } from 'lucide-react';
import { CoupleProfile, Expense } from '../../types';
import { ModalShell } from '../ui/ModalShell';

const MONTH_OPTIONS = [
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

export function formatIsoDateIt(isoDate?: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '';
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

interface StartingPointModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: CoupleProfile;
  allExpenses: Expense[];
  onSaveProfile: (updated: Partial<CoupleProfile>) => void;
  onSaveAndOpenGmail: (updated: Partial<CoupleProfile>) => void;
}

export const StartingPointModal: React.FC<StartingPointModalProps> = ({
  isOpen,
  onClose,
  profile,
  allExpenses,
  onSaveProfile,
  onSaveAndOpenGmail,
}) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentMonthStart = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;

  const prevMonthDate = new Date(currentYear, currentMonth - 2, 1);
  const prevMonthStart = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
  const currentYearStart = `${currentYear}-01-01`;

  const [startDateDraft, setStartDateDraft] = useState<string>(
    profile.trackingStartDate || ''
  );
  const [userName, setUserName] = useState(profile.userName || 'Partner 1');
  const [partnerName, setPartnerName] = useState(profile.partnerName || 'Partner 2');
  const [monthlyBudget, setMonthlyBudget] = useState(String(profile.monthlyBudget || 2800));

  useEffect(() => {
    if (!isOpen) return;
    setStartDateDraft(profile.trackingStartDate || '');
    setUserName(profile.userName || 'Partner 1');
    setPartnerName(profile.partnerName || 'Partner 2');
    setMonthlyBudget(String(profile.monthlyBudget || 2800));
  }, [isOpen, profile.trackingStartDate, profile.userName, profile.partnerName, profile.monthlyBudget]);

  const parsedStartParts = useMemo(() => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDateDraft);
    if (!match) {
      return { year: currentYear, month: currentMonth };
    }
    return { year: Number(match[1]), month: Number(match[2]) };
  }, [startDateDraft, currentYear, currentMonth]);

  const selectableYears = useMemo(() => {
    const set = new Set<number>([
      currentYear + 1,
      currentYear,
      currentYear - 1,
      currentYear - 2,
      currentYear - 3,
      currentYear - 4,
    ]);
    for (const exp of allExpenses) {
      const y = Number(exp.date.slice(0, 4));
      if (Number.isInteger(y) && y >= 2000 && y <= 2100) set.add(y);
    }
    if (parsedStartParts.year >= 2000 && parsedStartParts.year <= 2100) {
      set.add(parsedStartParts.year);
    }
    return [...set].sort((a, b) => b - a);
  }, [allExpenses, currentYear, parsedStartParts.year]);

  const { includedCount, excludedCount } = useMemo(() => {
    if (!startDateDraft) {
      return { includedCount: allExpenses.length, excludedCount: 0 };
    }
    let included = 0;
    for (const exp of allExpenses) {
      if (exp.date >= startDateDraft) included += 1;
    }
    return {
      includedCount: included,
      excludedCount: allExpenses.length - included,
    };
  }, [allExpenses, startDateDraft]);

  const buildProfilePatch = (): Partial<CoupleProfile> => {
    const parsedBudget = Number(monthlyBudget.replace(',', '.'));
    const validBudget =
      Number.isFinite(parsedBudget) && parsedBudget > 0
        ? Math.round(parsedBudget * 100) / 100
        : profile.monthlyBudget;

    return {
      userName: userName.trim().slice(0, 100) || 'Partner 1',
      partnerName: partnerName.trim().slice(0, 100) || 'Partner 2',
      monthlyBudget: validBudget,
      trackingStartDate: startDateDraft.trim() ? startDateDraft.trim() : undefined,
    };
  };

  const handleSaveOnly = () => {
    onSaveProfile(buildProfilePatch());
    onClose();
  };

  const handleSaveAndScan = () => {
    onSaveAndOpenGmail(buildProfilePatch());
  };

  const presets = [
    {
      id: 'curr-month',
      label: '1° di questo mese',
      sub: formatIsoDateIt(currentMonthStart),
      value: currentMonthStart,
    },
    {
      id: 'prev-month',
      label: '1° del mese scorso',
      sub: formatIsoDateIt(prevMonthStart),
      value: prevMonthStart,
    },
    {
      id: 'curr-year',
      label: `1° Gennaio ${currentYear}`,
      sub: formatIsoDateIt(currentYearStart),
      value: currentYearStart,
    },
    {
      id: 'all',
      label: 'Senza limite',
      sub: 'Tutto lo storico',
      value: '',
    },
  ];

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <button
        type="button"
        onClick={onClose}
        className="ds-btn-secondary min-h-10 px-4 text-xs"
      >
        Annulla
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSaveOnly}
          className="ds-btn-secondary min-h-10 px-4 text-xs"
        >
          <Check className="w-3.5 h-3.5 text-emerald-600" />
          <span>Salva Punto di Partenza</span>
        </button>
        <button
          type="button"
          onClick={handleSaveAndScan}
          className="ds-btn-primary min-h-10 px-4 text-xs"
        >
          <Mail className="w-3.5 h-3.5" />
          <span>Salva e Scansiona Gmail</span>
        </button>
      </div>
    </div>
  );

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Modalità di Inizio · Punto di Partenza"
      subtitle="Scegli da quando iniziare i conti della coppia ed evita mezzi mesi o vecchie ricevute Gmail"
      icon={Flag}
      maxWidth="lg"
      mobileBottomSheet
      footer={footer}
    >
      <div className="p-4 sm:p-6 space-y-5 text-xs">
        {/* Step 1: Data di inizio rapida */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-stone-800 flex items-center gap-1.5 text-[13px]">
              <Calendar className="w-4 h-4 text-orange-600" />
              Da quale data vuoi far partire il bilancio?
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {presets.map((preset) => {
              const active = startDateDraft === preset.value;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setStartDateDraft(preset.value)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-all cursor-pointer ${
                    active
                      ? 'border-orange-500 bg-orange-50/60 text-orange-900 shadow-xs'
                      : 'border-stone-200 hover:bg-stone-50 text-stone-700'
                  }`}
                >
                  <span className="font-bold block leading-snug">{preset.label}</span>
                  <span className="text-[11px] font-mono text-stone-500 block mt-0.5">
                    {preset.sub}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Selezione rapida Mese/Anno oppure data esatta */}
        <div className="ds-subcard p-3.5 space-y-3">
          <span className="font-bold text-stone-800 block">
            Oppure scegli Anno/Mese iniziale o una data precisa
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label
                htmlFor="start-point-year"
                className="block text-[11px] font-semibold text-stone-600 mb-1"
              >
                Anno iniziale
              </label>
              <select
                id="start-point-year"
                value={parsedStartParts.year}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  const m = String(parsedStartParts.month).padStart(2, '0');
                  setStartDateDraft(`${y}-${m}-01`);
                }}
                className="ds-input w-full px-2.5 py-2 text-xs min-h-10"
              >
                {selectableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="start-point-month"
                className="block text-[11px] font-semibold text-stone-600 mb-1"
              >
                Dal 1° del mese
              </label>
              <select
                id="start-point-month"
                value={parsedStartParts.month}
                onChange={(e) => {
                  const m = String(Number(e.target.value)).padStart(2, '0');
                  setStartDateDraft(`${parsedStartParts.year}-${m}-01`);
                }}
                className="ds-input w-full px-2.5 py-2 text-xs min-h-10"
              >
                {MONTH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="start-point-exact-date"
                className="block text-[11px] font-semibold text-stone-600 mb-1"
              >
                Giorno esatto
              </label>
              <input
                id="start-point-exact-date"
                type="date"
                min="2000-01-01"
                max="2100-12-31"
                value={startDateDraft}
                onChange={(e) => setStartDateDraft(e.target.value)}
                className="ds-input w-full px-2.5 py-2 text-xs font-mono min-h-10"
              />
            </div>
          </div>
        </div>

        {/* Anteprima impatto globale + Gmail */}
        <div className="rounded-xl border border-orange-500/25 bg-orange-50/40 p-3.5 space-y-2">
          <div className="flex items-center gap-2 font-bold text-stone-800">
            <Filter className="w-4 h-4 text-orange-600 shrink-0" />
            <span>
              {startDateDraft
                ? `Punto Zero attivo dal ${formatIsoDateIt(startDateDraft)}`
                : 'Nessun limite di data (Tutto lo storico attivo)'}
            </span>
          </div>
          <p className="text-[11px] text-stone-600 leading-relaxed">
            {startDateDraft ? (
              <>
                Dashboard, pareggio saldo, grafici e elenco spese mostreranno solo le{' '}
                <strong className="text-stone-900">{includedCount}</strong> spese dal{' '}
                <strong className="font-mono">{formatIsoDateIt(startDateDraft)}</strong> in poi
                {excludedCount > 0
                  ? ` (escludendo ${excludedCount} spese precedenti dai conteggi, senza cancellarle dal database)`
                  : ''}
                . Inoltre Gmail cercherà automaticamente ricevute solo da questa data in avanti.
              </>
            ) : (
              <>
                Verranno conteggiate tutte le <strong className="text-stone-900">{allExpenses.length}</strong>{' '}
                spese salvate nel database e in Gmail potrai scegliere liberamente il periodo di scansione.
              </>
            )}
          </p>
        </div>

        {/* Step 3: Riepilogo rapido coppia & budget */}
        <div className="pt-1 border-t border-stone-100 space-y-3">
          <span className="font-bold text-stone-700 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-orange-600" />
            Riferimenti rapidi della coppia (opzionale)
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label
                htmlFor="start-point-user-name"
                className="block text-[11px] font-semibold text-stone-600 mb-1"
              >
                <Users className="w-3 h-3 inline mr-1 text-stone-400" />
                Partner 1
              </label>
              <input
                id="start-point-user-name"
                type="text"
                maxLength={100}
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="ds-input w-full px-3 py-2 text-xs min-h-10"
              />
            </div>

            <div>
              <label
                htmlFor="start-point-partner-name"
                className="block text-[11px] font-semibold text-stone-600 mb-1"
              >
                Partner 2
              </label>
              <input
                id="start-point-partner-name"
                type="text"
                maxLength={100}
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                className="ds-input w-full px-3 py-2 text-xs min-h-10"
              />
            </div>

            <div>
              <label
                htmlFor="start-point-budget"
                className="block text-[11px] font-semibold text-stone-600 mb-1"
              >
                <Wallet className="w-3 h-3 inline mr-1 text-stone-400" />
                Budget Mensile ({profile.currency})
              </label>
              <input
                id="start-point-budget"
                type="number"
                min="1"
                step="any"
                value={monthlyBudget}
                onChange={(e) => setMonthlyBudget(e.target.value)}
                className="ds-input w-full px-3 py-2 text-xs font-mono min-h-10"
              />
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
};
