import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Mail,
  MessageSquareText,
  Plus,
  Receipt,
  RefreshCw,
} from 'lucide-react';
import { SwipeableNotificationPill } from '../ui/SwipeableNotificationPill';
import { useOverlayBackHandler } from '../../hooks/useOverlayBackHandler';
import {
  type DismissedBackgroundNotifications,
  type GmailBackgroundStatus,
  type ReceiptBackgroundStatus,
  getGmailNotificationSignature,
  getReceiptNotificationSignature,
  loadDismissedBackgroundNotifications,
  saveDismissedBackgroundNotifications,
} from './backgroundNotifications';

export type { GmailBackgroundStatus, ReceiptBackgroundStatus };

interface QuickActionsFabProps {
  isAnyModalOpen: boolean;
  isGmailSyncOpen: boolean;
  isScanReceiptOpen: boolean;
  gmailBgState: GmailBackgroundStatus;
  receiptBgState: ReceiptBackgroundStatus;
  onOpenScanReceipt: () => void;
  onOpenAddExpense: () => void;
  onOpenNotificationSync: () => void;
  onOpenGmailSync: () => void;
}

export const QuickActionsFab: React.FC<QuickActionsFabProps> = ({
  isAnyModalOpen,
  isGmailSyncOpen,
  isScanReceiptOpen,
  gmailBgState,
  receiptBgState,
  onOpenScanReceipt,
  onOpenAddExpense,
  onOpenNotificationSync,
  onOpenGmailSync,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const fabButtonRef = useRef<HTMLButtonElement>(null);
  const [dismissedNotifications, setDismissedNotifications] =
    useState<DismissedBackgroundNotifications>(loadDismissedBackgroundNotifications);

  useEffect(() => {
    if (isAnyModalOpen) {
      setIsMenuOpen(false);
    }
  }, [isAnyModalOpen]);

  useOverlayBackHandler(isMenuOpen && !isAnyModalOpen, () => setIsMenuOpen(false));

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
        fabButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMenuOpen]);

  const gmailSignature = getGmailNotificationSignature(gmailBgState);
  const receiptSignature = getReceiptNotificationSignature(receiptBgState);

  useEffect(() => {
    setDismissedNotifications((prev) => {
      let changed = false;
      const next: DismissedBackgroundNotifications = { ...prev };
      if (!gmailSignature && next.gmail) {
        delete next.gmail;
        changed = true;
      }
      if (!receiptSignature && next.receipt) {
        delete next.receipt;
        changed = true;
      }
      if (!changed) return prev;
      saveDismissedBackgroundNotifications(next);
      return next;
    });
  }, [gmailSignature, receiptSignature]);

  const dismissGmailNotification = () => {
    if (!gmailSignature) return;
    setDismissedNotifications((prev) => {
      const next: DismissedBackgroundNotifications = { ...prev, gmail: gmailSignature };
      saveDismissedBackgroundNotifications(next);
      return next;
    });
  };

  const dismissReceiptNotification = () => {
    if (!receiptSignature) return;
    setDismissedNotifications((prev) => {
      const next: DismissedBackgroundNotifications = { ...prev, receipt: receiptSignature };
      saveDismissedBackgroundNotifications(next);
      return next;
    });
  };

  const showGmailPill =
    !isGmailSyncOpen && Boolean(gmailSignature) && dismissedNotifications.gmail !== gmailSignature;
  const showReceiptPill =
    !isScanReceiptOpen &&
    Boolean(receiptSignature) &&
    dismissedNotifications.receipt !== receiptSignature;
  const showStatusPills = showGmailPill || showReceiptPill;

  const gmailSavedCount = gmailBgState.detectedCount + gmailBgState.reviewCount;
  const hasHiddenSavedTask =
    (Boolean(gmailSignature) && dismissedNotifications.gmail === gmailSignature) ||
    (Boolean(receiptSignature) && dismissedNotifications.receipt === receiptSignature);

  const triggerAction = (callback: () => void) => {
    setIsMenuOpen(false);
    callback();
  };

  return (
    <>
      {showStatusPills && (
        <div
          aria-live="polite"
          className="fixed top-[calc(4.1rem+env(safe-area-inset-top,0px))] lg:top-[calc(4.5rem+env(safe-area-inset-top,0px))] right-3 left-3 sm:left-auto sm:right-6 z-20 pointer-events-none flex flex-col items-end gap-2"
        >
          {showGmailPill && (
            <SwipeableNotificationPill
              key={`gmail-${gmailSignature}`}
              onClick={onOpenGmailSync}
              onDismiss={dismissGmailNotification}
              dismissLabel="Nascondi notifica Gmail (la ricerca resta salvata)"
              className={
                gmailBgState.isSyncing
                  ? 'border-sky-400/60 bg-blue-50 text-sky-700'
                  : gmailBgState.detectedCount > 0
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-amber-300 bg-amber-50 text-amber-900'
              }
            >
              {gmailBgState.isSyncing ? (
                <>
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500" />
                  </span>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <Mail className="w-3.5 h-3.5 opacity-80 shrink-0" />
                  <span className="truncate">
                    {gmailBgState.scanProgress?.page
                      ? `Scansione Gmail (lotto ${gmailBgState.scanProgress.page})...`
                      : 'Scansione Gmail in corso...'}
                  </span>
                </>
              ) : gmailBgState.detectedCount > 0 ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <Mail className="w-3.5 h-3.5 opacity-80 shrink-0" />
                  <span className="truncate">
                    {`Gmail pronto: ${gmailBgState.detectedCount} ${
                      gmailBgState.detectedCount === 1 ? 'spesa trovata' : 'spese trovate'
                    } · Tocca per rivedere`}
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <Mail className="w-3.5 h-3.5 opacity-80 shrink-0" />
                  <span className="truncate">
                    {`Gmail: ${gmailBgState.reviewCount} da controllare · Rivedi`}
                  </span>
                </>
              )}
            </SwipeableNotificationPill>
          )}

          {showReceiptPill && (
            <SwipeableNotificationPill
              key={`receipt-${receiptSignature}`}
              onClick={onOpenScanReceipt}
              onDismiss={dismissReceiptNotification}
              dismissLabel="Nascondi notifica OCR (la bozza resta salvata)"
              className={
                receiptBgState.isAnalyzing
                  ? 'border-sky-400/60 bg-blue-50 text-sky-700'
                  : receiptBgState.fallbackUsed
                    ? 'border-amber-300 bg-amber-50 text-amber-900'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800'
              }
            >
              {receiptBgState.isAnalyzing ? (
                <>
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500" />
                  </span>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <Camera className="w-3.5 h-3.5 opacity-80 shrink-0" />
                  <span className="truncate">Analisi OCR scontrino in corso...</span>
                </>
              ) : receiptBgState.fallbackUsed ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <Camera className="w-3.5 h-3.5 opacity-80 shrink-0" />
                  <span className="truncate">Bozza OCR locale · Verifica e salva</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <Camera className="w-3.5 h-3.5 opacity-80 shrink-0" />
                  <span className="truncate">Scontrino pronto · Tocca per salvare</span>
                </>
              )}
            </SwipeableNotificationPill>
          )}
        </div>
      )}

      {!isAnyModalOpen && isMenuOpen && (
        <div
          aria-hidden="true"
          onClick={() => setIsMenuOpen(false)}
          className="ds-anim-backdrop fixed inset-0 z-40 bg-stone-950/25 backdrop-blur-[1px]"
        />
      )}

      {!isAnyModalOpen && (
        <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] right-4 lg:bottom-6 lg:right-6 z-[45] flex flex-col items-end">
          {isMenuOpen && (
            <div
              role="menu"
              aria-label="Azioni rapide DuoSpend"
              className="ds-anim-fab-stagger flex flex-col items-end gap-2.5 mb-3"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => triggerAction(onOpenScanReceipt)}
                className="ds-card min-h-11 flex items-center gap-3 rounded-full border border-stone-200 pl-4 pr-2 py-1.5 text-sm font-semibold text-stone-900 shadow-lg hover:bg-orange-50 active:scale-[0.98] transition-all cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <span>Scansiona Scontrino OCR</span>
                  {(receiptBgState.isAnalyzing || receiptBgState.hasDraft) && (
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-800">
                      {receiptBgState.isAnalyzing ? 'In corso' : 'Bozza'}
                    </span>
                  )}
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-600 text-white shrink-0">
                  <Camera className="w-4 h-4" />
                </span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => triggerAction(onOpenAddExpense)}
                className="ds-card min-h-11 flex items-center gap-3 rounded-full border border-stone-200 pl-4 pr-2 py-1.5 text-sm font-semibold text-stone-900 shadow-lg hover:bg-orange-50 active:scale-[0.98] transition-all cursor-pointer"
              >
                <span>Nuova Spesa Veloce</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 shrink-0">
                  <Receipt className="w-4 h-4" />
                </span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => triggerAction(onOpenNotificationSync)}
                className="ds-card min-h-11 flex items-center gap-3 rounded-full border border-stone-200 pl-4 pr-2 py-1.5 text-sm font-semibold text-stone-900 shadow-lg hover:bg-orange-50 active:scale-[0.98] transition-all cursor-pointer"
              >
                <span>Incolla Notifica / SMS</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-sky-400/50 bg-blue-50 text-sky-700 shrink-0">
                  <MessageSquareText className="w-4 h-4" />
                </span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => triggerAction(onOpenGmailSync)}
                className="ds-card min-h-11 flex items-center gap-3 rounded-full border border-stone-200 pl-4 pr-2 py-1.5 text-sm font-semibold text-stone-900 shadow-lg hover:bg-orange-50 active:scale-[0.98] transition-all cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <span>Sincronizza Gmail</span>
                  {(gmailBgState.isSyncing || gmailSavedCount > 0) && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                      {gmailBgState.isSyncing ? 'In corso' : `${gmailSavedCount} salvate`}
                    </span>
                  )}
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 shrink-0">
                  <Mail className="w-4 h-4" />
                </span>
              </button>
            </div>
          )}

          <button
            ref={fabButtonRef}
            type="button"
            aria-label={isMenuOpen ? 'Chiudi azioni rapide' : 'Apri azioni rapide'}
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="relative ds-btn-primary h-14 w-14 rounded-full text-white shadow-xl flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
          >
            {hasHiddenSavedTask && !isMenuOpen && (
              <span
                aria-hidden="true"
                className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#FAFAF8] bg-amber-400"
              />
            )}
            <Plus
              className={`w-6 h-6 transition-transform duration-200 ${
                isMenuOpen ? 'rotate-45' : ''
              }`}
            />
          </button>
        </div>
      )}
    </>
  );
};
