import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VisionBoard } from '../src/components/VisionBoard';
import { ChallengeCompactCard } from '../src/components/vision/ChallengeCompactCard';
import { ChallengeDetailPanel } from '../src/components/vision/ChallengeDetailPanel';
import { ChallengeFormModal } from '../src/components/vision/ChallengeFormModal';
import { ContributionConfirmModal } from '../src/components/vision/ContributionConfirmModal';
import { SavingsChallengesSection } from '../src/components/vision/SavingsChallengesSection';
import {
  fetchSavingsChallenges,
  isOfflineNetworkError,
  loadCachedSavingsChallenges,
  saveCachedSavingsChallenges,
  SavingsChallengeApiError,
} from '../src/services/savings-challenges';
import { UNAUTHORIZED_EVENT } from '../src/services/storage';
import type { CoupleProfile, SavingGoal, SavingsChallenge } from '../src/types';

const sampleProfile: CoupleProfile = {
  userName: 'Partner 1',
  partnerName: 'Partner 2',
  monthlyBudget: 2800,
  currency: 'EUR',
};

const sampleGoals: SavingGoal[] = [
  {
    id: 'goal-1',
    title: 'Viaggio di Nozze Costiera Amalfitana',
    targetAmount: 4000,
    currentAmount: 2650,
    targetDate: '2027-06-15',
  },
];

const sampleChallenge: SavingsChallenge = {
  id: 'chg-ui-1',
  title: 'Sfida Ristoranti e Bar con Nome Molto Lungo per Verificare Avvolgimento Testo Senza Overflow',
  goalId: 'goal-1',
  goalTitleSnapshot: 'Viaggio di Nozze Costiera Amalfitana',
  categories: ['Ristoranti e Bar'],
  monthlyLimit: 999999.99,
  currency: 'EUR',
  startMonth: '2026-11',
  durationMonths: 1,
  startDate: '2026-11-01',
  endDate: '2026-11-30',
  status: 'active',
  splitScope: 'all',
  initialSpend: 0,
  currentValidSpend: 250,
  virtualSavingsAccumulated: 999749.99,
  virtualSavingsApplied: 50,
  lastReconciledAt: '2026-11-21T13:00:00.000Z',
  timezone: 'Europe/Rome',
  createdBy: 'Partner 1',
  createdAt: '2026-11-01T09:00:00.000Z',
  updatedAt: '2026-11-21T13:00:00.000Z',
  version: 2,
  periods: [
    {
      id: 'chg-ui-1:2026-11',
      challengeId: 'chg-ui-1',
      periodYm: '2026-11',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      monthlyLimit: 999999.99,
      validSpend: 250,
      virtualSavingsPotential: 999749.99,
      virtualSavingsApplied: 50,
      matchedExpenseCount: 2,
      excludedExpenseCount: 0,
      status: 'active',
      reconciledAt: '2026-11-21T13:00:00.000Z',
    },
  ],
  metrics: {
    totalLimit: 999999.99,
    validSpend: 250,
    remainingBudget: 999749.99,
    exceededAmount: 0,
    consumedPercent: 0,
    barPercent: 0,
    virtualSavingsPotential: 999749.99,
    virtualSavingsApplied: 50,
    virtualSavingsAvailable: 999699.99,
    daysTotal: 30,
    daysElapsed: 21,
    daysRemaining: 9,
    isPeriodConcluded: false,
    matchedExpenseCount: 2,
    matchedExpensesPreview: [
      {
        id: 'exp-1',
        title: 'Osteria del Borgo',
        date: '2026-11-10',
        amount: 250,
        currency: 'EUR',
        category: 'Ristoranti e Bar',
        splitType: '50_50',
      },
    ],
    sharedSpend: 250,
    personalSpend: 0,
    excludedBreakdown: {
      foreignCurrencyCount: 0,
      foreignCurrencies: [],
      zeroOrQuarantineCount: 0,
      negativeOrInvalidCount: 0,
      futureExpenseCount: 0,
      futureScheduledTotal: 0,
      personalExcludedCount: 0,
      settlementsAlwaysExcluded: true,
    },
    overlappingChallengeIds: [],
    overlappingCategories: [],
    orphanedCategories: [],
    goalLinked: true,
    healthState: 'positive',
    statusMessage: 'Avete creato €999699.99 virtuali potenziali per Viaggio di Nozze Costiera Amalfitana.',
  },
};

const createMemoryStorage = () => {
  const store = new Map<string, string>();
  return {
    store,
    api: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
  };
};

describe('UI, accessibilità, PWA offline e riconnessione Sfide di Risparmio', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('integra Sfide di Risparmio nella Vision Board con layout 2 colonne desktop, accessibilità ARIA, nomi lunghi e valori estremi', () => {
    const html = renderToStaticMarkup(
      React.createElement(VisionBoard, {
        goals: sampleGoals,
        expenses: [],
        profile: sampleProfile,
        onUpdateGoalImage: () => {},
        onAddGoal: () => {},
        onUpdateGoal: () => {},
        onDeleteGoal: () => {},
      })
    );

    expect(html).toContain('Sfide di Risparmio');
    expect(html).toContain('savings-challenges-heading');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');

    // Card compatta con nomi lunghi, valori estremi e attributi accessibili
    const compactHtml = renderToStaticMarkup(
      React.createElement(ChallengeCompactCard, {
        challenge: sampleChallenge,
        isSelected: true,
        onSelect: () => {},
      })
    );
    expect(compactHtml).toContain('aria-pressed="true"');
    expect(compactHtml).toContain('role="progressbar"');
    expect(compactHtml).toContain('999999.99');
    expect(compactHtml).toContain('9 gg rimasti');
    expect(compactHtml).toContain('In linea');

    // Dettaglio sfida: nessuna classifica/competizione, messaggio non-bancario, action accessibili
    const detailHtml = renderToStaticMarkup(
      React.createElement(ChallengeDetailPanel, {
        challenge: sampleChallenge,
        linkedGoal: sampleGoals[0],
        history: [],
        contributions: [],
        isLoadingHistory: false,
        isOffline: false,
        isBusy: false,
        onPrepareContribution: () => {},
        onEdit: () => {},
        onPause: () => {},
        onResume: () => {},
        onComplete: () => {},
        onRecalculate: () => {},
        onRequestRevertContribution: () => {},
        onRequestDelete: () => {},
      })
    );
    expect(detailHtml).toContain('role="img"');
    expect(detailHtml).toContain('Nessun conto reale è stato modificato');
    expect(detailHtml).toContain('Prepara contributo virtuale');
    expect(detailHtml).toContain('Rimuovi ultimo contributo');
    expect(detailHtml.toLowerCase()).not.toContain('classifica');
  });

  it('rende accordion chiusi di default con indicatori a colori, dettaglio espandibile inline e paginazione oltre 5 sfide', () => {
    const loadingHtml = renderToStaticMarkup(
      React.createElement(SavingsChallengesSection, {
        goals: sampleGoals,
        expenses: [],
        profile: sampleProfile,
        initialChallenges: [],
        initialLoading: true,
      })
    );
    expect(loadingHtml).toContain('aria-busy="true"');

    const emptyHtml = renderToStaticMarkup(
      React.createElement(SavingsChallengesSection, {
        goals: sampleGoals,
        expenses: [],
        profile: sampleProfile,
        initialChallenges: [],
        initialLoading: false,
      })
    );
    expect(emptyHtml).toContain('Nessuna sfida di risparmio attiva');
    expect(emptyHtml).toContain('Crea la prima sfida');

    // Stato collassato di default: mostra indicatore colore (bg-emerald-500), barra compatta e metriche senza aprire il dettaglio
    const collapsedOfflineErrorHtml = renderToStaticMarkup(
      React.createElement(SavingsChallengesSection, {
        goals: sampleGoals,
        expenses: [],
        profile: sampleProfile,
        initialChallenges: [sampleChallenge],
        initialLoading: false,
        initialOffline: true,
        initialError: 'Errore temporaneo server',
      })
    );
    expect(collapsedOfflineErrorHtml).toContain('aria-expanded="false"');
    expect(collapsedOfflineErrorHtml).toContain('bg-emerald-500');
    expect(collapsedOfflineErrorHtml).toContain('Connessione assente');
    expect(collapsedOfflineErrorHtml).toContain('role="alert"');
    expect(collapsedOfflineErrorHtml).toContain('Errore temporaneo server');
    expect(collapsedOfflineErrorHtml).not.toContain('Prepara contributo virtuale');

    // Stato espanso inline: mostra region accessibile, layout desktop 2 colonne e storico chiuso di default
    const expandedHtml = renderToStaticMarkup(
      React.createElement(SavingsChallengesSection, {
        goals: sampleGoals,
        expenses: [],
        profile: sampleProfile,
        initialChallenges: [sampleChallenge],
        initialExpandedChallengeId: 'chg-ui-1',
        initialLoading: false,
      })
    );
    expect(expandedHtml).toContain('aria-expanded="true"');
    expect(expandedHtml).toContain('role="region"');
    expect(expandedHtml).toContain('lg:grid-cols-12');
    expect(expandedHtml).toContain('Prepara contributo virtuale');
    expect(expandedHtml).toContain('Chiudi dettaglio');

    // Paginazione compatta oltre 5 sfide
    const sevenChallenges: SavingsChallenge[] = Array.from({ length: 7 }, (_, i) => ({
      ...sampleChallenge,
      id: `chg-ui-${i + 1}`,
      title: `Sfida Numero ${i + 1}`,
    }));
    const paginatedHtml = renderToStaticMarkup(
      React.createElement(SavingsChallengesSection, {
        goals: sampleGoals,
        expenses: [],
        profile: sampleProfile,
        initialChallenges: sevenChallenges,
        initialLoading: false,
      })
    );
    expect(paginatedHtml).toContain('Sfida Numero 1');
    expect(paginatedHtml).toContain('Sfida Numero 5');
    expect(paginatedHtml).not.toContain('Sfida Numero 6');
    expect(paginatedHtml).toContain('Mostra tutte le 7 sfide (+2)');
  });

  it('rende modali accessibili (role=dialog, aria-modal, mobile bottom-sheet) per creazione e contributo virtuale', () => {
    const formHtml = renderToStaticMarkup(
      React.createElement(ChallengeFormModal, {
        isOpen: true,
        onClose: () => {},
        goals: sampleGoals,
        profile: sampleProfile,
        onSubmit: async () => {},
      })
    );
    expect(formHtml).toContain('role="dialog"');
    expect(formHtml).toContain('aria-modal="true"');
    expect(formHtml).toContain('Nuova sfida di risparmio');
    expect(formHtml).toContain('Nessun conto bancario viene modificato');

    const contribHtml = renderToStaticMarkup(
      React.createElement(ContributionConfirmModal, {
        isOpen: true,
        challenge: sampleChallenge,
        onClose: () => {},
        onConfirm: async () => {},
      })
    );
    expect(contribHtml).toContain('role="dialog"');
    expect(contribHtml).toContain('Conferma contributo virtuale');
  });

  it('gestisce cache offline, riconnessione/risincronizzazione e sessione scaduta nel client service', async () => {
    const localMem = createMemoryStorage();
    vi.stubGlobal('localStorage', localMem.api);

    const dispatched: string[] = [];
    vi.stubGlobal('window', {
      dispatchEvent: (event: Event) => {
        dispatched.push(event.type);
        return true;
      },
    });
    vi.stubGlobal('CustomEvent', class MockEvent {
      public readonly type: string;
      constructor(type: string) {
        this.type = type;
      }
    });

    // 1. Salvataggio e recupero cache offline
    saveCachedSavingsChallenges({
      challenges: [sampleChallenge],
      goalSummaries: [],
    });
    expect(loadCachedSavingsChallenges()?.challenges).toHaveLength(1);

    // 2. Errore rete offline rilevato correttamente
    expect(isOfflineNetworkError(new TypeError('Failed to fetch'))).toBe(true);

    // 3. Riconnessione -> fetchSavingsChallenges aggiorna cache locale
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          challenges: [sampleChallenge],
          goalSummaries: [],
          policy: {
            formula: 'max(0, limite - speso)',
            currencyPolicy: 'EUR',
            splitPolicy: 'all',
            excludedItemsPolicy: 'none',
            virtualTransferPolicy: 'virtual',
          },
          lastUpdated: '2026-11-21T13:05:00.000Z',
        }),
      })
    );

    const synced = await fetchSavingsChallenges();
    expect(synced.challenges).toHaveLength(1);
    expect(loadCachedSavingsChallenges()?.challenges[0]?.id).toBe('chg-ui-1');

    // 4. Sessione scaduta (401) -> dispatch UNAUTHORIZED_EVENT + SavingsChallengeApiError
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Autenticazione richiesta.' }),
      })
    );

    await expect(fetchSavingsChallenges()).rejects.toBeInstanceOf(SavingsChallengeApiError);
    expect(dispatched).toContain(UNAUTHORIZED_EVENT);
  });

  it('verifica che il Service Worker non metta in cache /api/savings-challenges e che prefers-reduced-motion e safe-areas siano preservati', () => {
    const swPath = path.resolve(process.cwd(), 'public/sw.js');
    const swSource = fs.readFileSync(swPath, 'utf8');
    expect(swSource).toContain("url.pathname.startsWith('/api/')");
    expect(swSource).toContain('duospend-shell-v10');

    const baseCssPath = path.resolve(process.cwd(), 'src/styles/base.css');
    const baseCss = fs.readFileSync(baseCssPath, 'utf8');
    expect(baseCss).toContain('prefers-reduced-motion: reduce');

    const indexHtmlPath = path.resolve(process.cwd(), 'index.html');
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    expect(indexHtml).not.toContain('user-scalable=no');
  });
});
