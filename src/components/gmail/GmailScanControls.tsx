import React from 'react';
import { AlertTriangle, Calendar, RefreshCw, Sparkles } from 'lucide-react';
import {
  formatDateItShort,
  type GmailScanFreshnessStatus,
  type SmartGmailProposal,
} from '../../services/gmail-scan-history';
import type { GmailSearchMode } from '../../types';

export type { GmailSearchMode };

interface GmailScanControlsProps {
  userEmail?: string;
  isSyncing: boolean;
  hasPendingPage: boolean;
  searchMode: GmailSearchMode;
  lookbackDays: number;
  customStartDate: string;
  trackingStartDate?: string;
  effectiveStartDate?: string;
  smartProposal?: SmartGmailProposal | null;
  isSmartOverrideDisabled?: boolean;
  onToggleSmartOverride?: () => void;
  freshness?: GmailScanFreshnessStatus | null;
  onScan: () => void;
  onSignOut: () => void;
  onChangeSearchMode: (mode: GmailSearchMode) => void;
  onChangeLookbackDays: (days: number) => void;
  onChangeCustomStartDate: (date: string) => void;
  onOpenStartingPoint?: () => void;
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
  smartProposal,
  isSmartOverrideDisabled = false,
  onToggleSmartOverride,
  freshness,
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
      <div className="ds-subcard p-3 space-y-2.5">
        {trackingStartDate && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-orange-500/25 bg-orange-50/50 px-2.5 py-1.5 text-[11px]">
            <span className="font-semibold text-stone-800 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-orange-600 shrink-0" />
              <span>
                Punto Zero attivo dal <strong className="font-mono">{formatDateItShort(trackingStartDate)}</strong>
              </span>
            </span>
            {onOpenStartingPoint && (
              <button
                type="button"
                onClick={onOpenStartingPoint}
                className="text-orange-600 hover:underline font-semibold shrink-0 cursor-pointer"
              >
                Modifica
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
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
            <option value="days:365">Ultimo anno (365 giorni)</option>
          </select>
        </div>

        {searchMode === 'custom_date' && (
          <div className="flex items-center justify-between gap-3 text-xs">
            <label htmlFor="gmail-custom-start-date" className="font-medium text-stone-600">
              Inizia dalle ricevute dal:
            </label>
            <input
              id="gmail-custom-start-date"
              type="date"
              min={trackingStartDate || '2000-01-01'}
              max="2100-12-31"
              value={customStartDate}
              disabled={isSyncing}
              onChange={(event) => onChangeCustomStartDate(event.target.value)}
              className="ds-input px-2.5 py-1 text-xs font-mono"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-stone-500 leading-relaxed">
          <span>
            {effectiveStartDate
              ? trackingStartDate
                ? `Scansione effettiva dal ${formatDateItShort(effectiveStartDate)}: le email precedenti al Punto Zero (${formatDateItShort(trackingStartDate)}) restano sempre escluse.`
                : `Verranno incluse solo le email e ricevute dal ${formatDateItShort(effectiveStartDate)} in poi, evitando acquisti già controllati.`
              : 'Cerca tutte le email con parole chiave negli ultimi giorni selezionati.'}{' '}
            A Gemini invia solo il testo delle candidate, mai gli allegati.
          </span>
        </div>

        {smartProposal?.shouldApply && (
          <div
            role="status"
            className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-[11px] text-blue-900 space-y-1.5"
          >
            <div className="flex items-start gap-2">
              <Sparkles className="w-3.5 h-3.5 text-orange-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="min-w-0 flex-1 leading-relaxed">
                {!isSmartOverrideDisabled ? (
                  smartProposal.alreadyScannedToday ? (
                    <>
                      Gmail già controllato fino ad oggi (
                      <strong className="font-mono">
                        {formatDateItShort(smartProposal.coveredUntilDate)}
                      </strong>
                      ). Ho impostato la partenza su oggi per evitare di ripescare le vecchie email.
                    </>
                  ) : (
                    <>
                      Scansione precedente completata fino al{' '}
                      <strong className="font-mono">
                        {formatDateItShort(smartProposal.coveredUntilDate)}
                      </strong>{' '}
                      ({smartProposal.daysSinceLastScan}{' '}
                      {smartProposal.daysSinceLastScan === 1 ? 'giorno fa' : 'giorni fa'}). Data
                      impostata automaticamente dal{' '}
                      <strong className="font-mono">
                        {formatDateItShort(smartProposal.proposedStartDate)}
                      </strong>{' '}
                      per evitare il ripescaggio di {smartProposal.savedDays} giorni già scansionati.
                    </>
                  )
                ) : (
                  <>
                    Riscansione completa attiva dall’inizio periodo (
                    <strong className="font-mono">
                      {formatDateItShort(smartProposal.requestedStartDate)}
                    </strong>
                    ).
                  </>
                )}
              </div>
            </div>
            {onToggleSmartOverride && (
              <div className="pl-5">
                <button
                  type="button"
                  disabled={isSyncing}
                  onClick={onToggleSmartOverride}
                  className="font-semibold text-orange-600 hover:underline cursor-pointer disabled:opacity-50"
                >
                  {isSmartOverrideDisabled
                    ? `Ripristina data consigliata (${formatDateItShort(smartProposal.proposedStartDate)})`
                    : `Scansiona comunque tutto il periodo (dal ${formatDateItShort(smartProposal.requestedStartDate)})`}
                </button>
              </div>
            )}
          </div>
        )}

        {freshness?.isStale && (
          <div
            role="status"
            className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 flex items-start gap-2"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
            <span className="leading-relaxed">
              Non esegui una scansione completa da{' '}
              <strong>{freshness.daysSinceLastScan} giorni</strong> (ultimo controllo:{' '}
              <span className="font-mono">{formatDateItShort(freshness.lastScannedDate)}</span>).
              Potrebbero mancare ricevute nel frattempo.
            </span>
          </div>
        )}
      </div>
    </>
  );
};
