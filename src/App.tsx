import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { DashboardOverview } from './components/DashboardOverview';
import { LoginGate } from './components/LoginGate';
import { Footer } from './components/layout/Footer';
import { NotFoundView } from './components/layout/NotFoundView';
import { QuickActionsFab } from './components/layout/QuickActionsFab';
import { ZeroAmountBanner } from './components/layout/ZeroAmountBanner';
import { loadGmailDraft, loadOcrDraft } from './services/storage';
import { getAuthConfig } from './services/auth';
import { FullScreenLoader } from './components/ui/Loader';
import { useDuoSpendData } from './hooks/useDuoSpendData';
import {
  applyThemePreference,
  loadThemePreference,
  saveThemePreference,
  Theme,
} from './services/theme';
import { Expense } from './types';

const ExpenseList = lazy(() =>
  import('./components/ExpenseList').then((m) => ({ default: m.ExpenseList }))
);
const CategoryAnalytics = lazy(() =>
  import('./components/CategoryAnalytics').then((m) => ({ default: m.CategoryAnalytics }))
);
const SettlementView = lazy(() =>
  import('./components/SettlementView').then((m) => ({ default: m.SettlementView }))
);
const AiAdvisorChat = lazy(() =>
  import('./components/AiAdvisorChat').then((m) => ({ default: m.AiAdvisorChat }))
);
const VisionBoard = lazy(() =>
  import('./components/VisionBoard').then((m) => ({ default: m.VisionBoard }))
);
const AddExpenseModal = lazy(() =>
  import('./components/AddExpenseModal').then((m) => ({ default: m.AddExpenseModal }))
);
const CameraReceiptModal = lazy(() =>
  import('./components/CameraReceiptModal').then((m) => ({ default: m.CameraReceiptModal }))
);
const GmailSyncDrawer = lazy(() =>
  import('./components/GmailSyncDrawer').then((m) => ({ default: m.GmailSyncDrawer }))
);
const SettlementModal = lazy(() =>
  import('./components/SettlementModal').then((m) => ({ default: m.SettlementModal }))
);
const NotificationSyncModal = lazy(() =>
  import('./components/NotificationSyncModal').then((m) => ({
    default: m.NotificationSyncModal,
  }))
);
const SecurityModal = lazy(() =>
  import('./components/SecurityModal').then((m) => ({ default: m.SecurityModal }))
);
const DeveloperModal = lazy(() =>
  import('./components/DeveloperModal').then((m) => ({ default: m.DeveloperModal }))
);

const TAB_TO_PATH: Record<string, string> = {
  dashboard: '/',
  expenses: '/spese',
  analytics: '/trend',
  settlement: '/saldo',
  advisor: '/advisor',
  vision: '/obiettivi',
};

const PATH_TO_TAB: Record<string, string> = {
  '/': 'dashboard',
  '/index.html': 'dashboard',
  '/spese': 'expenses',
  '/trend': 'analytics',
  '/saldo': 'settlement',
  '/advisor': 'advisor',
  '/obiettivi': 'vision',
};

function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed.toLowerCase();
}

function resolveTabFromPath(pathname: string): string {
  return PATH_TO_TAB[normalizePath(pathname)] ?? 'not_found';
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(loadThemePreference);
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname);
  const [currentTab, setCurrentTab] = useState<string>(() =>
    resolveTabFromPath(window.location.pathname)
  );
  const [installPromptEvent, setInstallPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isScanReceiptOpen, setIsScanReceiptOpen] = useState(false);
  const [isGmailSyncOpen, setIsGmailSyncOpen] = useState(false);
  const [isNotificationSyncOpen, setIsNotificationSyncOpen] = useState(false);
  const [isSettlementOpen, setIsSettlementOpen] = useState(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [isDevModalOpen, setIsDevModalOpen] = useState(false);
  const [isDevConsoleEnabled, setIsDevConsoleEnabled] = useState<boolean>(import.meta.env.DEV);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [onlyZeroAmountFilter, setOnlyZeroAmountFilter] = useState(false);
  const [hasOpenedGmailDrawer, setHasOpenedGmailDrawer] = useState(false);
  const [hasOpenedReceiptModal, setHasOpenedReceiptModal] = useState(false);
  const [gmailBgState, setGmailBgState] = useState<{
    isSyncing: boolean;
    detectedCount: number;
    reviewCount: number;
    scanProgress: { page: number; total: number } | null;
  }>({
    isSyncing: false,
    detectedCount: 0,
    reviewCount: 0,
    scanProgress: null,
  });
  const [receiptBgState, setReceiptBgState] = useState<{
    isAnalyzing: boolean;
    hasDraft: boolean;
    fallbackUsed: boolean;
  }>({
    isAnalyzing: false,
    hasDraft: false,
    fallbackUsed: false,
  });

  const {
    expenses,
    settlements,
    goals,
    profile,
    ignoredGmailMessageIds,
    gmailRecurringRules,
    isCheckingAuth,
    isSyncingData,
    isVaultUnlocked,
    authMethod,
    isSignedIn,
    userEmail,
    sharedNotificationText,
    setSharedNotificationText,
    pendingShortcutAction,
    setPendingShortcutAction,
    balanceSummary,
    zeroAmountExpenses,
    handleUnlock,
    handleLockVault,
    handleAuthChanged,
    handleUpdateProfile,
    handleRefreshData,
    handleSaveExpense,
    handleDeleteExpense,
    handleImportGmailExpenses,
    handleIgnoreGmailMessage,
    handleSaveGmailRecurringRule,
    handleConfirmSettlement,
    handleDeleteSettlement,
    handleUpdateGoalImage,
    handleAddGoal,
    handleUpdateGoal,
    handleDeleteGoal,
  } = useDuoSpendData();

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setInstallPromptEvent(null);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallPwa = useCallback(async () => {
    if (!installPromptEvent) return;
    try {
      await installPromptEvent.prompt();
      await installPromptEvent.userChoice;
    } finally {
      setInstallPromptEvent(null);
    }
  }, [installPromptEvent]);

  useEffect(() => {
    let active = true;
    void getAuthConfig().then((config) => {
      if (active) {
        setIsDevConsoleEnabled(Boolean(config.developerConsoleEnabled) || import.meta.env.DEV);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    applyThemePreference(theme);
    saveThemePreference(theme);
  }, [theme]);

  useEffect(() => {
    if (sharedNotificationText) {
      setIsNotificationSyncOpen(true);
    }
  }, [sharedNotificationText]);

  useEffect(() => {
    if (isGmailSyncOpen) {
      setHasOpenedGmailDrawer(true);
    }
  }, [isGmailSyncOpen]);

  useEffect(() => {
    if (isScanReceiptOpen) {
      setHasOpenedReceiptModal(true);
    }
  }, [isScanReceiptOpen]);

  useEffect(() => {
    if (!isVaultUnlocked) {
      setHasOpenedGmailDrawer(false);
      setHasOpenedReceiptModal(false);
      setGmailBgState({
        isSyncing: false,
        detectedCount: 0,
        reviewCount: 0,
        scanProgress: null,
      });
      setReceiptBgState({
        isAnalyzing: false,
        hasDraft: false,
        fallbackUsed: false,
      });
      return;
    }

    const savedGmailDraft = loadGmailDraft();
    if (
      savedGmailDraft &&
      (savedGmailDraft.wasSyncing ||
        savedGmailDraft.detectedReceipts.length > 0 ||
        savedGmailDraft.reviewCandidates.length > 0)
    ) {
      setHasOpenedGmailDrawer(true);
      setGmailBgState({
        isSyncing: Boolean(savedGmailDraft.wasSyncing),
        detectedCount: savedGmailDraft.detectedReceipts.length,
        reviewCount: savedGmailDraft.reviewCandidates.length,
        scanProgress: null,
      });
    }

    const savedOcrDraft = loadOcrDraft<{ fallbackUsed?: boolean }>();
    if (
      savedOcrDraft &&
      (savedOcrDraft.extractedData || (savedOcrDraft.wasAnalyzing && savedOcrDraft.imagePreview))
    ) {
      setHasOpenedReceiptModal(true);
      setReceiptBgState({
        isAnalyzing: Boolean(savedOcrDraft.wasAnalyzing && !savedOcrDraft.extractedData),
        hasDraft: Boolean(savedOcrDraft.extractedData),
        fallbackUsed: Boolean(savedOcrDraft.extractedData?.fallbackUsed),
      });
    }
  }, [isVaultUnlocked]);

  useEffect(() => {
    if (!isVaultUnlocked || !pendingShortcutAction) return;
    if (pendingShortcutAction === 'add-expense') {
      setEditingExpense(null);
      setIsAddExpenseOpen(true);
    } else if (pendingShortcutAction === 'paste-notification') {
      setIsNotificationSyncOpen(true);
    } else if (pendingShortcutAction === 'scan-receipt') {
      setIsScanReceiptOpen(true);
    }
    setPendingShortcutAction(null);
  }, [isVaultUnlocked, pendingShortcutAction, setPendingShortcutAction]);

  useEffect(() => {
    const handlePopState = () => {
      const nextPath = window.location.pathname;
      setCurrentPath(nextPath);
      setCurrentTab(resolveTabFromPath(nextPath));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToTab = useCallback((tab: string) => {
    const targetPath = TAB_TO_PATH[tab];
    if (!targetPath) {
      setCurrentTab('not_found');
      return;
    }
    setCurrentTab(tab);
    setCurrentPath(targetPath);
    if (normalizePath(window.location.pathname) !== targetPath) {
      window.history.pushState({ tab }, '', targetPath);
    }
  }, []);

  const openNewExpenseModal = () => {
    setEditingExpense(null);
    setIsAddExpenseOpen(true);
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setIsAddExpenseOpen(true);
  };

  if (isCheckingAuth) {
    return (
      <div data-theme={theme}>
        <FullScreenLoader />
      </div>
    );
  }

  if (!isVaultUnlocked) {
    return (
      <div data-theme={theme}>
        <LoginGate
          profile={profile}
          onUnlock={handleUnlock}
          enableLocalDevelopmentLogin={import.meta.env.DEV}
        />
        {import.meta.env.DEV && isDevModalOpen && (
          <Suspense fallback={null}>
            <DeveloperModal
              isOpen={isDevModalOpen}
              onClose={() => setIsDevModalOpen(false)}
              profile={profile}
              expenses={expenses}
              settlements={settlements}
              goals={goals}
              onRefreshData={handleRefreshData}
              onSaveExpense={(expense) => handleSaveExpense(expense)}
            />
          </Suspense>
        )}
      </div>
    );
  }

  return (
    <div data-theme={theme} className="min-h-screen w-full max-w-full overflow-x-clip bg-[#FAFAF8] text-stone-900 flex flex-col font-sans">
      <Navbar
        currentTab={currentTab}
        onTabChange={navigateToTab}
        profile={profile}
        isSyncingData={isSyncingData}
        authMethod={authMethod}
        onOpenSecurityModal={() => setIsSecurityModalOpen(true)}
        onLockVault={handleLockVault}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
      />

      <main className="flex-1 min-w-0 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-10 pt-5 pb-24 sm:pt-8 sm:pb-12">
        <ZeroAmountBanner
          count={zeroAmountExpenses.length}
          onGoToExpenses={() => {
            navigateToTab('expenses');
            if (zeroAmountExpenses.length === 1) {
              setOnlyZeroAmountFilter(false);
              handleEditExpense(zeroAmountExpenses[0]);
            } else if (zeroAmountExpenses.length > 1) {
              setOnlyZeroAmountFilter(true);
            }
          }}
        />

        {currentTab === 'not_found' && (
          <NotFoundView pathname={currentPath} onNavigate={navigateToTab} />
        )}

        {currentTab === 'dashboard' && (
          <DashboardOverview
            expenses={expenses}
            profile={profile}
            netBalance={balanceSummary.netBalance}
            totalSharedSpend={balanceSummary.totalSharedSpend}
            userTotalPaid={balanceSummary.userTotalPaid}
            partnerTotalPaid={balanceSummary.partnerTotalPaid}
            onOpenSettlement={() => setIsSettlementOpen(true)}
            onOpenSecurityModal={() => setIsSecurityModalOpen(true)}
            onNavigateTab={navigateToTab}
            onSelectExpense={handleEditExpense}
          />
        )}

        <Suspense
          fallback={
            <div className="ds-card p-8 text-center text-xs text-stone-500">
              Caricamento sezione...
            </div>
          }
        >
          {currentTab === 'expenses' && (
            <ExpenseList
              expenses={expenses}
              profile={profile}
              goals={goals}
              onEditExpense={handleEditExpense}
              onDeleteExpense={handleDeleteExpense}
              onOpenScanReceipt={() => setIsScanReceiptOpen(true)}
              onlyZeroAmount={onlyZeroAmountFilter && zeroAmountExpenses.length > 0}
              onClearZeroAmountFilter={() => setOnlyZeroAmountFilter(false)}
            />
          )}

          {currentTab === 'analytics' && (
            <CategoryAnalytics
              expenses={expenses}
              profile={profile}
              goals={goals}
              onUpdateProfile={handleUpdateProfile}
              onSelectExpense={handleEditExpense}
              onNavigateTab={navigateToTab}
            />
          )}

          {currentTab === 'settlement' && (
            <SettlementView
              expenses={expenses}
              settlements={settlements}
              profile={profile}
              netBalance={balanceSummary.netBalance}
              totalSharedSpend={balanceSummary.totalSharedSpend}
              userTotalPaid={balanceSummary.userTotalPaid}
              partnerTotalPaid={balanceSummary.partnerTotalPaid}
              onOpenSettlement={() => setIsSettlementOpen(true)}
              onDeleteSettlement={handleDeleteSettlement}
              onSelectExpense={handleEditExpense}
            />
          )}

          {currentTab === 'advisor' && (
            <AiAdvisorChat
              expenses={expenses}
              profile={profile}
              netBalance={balanceSummary.netBalance}
              totalSharedSpend={balanceSummary.totalSharedSpend}
            />
          )}

          {currentTab === 'vision' && (
            <VisionBoard
              goals={goals}
              profile={profile}
              onUpdateGoalImage={handleUpdateGoalImage}
              onAddGoal={handleAddGoal}
              onUpdateGoal={handleUpdateGoal}
              onDeleteGoal={handleDeleteGoal}
            />
          )}
        </Suspense>
      </main>

      <Suspense fallback={null}>
        {isAddExpenseOpen && (
          <AddExpenseModal
            isOpen={isAddExpenseOpen}
            onClose={() => {
              setIsAddExpenseOpen(false);
              setEditingExpense(null);
            }}
            onSave={(data) => handleSaveExpense(data, editingExpense?.id)}
            onDelete={editingExpense ? handleDeleteExpense : undefined}
            onCreditGoal={(goalId, delta) => {
              const target = goals.find((g) => g.id === goalId);
              if (target) {
                handleUpdateGoal({
                  ...target,
                  currentAmount: Math.round((target.currentAmount + delta) * 100) / 100,
                });
              }
            }}
            profile={profile}
            goals={goals}
            initialData={editingExpense || undefined}
          />
        )}

        {(isScanReceiptOpen ||
          (hasOpenedReceiptModal && (receiptBgState.isAnalyzing || receiptBgState.hasDraft))) && (
          <CameraReceiptModal
            isOpen={isScanReceiptOpen}
            onClose={() => setIsScanReceiptOpen(false)}
            onExpenseExtracted={(data) => handleSaveExpense(data)}
            profile={profile}
            goals={goals}
            onBackgroundStateChange={setReceiptBgState}
          />
        )}

        {(isGmailSyncOpen ||
          (hasOpenedGmailDrawer &&
            (gmailBgState.isSyncing ||
              gmailBgState.detectedCount > 0 ||
              gmailBgState.reviewCount > 0))) && (
          <GmailSyncDrawer
            isOpen={isGmailSyncOpen}
            onClose={() => setIsGmailSyncOpen(false)}
            onImportExpenses={handleImportGmailExpenses}
            existingGmailSourceReferences={expenses.flatMap((expense) =>
              expense.source === 'gmail' && expense.sourceReference ? [expense.sourceReference] : []
            )}
            ignoredGmailSourceReferences={ignoredGmailMessageIds}
            onIgnoreGmailMessage={handleIgnoreGmailMessage}
            gmailRecurringRules={gmailRecurringRules}
            onSaveRecurringRule={handleSaveGmailRecurringRule}
            profile={profile}
            goals={goals}
            isSignedIn={isSignedIn}
            userEmail={userEmail}
            onAuthChanged={handleAuthChanged}
            onBackgroundStateChange={setGmailBgState}
          />
        )}

        {isSettlementOpen && (
          <SettlementModal
            isOpen={isSettlementOpen}
            onClose={() => setIsSettlementOpen(false)}
            onConfirmSettlement={handleConfirmSettlement}
            profile={profile}
            netBalance={balanceSummary.netBalance}
          />
        )}

        {isNotificationSyncOpen && (
          <NotificationSyncModal
            isOpen={isNotificationSyncOpen}
            onClose={() => {
              setIsNotificationSyncOpen(false);
              setSharedNotificationText('');
            }}
            onImportExpenses={handleImportGmailExpenses}
            profile={profile}
            initialNotificationText={sharedNotificationText}
            canInstallPwa={Boolean(installPromptEvent)}
            onInstallPwa={handleInstallPwa}
          />
        )}

        {isSecurityModalOpen && (
          <SecurityModal
            isOpen={isSecurityModalOpen}
            onClose={() => setIsSecurityModalOpen(false)}
            profile={profile}
            onUpdateProfile={handleUpdateProfile}
            onLockVault={handleLockVault}
            currentUserEmail={userEmail}
            isDevelopmentSession={authMethod === 'development'}
            onOpenDevModal={isDevConsoleEnabled ? () => setIsDevModalOpen(true) : undefined}
          />
        )}

        {isDevConsoleEnabled && isDevModalOpen && (
          <DeveloperModal
            isOpen={isDevModalOpen}
            onClose={() => setIsDevModalOpen(false)}
            profile={profile}
            expenses={expenses}
            settlements={settlements}
            goals={goals}
            onRefreshData={handleRefreshData}
            onSaveExpense={(expense) => handleSaveExpense(expense)}
          />
        )}
      </Suspense>

      <QuickActionsFab
        isAnyModalOpen={
          isAddExpenseOpen ||
          isScanReceiptOpen ||
          isGmailSyncOpen ||
          isNotificationSyncOpen ||
          isSettlementOpen ||
          isSecurityModalOpen ||
          isDevModalOpen
        }
        isGmailSyncOpen={isGmailSyncOpen}
        isScanReceiptOpen={isScanReceiptOpen}
        gmailBgState={gmailBgState}
        receiptBgState={receiptBgState}
        onOpenScanReceipt={() => setIsScanReceiptOpen(true)}
        onOpenAddExpense={() => {
          setEditingExpense(null);
          setIsAddExpenseOpen(true);
        }}
        onOpenNotificationSync={() => setIsNotificationSyncOpen(true)}
        onOpenGmailSync={() => setIsGmailSyncOpen(true)}
      />

      <Footer
        onOpenDevModal={isDevConsoleEnabled ? () => setIsDevModalOpen(true) : undefined}
      />
    </div>
  );
}
