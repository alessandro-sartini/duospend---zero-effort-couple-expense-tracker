import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Database,
  Download,
  RefreshCw,
  Send,
  Server,
  ShieldAlert,
  Terminal,
} from 'lucide-react';
import { CoupleProfile, Expense, SavingGoal, Settlement } from '../types';
import { loginDeveloperSession, logoutDeveloperSession } from '../services/auth';
import {
  fetchSavingsChallenges,
  loadCachedSavingsChallenges,
} from '../services/savings-challenges';
import { ModalShell } from './ui/ModalShell';
import { DeveloperLoginView } from './developer/DeveloperLoginView';
import { DeveloperNotificationSimulator } from './developer/DeveloperNotificationSimulator';
import { DeveloperResetConfirmDialog } from './developer/DeveloperResetConfirmDialog';

interface DeveloperModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: CoupleProfile;
  expenses: Expense[];
  settlements: Settlement[];
  goals: SavingGoal[];
  onRefreshData: () => Promise<void> | void;
  onSaveExpense?: (expense: Omit<Expense, 'id'>) => void;
}

export const DeveloperModal: React.FC<DeveloperModalProps> = ({
  isOpen,
  onClose,
  profile,
  expenses,
  settlements,
  goals,
  onRefreshData,
  onSaveExpense,
}) => {
  const [serverStatus, setServerStatus] = useState<any>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isExported, setIsExported] = useState(false);
  const [isResettingDb, setIsResettingDb] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [resetMode, setResetMode] = useState<'empty' | 'demo'>('empty');
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetFeedback, setResetFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [developerPassword, setDeveloperPassword] = useState('');
  const [isDeveloperAuthenticated, setIsDeveloperAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const fetchServerStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch('/api/dev/status');
      if (res.ok) {
        const data = await res.json();
        setServerStatus(data);
        setIsDeveloperAuthenticated(true);
      } else if (res.status === 401 || res.status === 403) {
        setIsDeveloperAuthenticated(false);
      }
    } catch (err) {
      console.warn('Failed to fetch dev status', err);
      setIsDeveloperAuthenticated(false);
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void fetchServerStatus();
    }
  }, [isOpen, fetchServerStatus]);

  const closeModal = () => {
    setDeveloperPassword('');
    setLoginError(null);
    setIsResetConfirmOpen(false);
    setResetConfirmText('');
    onClose();
  };

  if (!isOpen) return null;

  const handleDeveloperLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      await loginDeveloperSession(developerPassword);
      setDeveloperPassword('');
      await fetchServerStatus();
    } catch (error) {
      console.error('Developer login failed:', error);
      setLoginError(
        error instanceof Error
          ? error.message
          : 'Credenziali non valide o server non raggiungibile.'
      );
    }
  };

  const handleDeveloperLogout = async () => {
    try {
      await logoutDeveloperSession(true);
      setIsDeveloperAuthenticated(false);
      setServerStatus(null);
      closeModal();
    } catch (error) {
      console.error('Developer logout failed:', error);
    }
  };

  if (!isDeveloperAuthenticated) {
    return (
      <DeveloperLoginView
        isOpen={isOpen}
        onClose={closeModal}
        developerPassword={developerPassword}
        onChangePassword={setDeveloperPassword}
        loginError={loginError}
        onSubmit={handleDeveloperLogin}
      />
    );
  }

  const refreshAllState = async () => {
    await Promise.all([Promise.resolve(onRefreshData()), fetchServerStatus()]);
  };

  const handleExportJson = async () => {
    let savingsChallenges = loadCachedSavingsChallenges()?.challenges ?? [];
    try {
      const live = await fetchSavingsChallenges({ recalculate: false });
      savingsChallenges = live.challenges;
    } catch {
      // Usa la cache locale delle sfide se offline
    }
    const fullBackup = {
      exportDate: new Date().toISOString(),
      profile,
      expenses,
      settlements,
      goals,
      savingsChallenges,
    };
    const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `duospend_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setIsExported(true);
    window.setTimeout(() => setIsExported(false), 2000);
  };

  const handleSyncToUbuntu = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/dev/ubuntu-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Errore nella sincronizzazione');
      }
      setSyncMessage('Database sincronizzato con successo con il server Ubuntu!');
    } catch (err: any) {
      setSyncMessage(`Errore: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const openResetConfirmDialog = () => {
    setResetConfirmText('');
    setResetFeedback(null);
    setIsResetConfirmOpen(true);
  };

  const handleConfirmResetDb = async (event: React.FormEvent) => {
    event.preventDefault();
    if (resetConfirmText.trim().toUpperCase() !== 'RESET' || isResettingDb) {
      return;
    }
    setIsResettingDb(true);
    setResetFeedback(null);
    try {
      const res = await fetch('/api/dev/reset-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'RESET', mode: resetMode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Reset non riuscito.');
      }
      await refreshAllState();
      setResetSignal((prev) => prev + 1);
      setIsResetConfirmOpen(false);
      setResetConfirmText('');
      setResetFeedback({
        type: 'success',
        text: data.message || 'Database ripristinato con successo.',
      });
    } catch (err) {
      console.error('Database reset failed:', err);
      setResetFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Errore durante il reset del database.',
      });
    } finally {
      setIsResettingDb(false);
    }
  };

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={closeModal}
        title="Console Sviluppatore"
        subtitle="Sessione protetta da password · Diagnostica, backup e gestione DB"
        icon={Terminal}
        iconClassName="bg-orange-500/15 text-orange-600 border-orange-500/30"
        maxWidth="2xl"
        headerExtra={
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
              DEV SESSION
            </span>
            <button
              type="button"
              onClick={handleDeveloperLogout}
              className="min-h-8 px-2.5 rounded-lg text-[11px] font-semibold text-stone-500 hover:text-stone-900 hover:bg-stone-200/60 transition-all active:scale-95 cursor-pointer"
            >
              Esci
            </button>
          </div>
        }
      >
      <div className="p-4 sm:p-6 space-y-5 text-xs">
        {/* Sezione 1: Stato Database Server Centrale */}
        <section className="ds-subcard p-4 space-y-3 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 font-bold text-stone-900">
              <Database className="w-4 h-4 text-orange-600 shrink-0" />
              <span className="truncate">Database Centrale Server (Cross-Device)</span>
            </div>
            <button
              type="button"
              onClick={() => void fetchServerStatus()}
              disabled={isLoadingStatus}
              className="ds-btn-secondary px-2.5 py-1.5 text-[11px] active:scale-[0.98]"
            >
              <RefreshCw className={`w-3 h-3 ${isLoadingStatus ? 'animate-spin' : ''}`} />
              <span>{isLoadingStatus ? 'Aggiorno...' : 'Aggiorna Stato'}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
            <div className="ds-card p-2.5">
              <span className="text-stone-400 block text-[10px]">Spese Salvate</span>
              <strong className="text-stone-900 text-sm">{expenses.length}</strong>
            </div>
            <div className="ds-card p-2.5">
              <span className="text-stone-400 block text-[10px]">Pareggi Conti</span>
              <strong className="text-stone-900 text-sm">{settlements.length}</strong>
            </div>
            <div className="ds-card p-2.5">
              <span className="text-stone-400 block text-[10px]">Obiettivi / Sfide</span>
              <strong className="text-stone-900 text-sm">
                {goals.length} / {typeof serverStatus?.recordCount?.savingsChallenges === 'number' ? serverStatus.recordCount.savingsChallenges : '—'}
              </strong>
            </div>
            <div className="ds-card p-2.5">
              <span className="text-stone-400 block text-[10px]">File Dimensione</span>
              <strong className="text-stone-900 text-sm">
                {serverStatus?.dbSizeBytes ? `${(serverStatus.dbSizeBytes / 1024).toFixed(1)} KB` : '—'}
              </strong>
            </div>
          </div>

          <div className="text-[11px] text-stone-500 font-mono break-all ds-card px-3 py-2">
            Motore: {serverStatus?.engine || 'SQLite (WAL)'} · File:{' '}
            {serverStatus?.dbPath || '/duospend.sqlite'}
            {typeof serverStatus?.serverUptimeSec === 'number' &&
              ` · Uptime: ${serverStatus.serverUptimeSec}s`}
          </div>
        </section>

        {/* Sezione 2: Simulatore Ingestione Notifiche Bancarie */}
        <DeveloperNotificationSimulator
          profile={profile}
          onAfterSuccess={refreshAllState}
          onSaveExpense={onSaveExpense}
          resetSignal={resetSignal}
        />

        {/* Sezione 3: Server Ubuntu a Casa (Home Server) */}
        <section className="ds-subcard p-4 space-y-3 min-w-0">
          <div className="flex min-w-0 items-center gap-2 font-bold text-stone-900">
            <Server className="w-4 h-4 text-orange-600 shrink-0" />
            <span>Sincronizzazione opzionale con un server Ubuntu</span>
          </div>
          <p className="text-stone-500 text-[11px] leading-relaxed">
            Il database di DuoSpend salva ogni operazione in SQLite transazionale (modalità WAL). Puoi sincronizzare le spese sul tuo server Ubuntu domestico o scaricare un backup JSON completo locale.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSyncToUbuntu()}
              disabled={isSyncing}
              className="ds-btn-secondary px-3.5 py-2 text-xs active:scale-[0.98]"
            >
              {isSyncing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-orange-600" />
              ) : (
                <Send className="w-3.5 h-3.5 text-orange-600" />
              )}
              <span>{isSyncing ? 'Invio in corso...' : 'Invia a Ubuntu'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportJson}
              className="ds-btn-secondary px-3.5 py-2 text-xs active:scale-[0.98]"
            >
              {isExported ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Download className="w-3.5 h-3.5 text-orange-600" />
              )}
              <span>
                {isExported ? 'Backup Scaricato!' : 'Esporta Backup JSON Completo (.json)'}
              </span>
            </button>
          </div>

          {syncMessage && (
            <div
              className={`p-2.5 rounded-xl border text-[11px] ${
                syncMessage.includes('successo')
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {syncMessage}
            </div>
          )}
        </section>

        {/* Sezione 4: Azioni Pericolose */}
        <section className="p-4 rounded-2xl border border-rose-200 bg-rose-50 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5 text-rose-900">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <div className="min-w-0">
                <span className="font-bold block">Reset &amp; Svuotamento Database</span>
                <span className="text-[11px] text-rose-700">
                  Svuota tutte le spese o ripristina i dati demo (richiede doppia conferma)
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={openResetConfirmDialog}
              disabled={isResettingDb}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-semibold text-xs transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
            >
              {isResettingDb ? 'Ripristino...' : 'Reset Database'}
            </button>
          </div>

          {resetFeedback && (
            <div
              role="status"
              className={`p-2.5 rounded-xl border text-[11px] ${
                resetFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-100 border-rose-300 text-rose-900'
              }`}
            >
              {resetFeedback.text}
            </div>
          )}
        </section>
      </div>
    </ModalShell>

    <DeveloperResetConfirmDialog
      isOpen={isResetConfirmOpen}
      expensesCount={expenses.length}
      settlementsCount={settlements.length}
      goalsCount={goals.length}
      resetMode={resetMode}
      resetConfirmText={resetConfirmText}
      isResettingDb={isResettingDb}
      isExported={isExported}
      errorText={resetFeedback?.type === 'error' ? resetFeedback.text : null}
      onChangeResetMode={setResetMode}
      onChangeConfirmText={setResetConfirmText}
      onExportJson={handleExportJson}
      onConfirm={handleConfirmResetDb}
      onCancel={() => {
        setIsResetConfirmOpen(false);
        setResetConfirmText('');
      }}
    />
    </>
  );
};
