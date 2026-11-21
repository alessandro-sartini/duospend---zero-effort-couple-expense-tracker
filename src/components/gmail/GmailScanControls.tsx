import React from 'react';
import { Calendar, RefreshCw } from 'lucide-react';

export type GmailSearchMode =
  | 'tracking_start'
  | 'month_start'
  | 'prev_month_start'
  | 'year_start'
  | 'custom_date'
  | 'days';

interface GmailScanControlsProps {
  userEmail?: string;
  isSyncing: boolean;
  hasPendingPage: boolean;
  searchMode: GmailSearchMode;
  lookbackDays: number;
  customStartDate: string;
  trackingStartDate?: string;
  effectiveStartDate?: string;
  onScan: () => void;
  onSignOut: () => void;
  onChangeSearchMode: (mode: GmailSearchMode) => void;
  onChangeLookbackDays: (days: number) => void;
  onChangeCustomStartDate: (date: string) => void;
  onOpenStartingPoint?: () => void;
}

function formatDateItShort(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Account connesso, avvio/ripresa scansione e scelta del periodo di ricerca. */
export const GmailScanControls: React.FC<GmailScanControlsProps> = ({
  userEmail,
  isSyncing,
  hasPendingPage,
  searchMode,
  lookbackDays,
  customStartDate,
  trackingStartDate,
  effectiveStartDate,
  onScan,
  onSignOut,
  onChangeSearchMode,
  onChangeLookbackDays,
  onChangeCustomStartDate,
  onOpenStartingPoint,
}) => {
  const selectValue = searchMode === 'days' ? `days:${lookbackDays}` : searchMode;

  const handleSelectChange = (raw: string) => {
    if (raw.startsWith('days:')) {
      const days = Number(raw.slice(5));
      onChangeSearchMode('days');
      onChangeLookbackDays(days);
      return;
    }
    onChangeSearchMode(raw as GmailSearchMode);
  };

  const scanButtonLabel = hasPendingPage
    ? 'Riprendi scansione'
    : effectiveStartDate
      ? `Scansiona dal ${formatDateItShort(effectiveStartDate)}`
      : lookbackDays === 30
        ? 'Scansiona mese intero'
        : 'Scansiona periodo';

  return (
    <>
      {/* Account Connesso */}
      <div className="ds-subcard flex items-center justify-between gap-2 p-3 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="font-semibold text-stone-800 truncate max-w-[200px]">
            {userEmail || 'Account Google Connesso'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onScan}
            disabled={isSyncing || (searchMode === 'custom_date' && !customStartDate)}
            className="px-2.5 py-1.5 text-[11px] font-semibold text-orange-700 bg-orange-100/70 hover:bg-orange-200/70 rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{scanButtonLabel}</span>
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="text-[11px] text-stone-400 hover:text-stone-700 underline cursor-pointer"
          >
            Disconnetti
          </button>
        </div>
      </div>

      {/* Periodo di ricerca / Data di inizio */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1 text-xs">
          <label htmlFor="gmail-lookback-days" className="font-medium text-stone-600 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-orange-600" />
            <span>Periodo di ricerca</span>
          </label>
          <select
            id="gmail-lookback-days"
            value={selectValue}
            disabled={isSyncing}
            onChange={(event) => handleSelectChange(event.target.value)}
            className="ds-input px-2.5 py-1.5 text-xs"
          >
            {trackingStartDate && (
              <option value="tracking_start">
                Dal Punto di Partenza ({formatDateItShort(trackingStartDate)})
              </option>
            )}
            <option value="month_start">Dal 1° di questo mese</option>
            <option value="prev_month_start">Dal 1° del mese scorso</option>
            <option value="year_start">Dall’inizio dell’anno (1° Gennaio)</option>
            <option value="custom_date">Da una data precisa…</option>
            <option value="days:7">Ultimi 7 giorni</option>
            <option value="days:30">Ultimi 30 giorni</option>
            <option value="days:90">Ultimi 90 giorni</option>
            <option value="days:180">Ultimi 180 giorni</option>
          </select>
        </div>

        {searchMode === 'custom_date' && (
          <div className="flex items-center justify-between gap-3 px-1 text-xs">
            <label htmlFor="gmail-custom-start-date" className="font-medium text-stone-600">
              Inizia dalle ricevute dal:
            </label>
            <input
              id="gmail-custom-start-date"
              type="date"
              min="2000-01-01"
              max="2100-12-31"
              value={customStartDate}
              disabled={isSyncing}
              onChange={(event) => onChangeCustomStartDate(event.target.value)}
              className="ds-input px-2.5 py-1 text-xs font-mono"
            />
          </div>
        )}

        <div className="px-1 flex flex-wrap items-center justify-between gap-2 text-[10px] text-stone-500">
          <span>
            {effectiveStartDate
              ? `Verranno incluse solo le email e ricevute dal ${formatDateItShort(effectiveStartDate)} in poi, evitando acquisti dei mesi precedenti.`
              : 'Cerca tutte le email con parole chiave negli ultimi giorni selezionati.'}{' '}
            A Gemini invia solo il testo delle candidate, mai gli allegati.
          </span>
          {onOpenStartingPoint && (
            <button
              type="button"
              onClick={onOpenStartingPoint}
              className="text-orange-600 hover:underline font-semibold shrink-0 cursor-pointer"
            >
              {trackingStartDate ? 'Cambia Punto Zero' : 'Imposta Punto di Partenza'}
            </button>
          )}
        </div>
      </div>
    </>
  );
};
