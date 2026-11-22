import React, { useEffect, useRef, useState } from 'react';
import { Check, Mail, RotateCcw, Sparkles, X } from 'lucide-react';
import {
  CoupleProfile,
  Expense,
  ExpenseCategory,
  GmailRecurringRule,
  Payer,
  SavingGoal,
} from '../types';
import { getActiveCategories } from '../constants/categories';
import { getAccessToken, googleSignIn, hasGmailAccess, logout, usesServerSideOAuth } from '../services/auth';
import { loadGmailDraft, saveGmailDraft } from '../services/storage';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { ModalShell } from './ui/ModalShell';
import { PayerSelector } from './ui/PayerSelector';
import { GmailConnectPrompt } from './gmail/GmailConnectPrompt';
import { GmailReceiptCard } from './gmail/GmailReceiptCard';
import { GmailReviewCandidateList } from './gmail/GmailReviewCandidateList';
import { GmailScanControls, type GmailSearchMode } from './gmail/GmailScanControls';
import { GmailScanStatus } from './gmail/GmailScanStatus';
import {
  applyRecurringRulesToReceipt,
  hasSimilarRecurringRule,
} from './gmail/recurringRules';
import {
  getDefaultMerchant,
  normalizeRuleValue,
  type DetectedGmailReceipt,
  type GmailReviewCandidate,
  type GmailScanStats,
} from './gmail/types';

interface GmailSyncDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onImportExpenses: (expenses: Omit<Expense, 'id'>[]) => void;
  existingGmailSourceReferences: string[];
  ignoredGmailSourceReferences: string[];
  onIgnoreGmailMessage: (messageId: string) => void;
  onUnignoreGmailMessage?: (messageId: string) => void;
  gmailRecurringRules: GmailRecurringRule[];
  onSaveRecurringRule: (rule: GmailRecurringRule) => void;
  profile: CoupleProfile;
  goals?: SavingGoal[];
  isSignedIn: boolean;
  userEmail?: string;
  onAuthChanged: (signedIn: boolean, email?: string) => void;
  onOpenStartingPoint?: () => void;
  onBackgroundStateChange?: (state: {
    isSyncing: boolean;
    detectedCount: number;
    reviewCount: number;
    scanProgress: { page: number; total: number } | null;
  }) => void;
}

export const GmailSyncDrawer: React.FC<GmailSyncDrawerProps> = ({
  isOpen,
  onClose,
  onImportExpenses,
  existingGmailSourceReferences,
  ignoredGmailSourceReferences,
  onIgnoreGmailMessage,
  onUnignoreGmailMessage,
  gmailRecurringRules,
  onSaveRecurringRule,
  profile,
  goals = [],
  isSignedIn,
  userEmail,
  onAuthChanged,
  onOpenStartingPoint,
  onBackgroundStateChange,
}) => {
  const initialGmailDraft = useRef(
    loadGmailDraft<DetectedGmailReceipt, GmailReviewCandidate, GmailScanStats>(),
  ).current;
  const [isSyncing, setIsSyncing] = useState<boolean>(() =>
    Boolean(initialGmailDraft?.wasSyncing && hasGmailAccess()),
  );
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [detectedReceipts, setDetectedReceipts] = useState<DetectedGmailReceipt[]>(
    () => initialGmailDraft?.detectedReceipts ?? [],
  );
  const [reviewCandidates, setReviewCandidates] = useState<GmailReviewCandidate[]>(
    () => initialGmailDraft?.reviewCandidates ?? [],
  );
  const [analysisModel, setAnalysisModel] = useState<string | null>(
    () => initialGmailDraft?.analysisModel ?? null,
  );
  const [nextPageToken, setNextPageToken] = useState<string | null>(
    () => initialGmailDraft?.nextPageToken ?? null,
  );
  const [lookbackDays, setLookbackDays] = useState(
    () => initialGmailDraft?.lookbackDays ?? 30,
  );
  const [searchMode, setSearchMode] = useState<GmailSearchMode>(() => {
    if (initialGmailDraft?.searchMode) {
      if (initialGmailDraft.searchMode === 'tracking_start' && !profile.trackingStartDate) {
        return 'month_start';
      }
      return initialGmailDraft.searchMode;
    }
    return profile.trackingStartDate ? 'tracking_start' : 'month_start';
  });
  const [customStartDate, setCustomStartDate] = useState<string>(
    () => initialGmailDraft?.customStartDate || profile.trackingStartDate || ''
  );

  const effectiveStartDate = React.useMemo(() => {
    const maxIsoDate = (candidate?: string, floor?: string): string | undefined => {
      if (!candidate) return floor;
      if (!floor) return candidate;
      return candidate >= floor ? candidate : floor;
    };

    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const floorDate =
      profile.trackingStartDate && /^\d{4}-\d{2}-\d{2}$/.test(profile.trackingStartDate)
        ? profile.trackingStartDate
        : undefined;

    if (searchMode === 'tracking_start') {
      return floorDate || `${y}-${String(m).padStart(2, '0')}-01`;
    }
    if (searchMode === 'month_start') {
      return maxIsoDate(`${y}-${String(m).padStart(2, '0')}-01`, floorDate);
    }
    if (searchMode === 'prev_month_start') {
      const prev = new Date(y, m - 2, 1);
      return maxIsoDate(
        `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-01`,
        floorDate
      );
    }
    if (searchMode === 'year_start') {
      return maxIsoDate(`${y}-01-01`, floorDate);
    }
    if (searchMode === 'custom_date') {
      const cleanCustom = /^\d{4}-\d{2}-\d{2}$/.test(customStartDate) ? customStartDate : undefined;
      return maxIsoDate(cleanCustom, floorDate);
    }
    if (floorDate) {
      const lookbackStart = new Date(y, m - 1, now.getDate() - Math.max(0, lookbackDays));
      const lookbackIso = `${lookbackStart.getFullYear()}-${String(lookbackStart.getMonth() + 1).padStart(2, '0')}-${String(lookbackStart.getDate()).padStart(2, '0')}`;
      return maxIsoDate(lookbackIso, floorDate);
    }
    return undefined;
  }, [searchMode, customStartDate, lookbackDays, profile.trackingStartDate]);
  const [scanStats, setScanStats] = useState<GmailScanStats | null>(
    () => initialGmailDraft?.scanStats ?? null,
  );
  const [scanProgress, setScanProgress] = useState<{ page: number; total: number } | null>(null);
  const [scanStatus, setScanStatus] = useState<'complete' | 'stopped' | 'error' | null>(
    () => initialGmailDraft?.scanStatus ?? null,
  );
  const [stopRequested, setStopRequested] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>(
    () => initialGmailDraft?.selectedIds ?? {},
  );
  const [error, setError] = useState<string | null>(null);
  const [defaultPayer, setDefaultPayer] = useState<Payer>('user');
  const [recurringAmountDrafts, setRecurringAmountDrafts] = useState<Record<string, string>>({});
  const [recurringMerchantDrafts, setRecurringMerchantDrafts] = useState<Record<string, string>>({});
  const [recurringCategoryDrafts, setRecurringCategoryDrafts] = useState<Record<string, ExpenseCategory>>({});
  const [recurringSetupId, setRecurringSetupId] = useState<string | null>(null);
  const [confirmZeroImport, setConfirmZeroImport] = useState(false);
  const [confirmIgnoreAll, setConfirmIgnoreAll] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [lastIgnoredItem, setLastIgnoredItem] = useState<{
    kind: 'receipt' | 'candidate';
    item: DetectedGmailReceipt | GmailReviewCandidate;
    wasSelected?: boolean;
  } | null>(null);

  const recurringRulesRef = useRef(gmailRecurringRules);
  const ignoredIdsRef = useRef(ignoredGmailSourceReferences);
  const stopAfterCurrentBatchRef = useRef(false);

  useEffect(() => {
    recurringRulesRef.current = gmailRecurringRules;
  }, [gmailRecurringRules]);

  useEffect(() => {
    ignoredIdsRef.current = ignoredGmailSourceReferences;
  }, [ignoredGmailSourceReferences]);

  const didResumeScanRef = useRef(false);

  useEffect(() => {
    if (!didResumeScanRef.current && initialGmailDraft?.wasSyncing) {
      didResumeScanRef.current = true;
      if (hasGmailAccess()) {
        void runGmailScan(undefined, initialGmailDraft.nextPageToken ?? undefined);
      } else {
        setScanNotice(
          'Scansione Gmail interrotta dal ricaricamento: autorizza di nuovo Gmail per riprendere.',
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prevTrackingStartRef = useRef(profile.trackingStartDate);

  useEffect(() => {
    if (prevTrackingStartRef.current !== profile.trackingStartDate) {
      prevTrackingStartRef.current = profile.trackingStartDate;
      if (profile.trackingStartDate && !isSyncing) {
        setSearchMode('tracking_start');
        setDetectedReceipts([]);
        setReviewCandidates([]);
        setSelectedIds({});
        setScanStats(null);
        setNextPageToken(null);
      } else if (!profile.trackingStartDate && searchMode === 'tracking_start') {
        setSearchMode('month_start');
      }
    }
  }, [profile.trackingStartDate, isSyncing, searchMode]);

  useEffect(() => {
    saveGmailDraft({
      detectedReceipts,
      reviewCandidates,
      selectedIds,
      nextPageToken,
      analysisModel,
      scanStats,
      scanStatus,
      wasSyncing: isSyncing,
      lookbackDays,
      searchMode,
      customStartDate,
    });
  }, [
    detectedReceipts,
    reviewCandidates,
    selectedIds,
    nextPageToken,
    analysisModel,
    scanStats,
    scanStatus,
    isSyncing,
    lookbackDays,
    searchMode,
    customStartDate,
  ]);

  useEffect(() => {
    onBackgroundStateChange?.({
      isSyncing,
      detectedCount: detectedReceipts.length,
      reviewCount: reviewCandidates.length,
      scanProgress,
    });
  }, [
    isSyncing,
    detectedReceipts.length,
    reviewCandidates.length,
    scanProgress,
    onBackgroundStateChange,
  ]);

  if (!isOpen) return null;

  const handleSignIn = async () => {
    setIsLoggingIn(true);
    setError(null);
    try {
      const res = await googleSignIn(true);
      if (res?.user) {
        onAuthChanged(true, res.user.email || undefined);
        await runGmailScan(res.accessToken || undefined);
      }
    } catch (err: any) {
      console.error('Google Sign In failed:', err);
      setError(err.message || 'Accesso con Google fallito.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
      onAuthChanged(false, undefined);
      setDetectedReceipts([]);
    } catch (err: any) {
      console.error('Sign out error:', err);
    }
  };

  const runGmailScan = async (explicitToken?: string, pageToken?: string) => {
    setIsSyncing(true);
    setError(null);
    setScanProgress(null);
    setAnalysisModel(null);
    setScanStatus(null);
    setStopRequested(false);
    stopAfterCurrentBatchRef.current = false;

    if (!pageToken) {
      setScanStats(null);
      setNextPageToken(null);
      setScanProgress(null);
      setDetectedReceipts([]);
      setReviewCandidates([]);
      setSelectedIds({});
      setScanNotice(null);
    }

    try {
      const serverSideOAuth = usesServerSideOAuth();
      let token = serverSideOAuth ? null : explicitToken || (await getAccessToken());

      const requestGmailConsent = async () => {
        const authorization = await googleSignIn(true);
        if (!authorization?.user.email) {
          throw new Error('Accesso Gmail non riuscito.');
        }
        if (userEmail && authorization.user.email.toLowerCase() !== userEmail.toLowerCase()) {
          throw new Error('Autorizza Gmail con lo stesso account Google che hai usato per accedere a DuoSpend.');
        }
        token = serverSideOAuth ? null : authorization.accessToken;
      };

      if (serverSideOAuth) {
        if (!hasGmailAccess()) {
          await requestGmailConsent();
        }
      } else {
        if (!token || !hasGmailAccess()) {
          await requestGmailConsent();
        }
        if (!token) {
          throw new Error('Non autenticato con Google. Accedi per leggere le ricevute.');
        }
      }

      let currentPageToken = pageToken;
      let page = 0;
      let hasMore = false;
      let processedCount = pageToken ? scanStats?.messagesProcessed || 0 : 0;
      let batchesProcessed = pageToken ? scanStats?.batchesProcessed || 0 : 0;
      let analyzedCount = pageToken ? scanStats?.messagesAnalyzed || 0 : 0;
      let failedCount = pageToken ? scanStats?.failedMessageReads || 0 : 0;
      let recurringRuleMatchCount = pageToken ? scanStats?.recurringRuleMatchCount || 0 : 0;
      let skippedNonTransactionalCount = pageToken ? scanStats?.skippedNonTransactionalCount || 0 : 0;
      let skippedCount = pageToken ? scanStats?.skippedImportedCount || 0 : 0;
      let ignoredCount = pageToken ? scanStats?.skippedIgnoredCount || 0 : 0;
      let scannedCount = pageToken ? scanStats?.skippedScannedCount || 0 : 0;
      let suppressedLowConfidenceCount = pageToken ? scanStats?.suppressedLowConfidenceCount || 0 : 0;
      let resultEstimate = pageToken ? scanStats?.candidateCount || 0 : 0;

      const existingIds = new Set([
        ...(pageToken ? detectedReceipts.map((receipt) => receipt.id) : []),
        ...existingGmailSourceReferences,
        ...ignoredIdsRef.current,
      ]);

      const postSyncBatch = async () => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
        return fetch('/api/gmail/sync', {
          method: 'POST',
          body: JSON.stringify({
            pageToken: currentPageToken,
            lookbackDays,
            ...(effectiveStartDate ? { startDate: effectiveStartDate } : {}),
            importedMessageIds: existingGmailSourceReferences,
            ignoredMessageIds: ignoredIdsRef.current,
            gmailRecurringRules: recurringRulesRef.current,
          }),
          headers,
        });
      };

      do {
        let res = await postSyncBatch();

        if (res.status === 401 && serverSideOAuth) {
          const errJson = await res.json().catch(() => ({}));
          if (errJson.code === 'GMAIL_AUTH_REQUIRED') {
            await requestGmailConsent();
            res = await postSyncBatch();
          } else {
            throw new Error(errJson.error || 'Errore durante la scansione di Gmail.');
          }
        }

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || 'Errore durante la scansione di Gmail.');
        }

        const data = await res.json();
        page += 1;
        processedCount += data.messagesReturned || 0;
        batchesProcessed += 1;
        resultEstimate = Math.max(resultEstimate, data.candidateCount || 0);
        analyzedCount += data.messagesAnalyzed || 0;
        failedCount += data.failedMessageReads || 0;
        recurringRuleMatchCount += data.recurringRuleMatchCount || 0;
        skippedNonTransactionalCount += data.skippedNonTransactionalCount || 0;
        skippedCount += data.skippedImportedCount || 0;
        ignoredCount += data.skippedIgnoredCount || 0;
        scannedCount += data.skippedScannedCount || 0;
        suppressedLowConfidenceCount += data.suppressedLowConfidenceCount || 0;
        hasMore = Boolean(data.hasMoreCandidates);
        currentPageToken = data.nextPageToken || undefined;
        setScanProgress({ page: batchesProcessed, total: resultEstimate });

        const newReceipts: DetectedGmailReceipt[] = (data.receipts || [])
          .filter((receipt: DetectedGmailReceipt) => typeof receipt.id === 'string' && receipt.id.length > 0)
          .map((receipt: DetectedGmailReceipt) =>
            applyRecurringRulesToReceipt(
              receipt,
              recurringRulesRef.current,
              Boolean(data.fallbackUsed)
            )
          )
          .filter(
            (receipt: DetectedGmailReceipt) =>
              !ignoredIdsRef.current.includes(receipt.id) &&
              (!effectiveStartDate || !receipt.date || receipt.date >= effectiveStartDate)
          );

        const newReviewCandidates: GmailReviewCandidate[] = (data.reviewCandidates || [])
          .filter(
            (candidate: GmailReviewCandidate) =>
              typeof candidate.id === 'string' &&
              candidate.id.length > 0 &&
              !existingIds.has(candidate.id) &&
              !ignoredIdsRef.current.includes(candidate.id) &&
              (!effectiveStartDate || !candidate.date || candidate.date >= effectiveStartDate)
          )
          .map((candidate: GmailReviewCandidate) => ({
            ...candidate,
            recurringRuleMismatch:
              candidate.recurringRuleMismatch ||
              hasSimilarRecurringRule(
                recurringRulesRef.current,
                candidate.sender,
                candidate.subject
              ),
          }));

        setReviewCandidates((previous) => {
          const byId = new Map(previous.map((candidate) => [candidate.id, candidate]));
          newReviewCandidates.forEach((candidate) => byId.set(candidate.id, candidate));
          return [...byId.values()];
        });

        const uniqueNewReceipts = newReceipts.filter((receipt) => {
          if (existingIds.has(receipt.id)) return false;
          existingIds.add(receipt.id);
          return true;
        });

        setDetectedReceipts((previous) =>
          page === 1 && !pageToken ? uniqueNewReceipts : [...previous, ...uniqueNewReceipts]
        );
        if (data.modelUsed) setAnalysisModel(data.modelUsed);
        if (data.fallbackUsed) {
          setScanNotice(
            'Gemini AI temporaneamente non disponibile: scansione completata con motore euristico locale. Verifica o modifica importi ed esercenti prima di importare.'
          );
        }

        const initialSelection: Record<string, boolean> = {};
        uniqueNewReceipts.forEach((receipt) => {
          initialSelection[receipt.id] = true;
        });
        setSelectedIds((previous) =>
          page === 1 && !pageToken ? initialSelection : { ...previous, ...initialSelection }
        );

        setNextPageToken(currentPageToken || null);
        setScanStats({
          candidateCount: resultEstimate,
          messagesProcessed: processedCount,
          batchesProcessed,
          messagesAnalyzed: analyzedCount,
          failedMessageReads: failedCount,
          recurringRuleMatchCount,
          skippedNonTransactionalCount,
          skippedImportedCount: skippedCount,
          skippedIgnoredCount: ignoredCount,
          skippedScannedCount: scannedCount,
          suppressedLowConfidenceCount,
          hasMoreCandidates: hasMore,
        });
      } while (currentPageToken && !stopAfterCurrentBatchRef.current);

      setScanStatus(currentPageToken ? 'stopped' : 'complete');
    } catch (err: any) {
      console.error('Gmail scan error:', err);
      setError(err.message || 'Impossibile completare la scansione Gmail.');
      setScanStatus('error');
    } finally {
      setIsSyncing(false);
      setScanProgress(null);
      setStopRequested(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleUpdateDetectedReceipt = (
    id: string,
    patch: Partial<Pick<DetectedGmailReceipt, 'merchant' | 'total'>>
  ) => {
    setDetectedReceipts((previous) =>
      previous.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const handleImportSelected = () => {
    const selectedList = detectedReceipts.filter(
      (r, idx) => selectedIds[r.id || `rec-${idx}`]
    );

    if (selectedList.length === 0) return;
    if (!confirmZeroImport && selectedList.some((receipt) => !(Number(receipt.total) > 0))) {
      setConfirmZeroImport(true);
      return;
    }

    const formatted: Omit<Expense, 'id'>[] = selectedList.map((r) => ({
      title: r.merchant || 'Ricevuta Digitale',
      amount: Number(r.total) || 0,
      currency: r.currency || profile.currency,
      date: r.date || new Date().toISOString().slice(0, 10),
      category: (r.category as ExpenseCategory) || 'Shopping',
      payer: defaultPayer,
      splitType: '50_50',
      source: 'gmail',
      sourceReference: r.id,
      notes: r.itemsDescription
        ? `Fattura email: ${r.itemsDescription}`
        : 'Sincronizzato da ricevuta Gmail',
    }));

    onImportExpenses(formatted);
    const importedIds = new Set(selectedList.map((receipt) => receipt.id));
    setDetectedReceipts((current) => current.filter((receipt) => !importedIds.has(receipt.id)));
    setSelectedIds((current) => {
      const updated = { ...current };
      importedIds.forEach((id) => delete updated[id]);
      return updated;
    });
    setConfirmZeroImport(false);
    onClose();
  };

  const handleIgnoreReceipt = (messageId: string) => {
    const detectedItem = detectedReceipts.find((receipt) => receipt.id === messageId);
    const candidateItem = reviewCandidates.find((candidate) => candidate.id === messageId);
    if (detectedItem) {
      setLastIgnoredItem({
        kind: 'receipt',
        item: detectedItem,
        wasSelected: Boolean(selectedIds[messageId]),
      });
    } else if (candidateItem) {
      setLastIgnoredItem({
        kind: 'candidate',
        item: candidateItem,
      });
    }

    ignoredIdsRef.current = [...new Set([...ignoredIdsRef.current, messageId])];
    onIgnoreGmailMessage(messageId);
    setDetectedReceipts((current) => current.filter((receipt) => receipt.id !== messageId));
    setReviewCandidates((current) => current.filter((candidate) => candidate.id !== messageId));
    setSelectedIds((current) => {
      const updated = { ...current };
      delete updated[messageId];
      return updated;
    });
  };

  const handleUndoIgnoreLast = () => {
    if (!lastIgnoredItem) return;
    const { kind, item, wasSelected } = lastIgnoredItem;
    ignoredIdsRef.current = ignoredIdsRef.current.filter((id) => id !== item.id);
    onUnignoreGmailMessage?.(item.id);
    if (kind === 'receipt') {
      const receipt = item as DetectedGmailReceipt;
      setDetectedReceipts((current) =>
        current.some((existing) => existing.id === receipt.id) ? current : [receipt, ...current]
      );
      if (wasSelected) {
        setSelectedIds((current) => ({ ...current, [receipt.id]: true }));
      }
    } else {
      const candidate = item as GmailReviewCandidate;
      setReviewCandidates((current) =>
        current.some((existing) => existing.id === candidate.id)
          ? current
          : [candidate, ...current]
      );
    }
    setLastIgnoredItem(null);
  };

  const handleIgnoreAllReviewCandidates = () => {
    const messageIds = reviewCandidates.map((candidate) => candidate.id);
    if (messageIds.length === 0) return;
    ignoredIdsRef.current = [...new Set([...ignoredIdsRef.current, ...messageIds])];
    messageIds.forEach(onIgnoreGmailMessage);
    setReviewCandidates([]);
    setConfirmIgnoreAll(false);
  };

  const handlePromoteReviewCandidate = (candidate: GmailReviewCandidate) => {
    const receipt: DetectedGmailReceipt = {
      id: candidate.id,
      merchant: candidate.merchant || getDefaultMerchant(candidate.sender),
      total: Number(candidate.total) || 0,
      currency: candidate.currency || profile.currency,
      date: candidate.date || new Date().toISOString().slice(0, 10),
      category: candidate.category || 'Altro',
      itemsDescription: candidate.itemsDescription || '',
      confidence: candidate.confidence,
      sourceEmailSubject: candidate.subject,
      sourceEmailSender: candidate.sender,
    };
    setDetectedReceipts((current) =>
      current.some((item) => item.id === candidate.id) ? current : [...current, receipt]
    );
    setSelectedIds((current) => ({ ...current, [candidate.id]: true }));
    setReviewCandidates((current) => current.filter((item) => item.id !== candidate.id));
  };

  const handleSaveRecurringRule = (receipt: DetectedGmailReceipt) => {
    const rawAmount =
      recurringAmountDrafts[receipt.id] ??
      (Number(receipt.total) > 0 ? String(receipt.total) : '');
    const amount = Number(rawAmount.replace(',', '.'));
    const sender = String(receipt.sourceEmailSender || '').trim();
    const subject = String(receipt.sourceEmailSubject || '').trim();

    if (!sender || !subject || !Number.isFinite(amount) || amount <= 0) {
      setError('Inserisci un importo maggiore di zero per creare la regola ricorrente.');
      return;
    }

    const rule: GmailRecurringRule = {
      sender,
      subject,
      merchant: String(
        recurringMerchantDrafts[receipt.id] || receipt.merchant || getDefaultMerchant(sender)
      ),
      amount,
      currency: String(receipt.currency || profile.currency),
      category:
        recurringCategoryDrafts[receipt.id] ||
        (receipt.category as ExpenseCategory) ||
        'Bollette e Utenze',
    };

    recurringRulesRef.current = [
      ...recurringRulesRef.current.filter(
        (existing) =>
          normalizeRuleValue(existing.sender) !== normalizeRuleValue(sender) ||
          normalizeRuleValue(existing.subject) !== normalizeRuleValue(subject)
      ),
      rule,
    ];
    onSaveRecurringRule(rule);

    const parsedDate = receipt.dateHeader ? new Date(receipt.dateHeader) : null;
    const currentReceipt: DetectedGmailReceipt = {
      ...receipt,
      merchant: rule.merchant,
      total: rule.amount,
      currency: rule.currency,
      category: rule.category,
      date:
        parsedDate && !Number.isNaN(parsedDate.getTime())
          ? parsedDate.toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
      recurringRuleApplied: true,
    };

    setDetectedReceipts((current) => {
      const exists = current.some((item) => item.id === receipt.id);
      return exists
        ? current.map((item) => (item.id === receipt.id ? currentReceipt : item))
        : [...current, currentReceipt];
    });
    setSelectedIds((current) => ({ ...current, [receipt.id]: true }));
    setReviewCandidates((current) => current.filter((candidate) => candidate.id !== receipt.id));
    setScanNotice(
      `Regola salvata: ${rule.merchant} · ${rule.amount.toFixed(2)} ${rule.currency}. Questa email è pronta per l'importazione.`
    );
    setError(null);
  };

  const selectedCount = Object.values(selectedIds).filter(Boolean).length;
  const selectedZeroCount = detectedReceipts.filter(
    (receipt) => selectedIds[receipt.id] && !(Number(receipt.total) > 0)
  ).length;

  const footer = (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onClose}
          className="ds-btn-secondary min-h-10 px-4 text-xs"
        >
          {isSyncing ? 'Continua in background' : 'Chiudi'}
        </button>
        {isSignedIn && detectedReceipts.length > 0 && (
          <button
            type="button"
            onClick={handleImportSelected}
            disabled={selectedCount === 0 || isSyncing}
            className="ds-btn-primary min-h-10 px-5 text-xs"
          >
            <Check className="w-4 h-4" />
            <span>
              {isSyncing
                ? 'Scansione in corso...'
                : `Importa ${selectedCount} spese`}
            </span>
          </button>
        )}
      </div>
      {isSyncing && (
        <p className="text-[11px] text-stone-500">
          Puoi chiudere questa finestra: la scansione continuerà in background.
        </p>
      )}
      {selectedZeroCount > 0 && (
        <p className="text-right text-[11px] font-semibold text-amber-800">
          Attenzione: {selectedZeroCount} selezionata/e senza importo verificato.
        </p>
      )}
    </div>
  );

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        title="Sincronizzazione Ricevute Gmail"
        subtitle="Rilevamento automatico di fatture e ordini digitali"
        icon={Mail}
        closeLabel="Chiudi sincronizzazione Gmail"
        mobileBottomSheet
        footer={footer}
      >
        <div className="p-4 sm:p-6 space-y-4">
          {!isSignedIn ? (
            <GmailConnectPrompt isLoggingIn={isLoggingIn} onSignIn={handleSignIn} />
          ) : (
            <div className="space-y-4">
              <GmailScanControls
                userEmail={userEmail}
                isSyncing={isSyncing}
                hasPendingPage={Boolean(nextPageToken)}
                searchMode={searchMode}
                lookbackDays={lookbackDays}
                customStartDate={customStartDate}
                trackingStartDate={profile.trackingStartDate}
                effectiveStartDate={effectiveStartDate}
                onScan={() => runGmailScan(undefined, nextPageToken || undefined)}
                onSignOut={handleSignOut}
                onChangeSearchMode={(mode) => {
                  setSearchMode(mode);
                  setDetectedReceipts([]);
                  setReviewCandidates([]);
                  setSelectedIds({});
                  setScanStats(null);
                  setNextPageToken(null);
                }}
                onChangeLookbackDays={(days) => {
                  setLookbackDays(days);
                  setDetectedReceipts([]);
                  setReviewCandidates([]);
                  setSelectedIds({});
                  setScanStats(null);
                  setNextPageToken(null);
                }}
                onChangeCustomStartDate={(date) => {
                  setCustomStartDate(date);
                  setDetectedReceipts([]);
                  setReviewCandidates([]);
                  setSelectedIds({});
                  setScanStats(null);
                  setNextPageToken(null);
                }}
                onOpenStartingPoint={
                  onOpenStartingPoint
                    ? () => {
                        onClose();
                        onOpenStartingPoint();
                      }
                    : undefined
                }
              />

              <GmailScanStatus
                isSyncing={isSyncing}
                detectedCount={detectedReceipts.length}
                scanProgress={scanProgress}
                stopRequested={stopRequested}
                onRequestStop={() => {
                  stopAfterCurrentBatchRef.current = true;
                  setStopRequested(true);
                }}
                error={error}
                scanStats={scanStats}
                scanStatus={scanStatus}
              />

              {lastIgnoredItem && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-700"
                >
                  <span className="min-w-0 truncate">
                    Email ignorata:{' '}
                    <strong className="text-stone-900">
                      {lastIgnoredItem.kind === 'receipt'
                        ? (lastIgnoredItem.item as DetectedGmailReceipt).merchant || 'Ricevuta'
                        : (lastIgnoredItem.item as GmailReviewCandidate).subject ||
                          (lastIgnoredItem.item as GmailReviewCandidate).sender}
                    </strong>
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleUndoIgnoreLast}
                      className="min-h-9 px-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Annulla</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLastIgnoredItem(null)}
                      aria-label="Chiudi avviso email ignorata"
                      className="min-h-9 min-w-9 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-200/60 inline-flex items-center justify-center cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {detectedReceipts.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                      Acquisti Digitali Trovati ({detectedReceipts.length})
                    </span>
                    <span className="text-[11px] text-stone-500">Controlla e seleziona le spese</span>
                  </div>

                  {analysisModel && (
                    <p className="text-[11px] text-stone-500">Analizzato con {analysisModel}</p>
                  )}

                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-stone-600 block">
                      Chi ha pagato:
                    </span>
                    <PayerSelector
                      value={defaultPayer}
                      onChange={setDefaultPayer}
                      profile={profile}
                      size="sm"
                      showSelfHint={false}
                    />
                  </div>

                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {detectedReceipts.map((r, idx) => {
                      const id = r.id || `rec-${idx}`;
                      return (
                        <GmailReceiptCard
                          key={id}
                          receipt={r}
                          isChecked={!!selectedIds[id]}
                          currencyFallback={profile.currency}
                          isRecurringSetupOpen={recurringSetupId === id}
                          recurringAmountDraft={
                            recurringAmountDrafts[id] ??
                            (Number(r.total) > 0 ? String(r.total) : '')
                          }
                          onToggleSelect={() => toggleSelect(id)}
                          onIgnore={() => handleIgnoreReceipt(id)}
                          onUpdateReceipt={(patch) => handleUpdateDetectedReceipt(id, patch)}
                          onToggleRecurringSetup={() =>
                            setRecurringSetupId((current) => (current === id ? null : id))
                          }
                          onChangeRecurringAmount={(value) =>
                            setRecurringAmountDrafts((current) => ({ ...current, [id]: value }))
                          }
                          onSaveRecurringRule={() => handleSaveRecurringRule(r)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              <GmailReviewCandidateList
                candidates={reviewCandidates}
                currency={profile.currency}
                categoryOptions={getActiveCategories(profile, goals)}
                recurringSetupId={recurringSetupId}
                recurringMerchantDrafts={recurringMerchantDrafts}
                recurringAmountDrafts={recurringAmountDrafts}
                recurringCategoryDrafts={recurringCategoryDrafts}
                onOpenIgnoreAllConfirm={() => setConfirmIgnoreAll(true)}
                onIgnoreCandidate={handleIgnoreReceipt}
                onPromoteCandidate={handlePromoteReviewCandidate}
                onSetRecurringSetupId={setRecurringSetupId}
                onChangeMerchantDraft={(id, value) =>
                  setRecurringMerchantDrafts((current) => ({ ...current, [id]: value }))
                }
                onChangeAmountDraft={(id, value) =>
                  setRecurringAmountDrafts((current) => ({ ...current, [id]: value }))
                }
                onChangeCategoryDraft={(id, category) =>
                  setRecurringCategoryDrafts((current) => ({ ...current, [id]: category }))
                }
                onSaveRecurringRule={handleSaveRecurringRule}
              />

              {scanNotice && (
                <p
                  role="status"
                  aria-live="polite"
                  className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800"
                >
                  {scanNotice}
                </p>
              )}

              {!isSyncing &&
                detectedReceipts.length === 0 &&
                reviewCandidates.length === 0 &&
                !error && (
                  <div className="text-center py-6 text-stone-500 text-xs">
                    <p>Nessuna spesa con importo verificabile rilevata nelle email analizzate.</p>
                    {analysisModel && (
                      <p className="mt-1 text-[11px]">Analizzato con {analysisModel}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => runGmailScan()}
                      className="mt-2 text-orange-600 font-semibold hover:underline cursor-pointer"
                    >
                      Effettua Nuova Ricerca
                    </button>
                  </div>
                )}
            </div>
          )}
        </div>
      </ModalShell>

      <ConfirmDialog
        isOpen={confirmZeroImport}
        variant="warning"
        title="Importi non verificati"
        description={`Hai selezionato ${selectedZeroCount} spesa/e con importo €0,00. Puoi correggere l’importo o impostare una regola ricorrente. Vuoi importarle comunque?`}
        confirmLabel="Importa comunque"
        cancelLabel="Controlla"
        onConfirm={handleImportSelected}
        onCancel={() => setConfirmZeroImport(false)}
      />

      <ConfirmDialog
        isOpen={confirmIgnoreAll}
        variant="danger"
        title="Ignorare tutte le email?"
        description={`Le ${reviewCandidates.length} email da controllare saranno escluse dalle prossime scansioni di DuoSpend. Non verranno cancellate da Gmail.`}
        confirmLabel="Ignora tutte"
        cancelLabel="Annulla"
        onConfirm={handleIgnoreAllReviewCandidates}
        onCancel={() => setConfirmIgnoreAll(false)}
      />
    </>
  );
};
