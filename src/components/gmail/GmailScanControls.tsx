import React from 'react';
import { RefreshCw } from 'lucide-react';

interface GmailScanControlsProps {
  userEmail?: string;
  isSyncing: boolean;
  hasPendingPage: boolean;
  lookbackDays: number;
  onScan: () => void;
  onSignOut: () => void;
  onChangeLookbackDays: (days: number) => void;
}

/** Account connesso, avvio/ripresa scansione e scelta del periodo di ricerca. */
export const GmailScanControls: React.FC<GmailScanControlsProps> = ({
  userEmail,
  isSyncing,
  hasPendingPage,
  lookbackDays,
  onScan,
  onSignOut,
  onChangeLookbackDays,
}) => (
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
          disabled={isSyncing}
          className="px-2.5 py-1.5 text-[11px] font-semibold text-orange-700 bg-orange-100/70 hover:bg-orange-200/70 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
        >
          <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>
            {hasPendingPage
              ? 'Riprendi scansione'
              : lookbackDays === 30
                ? 'Scansiona mese intero'
                : 'Scansiona periodo'}
          </span>
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

    {/* Lookback */}
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 px-1 text-xs">
        <label htmlFor="gmail-lookback-days" className="font-medium text-stone-600">
          Periodo di ricerca
        </label>
        <select
          id="gmail-lookback-days"
          value={lookbackDays}
          disabled={isSyncing}
          onChange={(event) => onChangeLookbackDays(Number(event.target.value))}
          className="ds-input px-2.5 py-1 text-xs"
        >
          <option value={7}>Ultimi 7 giorni</option>
          <option value={30}>Ultimo mese (30 giorni)</option>
          <option value={90}>Ultimi 90 giorni</option>
        </select>
      </div>
      <p className="px-1 text-[10px] text-stone-500">
        Cerca tutte le email con parole chiave nel periodo scelto. I gruppi da 30 sono solo tecnici: la scansione prosegue automaticamente fino all’ultima pagina. A Gemini invia solo il testo delle candidate, mai gli allegati.
      </p>
    </div>
  </>
);
