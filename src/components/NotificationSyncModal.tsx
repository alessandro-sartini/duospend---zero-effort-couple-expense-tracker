import React, { useEffect, useId, useRef, useState } from 'react';
import { X, Bell, Sparkles, Check, RefreshCw, AlertCircle, Clipboard } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';
import { Expense, CoupleProfile, Payer } from '../types';
import {
  ParsedNotificationItem,
  SAMPLE_NOTIFICATIONS,
  parseNotificationsLocally,
} from './notifications/localNotificationParser';
import { WebhookAutomationGuide } from './notifications/WebhookAutomationGuide';

interface NotificationSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportExpenses: (expenses: Omit<Expense, 'id'>[]) => void;
  profile: CoupleProfile;
  initialNotificationText?: string;
  canInstallPwa?: boolean;
  onInstallPwa?: () => void;
}

export const NotificationSyncModal: React.FC<NotificationSyncModalProps> = ({
  isOpen,
  onClose,
  onImportExpenses,
  profile,
  initialNotificationText = '',
  canInstallPwa = false,
  onInstallPwa,
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const pastedFeedbackTimeoutRef = useRef<number | null>(null);
  useScrollLock(isOpen);
  useFocusTrap(dialogRef, isOpen);
  const [activeTab, setActiveTab] = useState<'paste' | 'webhook'>('paste');
  const [inputText, setInputText] = useState(initialNotificationText);
  const [payer, setPayer] = useState<Payer>('user');
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedNotificationItem[]>([]);
  const [pastedFeedback, setPastedFeedback] = useState<'idle' | 'pasted' | 'denied'>('idle');
  const isParsingRef = React.useRef(false);
  const lastAutoParsedRef = React.useRef('');

  const runParseForText = React.useCallback(
    async (rawText: string, selectedPayer: Payer) => {
      if (!rawText.trim() || isParsingRef.current) return;

      isParsingRef.current = true;
      setIsParsing(true);
      setError(null);
      setFallbackNotice(null);
      setParsedItems([]);

      const isMultiLine = rawText.trim().includes('\n') || rawText.length > 150;

      try {
        const endpoint = isMultiLine
          ? '/api/notifications/parse-history'
          : '/api/notifications/ingest';

        const body = isMultiLine
          ? { historyText: rawText, payer: selectedPayer }
          : { notificationText: rawText, payer: selectedPayer, appName: 'Banca/SMS' };

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          if (res.status >= 500 || res.status === 404) {
            const localItems = parseNotificationsLocally(rawText, profile.currency, isMultiLine);
            if (localItems.length > 0) {
              setParsedItems(localItems);
              setFallbackNotice(
                'Server AI temporaneamente non disponibile: estrazione eseguita con fallback locale offline.'
              );
              return;
            }
          }
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || 'Errore nella decodifica delle notifiche.');
        }

        const data = await res.json();
        if (data.ignored || data.isExpense === false) {
          setParsedItems([]);
          setError(
            data.reason ||
              'La notifica non rappresenta una spesa reale (es. codice OTP, promozione o accredito).'
          );
          return;
        }
        const extracted: ParsedNotificationItem[] = isMultiLine
          ? data.expenses || []
          : data.expense
            ? [data.expense]
            : [];

        if (extracted.length === 0) {
          const localFallback = parseNotificationsLocally(rawText, profile.currency, isMultiLine);
          if (localFallback.length > 0) {
            setParsedItems(localFallback);
            setFallbackNotice(
              'Nessun risultato dal parser cloud: applicato fallback euristico locale.'
            );
            return;
          }
        }

        setParsedItems(extracted);
        if (data.fallbackUsed) {
          setFallbackNotice(
            'Gemini AI non disponibile: estrazione completata tramite parser euristico locale.'
          );
        }
      } catch (err: any) {
        console.error('Notification parse error, trying local fallback:', err);
        const localItems = parseNotificationsLocally(rawText, profile.currency, isMultiLine);
        if (localItems.length > 0) {
          setParsedItems(localItems);
          setFallbackNotice(
            'Connessione assente o errore di rete: estrazione eseguita con fallback locale offline.'
          );
        } else {
          setError(err?.message || 'Errore nella decodifica.');
        }
      } finally {
        isParsingRef.current = false;
        setIsParsing(false);
      }
    },
    [profile.currency]
  );

  React.useEffect(() => {
    if (!isOpen) {
      lastAutoParsedRef.current = '';
      return;
    }
    const cleanInitial = initialNotificationText.trim();
    if (cleanInitial && lastAutoParsedRef.current !== cleanInitial) {
      lastAutoParsedRef.current = cleanInitial;
      setActiveTab('paste');
      setInputText(initialNotificationText);
      void runParseForText(initialNotificationText, payer);
    }
  }, [initialNotificationText, isOpen, payer, runParseForText]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    return () => {
      if (pastedFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(pastedFeedbackTimeoutRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const scheduleFeedbackReset = (delayMs: number) => {
    if (pastedFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(pastedFeedbackTimeoutRef.current);
    }
    pastedFeedbackTimeoutRef.current = window.setTimeout(() => {
      setPastedFeedback('idle');
      pastedFeedbackTimeoutRef.current = null;
    }, delayMs);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputText(text);
        setPastedFeedback('pasted');
        scheduleFeedbackReset(1800);
      }
    } catch (err) {
      console.warn('Clipboard read permission denied', err);
      setPastedFeedback('denied');
      scheduleFeedbackReset(2200);
    }
  };

  const handleParse = async () => {
    await runParseForText(inputText, payer);
  };

  const handleImport = () => {
    if (parsedItems.length === 0) return;

    const formatted: Omit<Expense, 'id'>[] = parsedItems.map((item) => ({
      title: item.title || item.merchant || 'Pagamento da Notifica',
      amount: Number(item.amount) || 0,
      currency: item.currency || profile.currency,
      date: item.date || new Date().toISOString().slice(0, 10),
      category: item.category || 'Shopping',
      payer,
      splitType: '50_50',
      source: 'notification',
      notes: item.notes || 'Estratto da notifica/SMS bancario Android',
    }));

    onImportExpenses(formatted);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden overscroll-contain px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] sm:p-4 bg-black/40 backdrop-blur-xs"
    >
      <div
        ref={dialogRef}
        className="bg-white rounded-2xl shadow-xl max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] max-w-lg w-full overflow-hidden border border-stone-200 flex flex-col outline-none"
      >
        {/* Intestazione */}
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 sm:px-6 sm:py-4 border-b border-stone-100 bg-stone-50/60">
          <div className="flex min-w-0 items-center gap-2">
            <div className="hidden sm:flex w-7 h-7 rounded-lg bg-orange-100 text-orange-700 items-center justify-center shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 id={titleId} className="text-base font-bold text-stone-900">
                <span className="sm:hidden">Notifiche e SMS</span>
                <span className="hidden sm:inline">Notifiche Bancarie & SMS Android</span>
              </h3>
              <p className="hidden sm:block text-xs text-stone-500">
                Acquisizione immediata da push bancari, SMS e Cronologia Notifiche
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Chiudi notifiche"
            className="min-h-10 min-w-10 rounded-lg hover:bg-stone-200/60 text-stone-500 transition-colors flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab di navigazione interna */}
        <div className="grid grid-cols-2 border-b border-stone-100 px-3 sm:px-6 pt-1.5 sm:pt-3 gap-2 sm:gap-4 text-[11px] sm:text-xs font-semibold">
          <button
            onClick={() => setActiveTab('paste')}
            className={`min-h-10 px-1 pb-1.5 sm:pb-2.5 border-b-2 transition-colors ${
              activeTab === 'paste'
                ? 'border-orange-600 text-stone-900'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <span className="sm:hidden">Incolla notifica</span>
            <span className="hidden sm:inline">Incolla Rapido Notifica / SMS</span>
          </button>
          <button
            onClick={() => setActiveTab('webhook')}
            className={`min-h-10 px-1 pb-1.5 sm:pb-2.5 border-b-2 transition-colors ${
              activeTab === 'webhook'
                ? 'border-orange-600 text-stone-900'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <span className="sm:hidden">Automazione</span>
            <span className="hidden sm:inline">Automazione Senza Mani (MacroDroid)</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 p-3 sm:p-6 space-y-3 sm:space-y-4 overflow-y-auto overscroll-contain text-xs">
          {activeTab === 'paste' ? (
            <div className="space-y-3 sm:space-y-4">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="text-xs font-semibold text-stone-700">
                    <span className="sm:hidden">Testo della notifica</span>
                    <span className="hidden sm:inline">Testo Notifica Bancaria, SMS o Cronologia Notifiche:</span>
                  </label>
                  <button
                    type="button"
                    onClick={handlePasteFromClipboard}
                    className="min-h-10 shrink-0 text-[11px] font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
                  >
                    {pastedFeedback === 'pasted' ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span className="text-emerald-700">Incollato!</span>
                      </>
                    ) : pastedFeedback === 'denied' ? (
                      <span className="text-rose-600">Usa Ctrl+V / Incolla</span>
                    ) : (
                      <>
                        <Clipboard className="w-3 h-3" />
                        <span className="sm:hidden">Incolla</span>
                        <span className="hidden sm:inline">Incolla dagli Appunti</span>
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Incolla qui la notifica (es. 'PostePay: Pagamento di 18,50 EUR presso Farmacia...' oppure copia più righe dalla Cronologia Notifiche Android)..."
                  className="w-full p-2.5 sm:p-3 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono"
                />
              </div>

              {/* Bottoni di Esempio Rapido */}
              <div>
                <span className="text-[10px] sm:text-[11px] font-semibold text-stone-400 block mb-1 uppercase tracking-wide">
                  <span className="sm:hidden">Esempi rapidi</span>
                  <span className="hidden sm:inline">Prova con Esempi Reali di Banche Italiane:</span>
                </span>
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5">
                  {SAMPLE_NOTIFICATIONS.map((sample, idx) => {
                    const isSelected = inputText === sample.text;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setInputText(sample.text)}
                        className={`min-h-9 px-2.5 py-1 text-[10px] sm:text-[11px] rounded-md transition-all truncate cursor-pointer active:scale-95 ${
                          isSelected
                            ? 'bg-orange-500/15 text-orange-700 border border-orange-500/40 font-semibold'
                            : 'bg-stone-100 hover:bg-stone-200 text-stone-700 border border-transparent'
                        }`}
                      >
                        <span className="sm:hidden">{sample.mobileLabel}</span>
                        <span className="hidden sm:inline">{sample.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Assegnazione di chi ha pagato */}
              <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-2">
                <span className="font-semibold text-stone-700">
                  <span className="sm:hidden">Pagato da</span>
                  <span className="hidden sm:inline">Chi ha effettuato il pagamento?</span>
                </span>
                <div className="flex min-w-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPayer('user')}
                    className={`min-h-10 max-w-28 truncate px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
                      payer === 'user'
                        ? 'bg-orange-600 text-white shadow-xs'
                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                    }`}
                  >
                    {profile.userName} (Tu)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayer('partner')}
                    className={`min-h-10 max-w-28 truncate px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
                      payer === 'partner'
                        ? 'bg-orange-600 text-white shadow-xs'
                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                    }`}
                  >
                    {profile.partnerName}
                  </button>
                </div>
              </div>

              {/* Bottone Decodifica */}
              <button
                type="button"
                onClick={handleParse}
                disabled={isParsing || !inputText.trim()}
                className="min-h-11 w-full py-2 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-all cursor-pointer active:scale-[0.98] flex items-center justify-center gap-2 shadow-xs"
              >
                {isParsing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-orange-400" />
                    <span>Gemini sta estraendo i dati della spesa...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                    <span>Estrai Spesa con Gemini</span>
                  </>
                )}
              </button>

              {/* Avviso fallback locale */}
              {fallbackNotice && (
                <div
                  role="status"
                  className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{fallbackNotice}</span>
                </div>
              )}

              {/* Avviso errore */}
              {error && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Risultato spese estratte */}
              {parsedItems.length > 0 && (
                <div className="p-4 bg-orange-50/50 rounded-xl border border-orange-200 space-y-2.5">
                  <div className="flex items-center justify-between pb-1 border-b border-orange-200/60 font-bold text-orange-950">
                    <span>Estratta/e {parsedItems.length} Spesa/e</span>
                    <span className="font-mono text-stone-900">
                      Totale: €
                      {parsedItems
                        .reduce((acc, it) => acc + (Number(it.amount) || 0), 0)
                        .toFixed(2)}
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {parsedItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-white rounded-lg border border-stone-200 flex justify-between items-center"
                      >
                        <div>
                          <span className="font-bold text-stone-900 block truncate">
                            {item.title || item.merchant}
                          </span>
                          <span className="text-[11px] text-stone-500">
                            {item.date} · {item.category} · {item.notes}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-stone-900 text-sm">
                          €{Number(item.amount).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleImport}
                    className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer active:scale-[0.98]"
                  >
                    <Check className="w-4 h-4" />
                    <span>Aggiungi al Registro Spese Condivise</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <WebhookAutomationGuide
              canInstallPwa={canInstallPwa}
              onInstallPwa={onInstallPwa}
            />
          )}
        </div>
      </div>
    </div>
  );
};
