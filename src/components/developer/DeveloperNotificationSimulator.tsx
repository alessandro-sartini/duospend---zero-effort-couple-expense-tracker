import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Check,
  RefreshCw,
  Send,
  Sparkles,
} from 'lucide-react';
import { CoupleProfile, Expense } from '../../types';

interface NotificationTestDetails {
  title: string;
  amount: number;
  currency: string;
  category: string;
  modelUsed?: string;
  fallbackUsed?: boolean;
  persisted?: boolean;
  timestamp: string;
}

const SAMPLE_TEST_NOTIFICATIONS = [
  {
    id: 'google-pay',
    label: 'Google Pay',
    appName: 'Google Pay',
    text: 'Google Pay: €9,20 addebitati per ATM Milano Metro.',
  },
  {
    id: 'revolut',
    label: 'Revolut',
    appName: 'Revolut',
    text: 'Revolut: Hai speso €12,50 presso Farmacia Centrale.',
  },
  {
    id: 'nexi',
    label: 'Nexi / Intesa',
    appName: 'Nexi',
    text: 'Nexi: operazione di 42,30 EUR autorizzata da ESSELUNGA SUPERSTORE il 11/11.',
  },
  {
    id: 'postepay',
    label: 'PostePay',
    appName: 'PostePay',
    text: 'PostePay: Pagamento di 18,50 EUR presso Bar Roma Centro.',
  },
] as const;

interface DeveloperNotificationSimulatorProps {
  profile: CoupleProfile;
  onAfterSuccess: () => Promise<void>;
  onSaveExpense?: (expense: Omit<Expense, 'id'>) => void;
  resetSignal?: number;
}

export const DeveloperNotificationSimulator: React.FC<
  DeveloperNotificationSimulatorProps
> = ({ profile, onAfterSuccess, onSaveExpense, resetSignal = 0 }) => {
  const [testSms, setTestSms] = useState('Revolut: Hai speso €12,50 presso Farmacia Centrale.');
  const [testAppName, setTestAppName] = useState<string>('Revolut');
  const [testPayer, setTestPayer] = useState<'user' | 'partner'>('user');
  const [isTestingNotification, setIsTestingNotification] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testResultDetails, setTestResultDetails] =
    useState<NotificationTestDetails | null>(null);
  const feedbackTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current !== null) {
        window.clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (resetSignal > 0) {
      setTestStatus('idle');
      setTestResult(null);
      setTestResultDetails(null);
    }
  }, [resetSignal]);

  const handleTestNotification = async () => {
    if (!testSms.trim() || isTestingNotification) return;

    if (feedbackTimeoutRef.current !== null) {
      window.clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = null;
    }

    setIsTestingNotification(true);
    setTestStatus('idle');
    setTestResult(null);

    try {
      const res = await fetch('/api/notifications/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notificationText: testSms,
          appName: testAppName || 'Test Dev Bancario',
          payer: testPayer,
          persist: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Errore server (${res.status}) durante il test.`);
      }

      if (!data.expense) {
        throw new Error('Nessuna spesa estratta dal testo inserito.');
      }

      if (!data.persisted && onSaveExpense) {
        onSaveExpense(data.expense);
      }

      await onAfterSuccess();

      const timestamp = new Date().toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      setTestResultDetails({
        title: data.expense.title || 'Spesa da notifica',
        amount: Number(data.expense.amount) || 0,
        currency: data.expense.currency || 'EUR',
        category: data.expense.category || 'Altro',
        modelUsed: data.modelUsed,
        fallbackUsed: Boolean(data.fallbackUsed),
        persisted: Boolean(data.persisted || onSaveExpense),
        timestamp,
      });
      setTestResult(
        `Spesa salvata (${timestamp}): ${data.expense.currency || 'EUR'} ${Number(data.expense.amount).toFixed(2)} · ${data.expense.title} (${data.expense.category})`
      );
      setTestStatus('success');

      feedbackTimeoutRef.current = window.setTimeout(() => {
        setTestStatus('idle');
      }, 2600);
    } catch (err: any) {
      setTestStatus('error');
      setTestResultDetails(null);
      setTestResult(err?.message || 'Errore sconosciuto durante il test di ingestione.');
    } finally {
      setIsTestingNotification(false);
    }
  };

  return (
    <section className="ds-subcard p-4 space-y-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 font-bold text-stone-900">
          <Bell className="w-4 h-4 text-orange-600 shrink-0" />
          <span>Simulatore Ingestione Notifiche Bancarie (Test Dev)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-stone-500">Pagante:</span>
          <button
            type="button"
            onClick={() => setTestPayer('user')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all active:scale-95 cursor-pointer ${
              testPayer === 'user'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'ds-btn-secondary'
            }`}
          >
            {profile.userName}
          </button>
          <button
            type="button"
            onClick={() => setTestPayer('partner')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all active:scale-95 cursor-pointer ${
              testPayer === 'partner'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'ds-btn-secondary'
            }`}
          >
            {profile.partnerName}
          </button>
        </div>
      </div>

      {/* Preset rapidi */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-400 mr-1">
          Esempi:
        </span>
        {SAMPLE_TEST_NOTIFICATIONS.map((sample) => {
          const isSelected = testSms === sample.text;
          return (
            <button
              key={sample.id}
              type="button"
              onClick={() => {
                setTestSms(sample.text);
                setTestAppName(sample.appName);
                setTestStatus('idle');
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all active:scale-95 cursor-pointer ${
                isSelected
                  ? 'bg-orange-500/15 text-orange-600 border border-orange-500/40'
                  : 'ds-btn-secondary'
              }`}
            >
              {sample.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 min-w-0">
        <input
          type="text"
          value={testSms}
          onChange={(e) => {
            setTestSms(e.target.value);
            if (testStatus !== 'idle') setTestStatus('idle');
          }}
          placeholder="Incolla o scrivi un SMS / notifica Google Pay, Revolut, Intesa..."
          className="ds-input flex-1 min-w-0 px-3 py-2 text-xs font-mono"
        />
        <button
          type="button"
          onClick={() => void handleTestNotification()}
          disabled={isTestingNotification || !testSms.trim()}
          className={`min-h-10 px-4 py-2 rounded-xl font-semibold shrink-0 flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-xs ${
            testStatus === 'success'
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'ds-btn-primary'
          }`}
        >
          {isTestingNotification ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Analisi in corso...</span>
            </>
          ) : testStatus === 'success' ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Spesa Registrata!</span>
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              <span>Testa Ingestione</span>
            </>
          )}
        </button>
      </div>

      {testStatus === 'error' && testResult && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="min-w-0 break-words">{testResult}</div>
        </div>
      )}

      {testResultDetails && testStatus !== 'error' && (
        <div
          role="status"
          className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 space-y-1.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-800">
              <Check className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>
                {testResultDetails.persisted
                  ? 'Spesa estratta e salvata nel database'
                  : 'Spesa estratta (non salvata: importo 0)'}
              </span>
            </div>
            <span className="text-[10px] font-mono text-emerald-700">
              {testResultDetails.timestamp}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-mono font-semibold text-stone-900">
              {testResultDetails.title} · {testResultDetails.category}
            </span>
            <span className="font-mono font-bold text-sm text-stone-900">
              {testResultDetails.currency} {testResultDetails.amount.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-800">
            <Sparkles className="w-3 h-3 text-orange-500 shrink-0" />
            <span>
              Motore:{' '}
              {testResultDetails.fallbackUsed
                ? 'Fallback euristico locale'
                : testResultDetails.modelUsed || 'Gemini AI'}
            </span>
          </div>
        </div>
      )}
    </section>
  );
};
