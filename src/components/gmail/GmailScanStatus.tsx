import React from 'react';
import { AlertCircle } from 'lucide-react';
import { InlineLoader } from '../ui/Loader';
import type { GmailScanStats } from './types';

interface GmailScanStatusProps {
  isSyncing: boolean;
  detectedCount: number;
  scanProgress: { page: number; total: number } | null;
  stopRequested: boolean;
  onRequestStop: () => void;
  error: string | null;
  scanStats: GmailScanStats | null;
  scanStatus: 'complete' | 'stopped' | 'error' | null;
}

export const GmailScanStatus: React.FC<GmailScanStatusProps> = ({
  isSyncing,
  detectedCount,
  scanProgress,
  stopRequested,
  onRequestStop,
  error,
  scanStats,
  scanStatus,
}) => {
  return (
    <>
      {isSyncing && (
        <InlineLoader
          compact={detectedCount > 0}
          title={
            scanProgress
              ? `Analisi batch ${scanProgress.page}${scanProgress.total ? ` · ${scanProgress.total} email candidate nel periodo` : ''}`
              : 'Ricerca ricevute ed ordini recenti in Gmail...'
          }
          subtitle="Scansione completa del periodo, in batch tecnici da 30 email"
        >
          <div className="space-y-1 text-center pt-1">
            <button
              type="button"
              disabled={stopRequested}
              onClick={onRequestStop}
              className="ds-btn-secondary min-h-10 px-4 text-xs"
            >
              {stopRequested
                ? 'La scansione si fermerà dopo questo batch…'
                : 'Ferma dopo questo batch'}
            </button>
            <p className="text-[10px] text-stone-500">
              Chiudere questa finestra non interrompe la scansione.
            </p>
          </div>
        </InlineLoader>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Avviso Sincronizzazione</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {scanStats && (
        <div className="ds-subcard p-3 text-[11px] text-stone-600 leading-relaxed">
          Gmail stima circa {scanStats.candidateCount} email per il periodo; DuoSpend ha ricevuto{' '}
          {scanStats.messagesProcessed} risultati e ne ha analizzati {scanStats.messagesAnalyzed} con Gemini.
          Il totale Gmail è una stima e i batch da 30 non limitano la scansione.
          {scanStats.failedMessageReads > 0 &&
            ` Non è stato possibile leggere ${scanStats.failedMessageReads} email.`}
          {scanStats.skippedNonTransactionalCount > 0 &&
            ` Escluse localmente ${scanStats.skippedNonTransactionalCount} newsletter generiche.`}
          {scanStats.skippedImportedCount > 0 &&
            ` Saltate ${scanStats.skippedImportedCount} email già importate.`}
          {scanStats.skippedIgnoredCount > 0 &&
            ` Escluse ${scanStats.skippedIgnoredCount} email ignorate.`}
          {scanStats.skippedScannedCount > 0 &&
            ` Riutilizzati i risultati di ${scanStats.skippedScannedCount} email già analizzate negli ultimi 30 giorni.`}
          {scanStats.suppressedLowConfidenceCount > 0 &&
            ` Escluse automaticamente ${scanStats.suppressedLowConfidenceCount} email con confidenza spesa sotto il 40%.`}
          {scanStats.recurringRuleMatchCount > 0 &&
            ` Applicate ${scanStats.recurringRuleMatchCount} regole ricorrenti senza chiamare Gemini.`}
          {scanStats.hasMoreCandidates &&
            ` Gmail ha altre pagine: restano circa ${Math.max(0, scanStats.candidateCount - scanStats.messagesProcessed)} risultati secondo la stima.`}
        </div>
      )}

      {!isSyncing && scanStatus === 'complete' && scanStats && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800"
        >
          Scansione completata: Gmail non segnala altre pagine. Controlla {detectedCount} spese rilevate prima di importare.
        </p>
      )}

      {!isSyncing && scanStatus === 'stopped' && scanStats && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900"
        >
          Scansione fermata dopo il batch {scanStats.batchesProcessed}: ricevuti {scanStats.messagesProcessed} risultati. Restano altre pagine; tocca “Riprendi scansione” per continuare. La stima Gmail può variare.
        </p>
      )}

      {!isSyncing && scanStatus === 'error' && scanStats?.hasMoreCandidates && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900"
        >
          Scansione interrotta da un errore: alcuni risultati restano da elaborare. Tocca “Riprendi scansione” per riprovare dalla pagina non completata.
        </p>
      )}
    </>
  );
};
