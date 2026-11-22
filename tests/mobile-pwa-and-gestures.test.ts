import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardOverview } from '../src/components/DashboardOverview';
import { ExpenseList } from '../src/components/ExpenseList';
import { LoginGate } from '../src/components/LoginGate';
import { Navbar } from '../src/components/Navbar';
import { NotificationSyncModal } from '../src/components/NotificationSyncModal';
import { SettlementView } from '../src/components/SettlementView';
import { CategoryBadge } from '../src/components/ui/CategoryBadge';
import { ConfirmDialog } from '../src/components/ui/ConfirmDialog';
import { RowActionMenu } from '../src/components/ui/RowActionMenu';
import { UndoToast } from '../src/components/ui/UndoToast';
import { formatCompactSplitLabel, formatShortExpenseDate } from '../src/constants/categories';
import {
  computeSmartIncrementalProposal,
  evaluateGmailScanFreshness,
  recordCompletedGmailScan,
  resolveRequestedScanStartDate,
  sanitizeGmailScanState,
} from '../src/services/gmail-scan-history';
import type { CoupleProfile, Expense, Settlement } from '../src/types';
import {
  getOverlayHistorySnapshot,
  pushAppRouteHistory,
  registerOverlayHistory,
  resetOverlayHistoryForTests,
  unregisterOverlayHistory,
} from '../src/utils/overlayHistory';
import {
  computeHybridSwipeOffset,
  computeHybridSwipeVisual,
  determineSwipeAxis,
  getFullSwipeThreshold,
  resolveHybridSwipeRelease,
} from '../src/utils/swipeGestures';

const sampleProfile: CoupleProfile = {
  userName: 'Marco',
  partnerName: 'Giulia',
  monthlyBudget: 2800,
  currency: 'EUR',
};

const sampleExpense: Expense = {
  id: 'exp-mobile-1',
  title: 'Esselunga Spesa',
  amount: 64.5,
  currency: 'EUR',
  date: `${new Date().getFullYear()}-11-18`,
  category: 'Spesa',
  payer: 'user',
  splitType: '50_50',
  source: 'manual',
};

const sampleSettlement: Settlement = {
  id: 'stl-mobile-1',
  amount: 32.25,
  currency: 'EUR',
  date: `${new Date().getFullYear()}-11-19`,
  from: 'partner',
  to: 'user',
  note: 'Pareggio Revolut',
};

describe('Gesti swipe ibridi Android, menu ⋮, UndoToast e PWA', () => {
  describe('Motore swipe ibrido (swipeGestures)', () => {
    it('dà priorità allo scroll verticale rispetto allo swipe orizzontale sui conflitti assiali', () => {
      expect(determineSwipeAxis(4, 5)).toBe('pending');
      expect(determineSwipeAxis(8, 8)).toBe('vertical');
      expect(determineSwipeAxis(5, 12)).toBe('vertical');
      expect(determineSwipeAxis(12, 5)).toBe('horizontal');
      expect(determineSwipeAxis(-14, 3)).toBe('horizontal');
    });

    it('calcola soglia full-swipe e offset con smorzamento elastico e resistenza nelle direzioni disabilitate', () => {
      expect(getFullSwipeThreshold(240)).toBe(152);
      expect(getFullSwipeThreshold(360)).toBeCloseTo(172.8, 5);
      expect(getFullSwipeThreshold(600)).toBe(220);

      expect(
        computeHybridSwipeOffset({
          baseOffset: 0,
          rawDx: 0,
          allowLeft: true,
          allowRight: true,
          width: 360,
        })
      ).toBe(0);

      expect(
        computeHybridSwipeOffset({
          baseOffset: 0,
          rawDx: 90,
          allowLeft: true,
          allowRight: true,
          width: 360,
        })
      ).toBe(90);

      // Oltre fullThreshold (172.8 su width=360) applica smorzamento elastico
      const damped = computeHybridSwipeOffset({
        baseOffset: 0,
        rawDx: 232.8,
        allowLeft: true,
        allowRight: true,
        width: 360,
      });
      expect(damped).toBeCloseTo(193.8, 1);

      // Direzione disabilitata limitata a resistenza minima (±18)
      expect(
        computeHybridSwipeOffset({
          baseOffset: 0,
          rawDx: 200,
          allowLeft: true,
          allowRight: false,
          width: 360,
        })
      ).toBe(18);
      expect(
        computeHybridSwipeOffset({
          baseOffset: 0,
          rawDx: -200,
          allowLeft: false,
          allowRight: true,
          width: 360,
        })
      ).toBe(-18);
    });

    it('gestisce swipe corto (apertura bottoni), swipe lungo/veloce (azione diretta) e chiusura', () => {
      // Swipe corto verso sinistra -> apre cassetto destro (side: 'left')
      expect(
        resolveHybridSwipeRelease({
          offsetX: -65,
          baseOffset: 0,
          velocityX: -0.1,
          width: 360,
          allowLeft: true,
          allowRight: true,
        })
      ).toEqual({ openSide: 'left', trigger: 'none' });

      // Swipe corto verso destra -> apre cassetto sinistro (side: 'right')
      expect(
        resolveHybridSwipeRelease({
          offsetX: 65,
          baseOffset: 0,
          velocityX: 0.1,
          width: 360,
          allowLeft: true,
          allowRight: true,
        })
      ).toEqual({ openSide: 'right', trigger: 'none' });

      // Drag insufficiente -> richiude
      expect(
        resolveHybridSwipeRelease({
          offsetX: -22,
          baseOffset: 0,
          velocityX: -0.05,
          width: 360,
          allowLeft: true,
          allowRight: true,
        })
      ).toEqual({ openSide: null, trigger: 'none' });

      // Swipe lungo deciso verso sinistra -> attiva trigger 'left' e chiude
      expect(
        resolveHybridSwipeRelease({
          offsetX: -180,
          baseOffset: 0,
          velocityX: -0.2,
          width: 360,
          allowLeft: true,
          allowRight: true,
        })
      ).toEqual({ openSide: null, trigger: 'left' });

      // Lancio veloce verso destra -> attiva trigger 'right'
      expect(
        resolveHybridSwipeRelease({
          offsetX: 120,
          baseOffset: 0,
          velocityX: 0.9,
          width: 360,
          allowLeft: true,
          allowRight: true,
        })
      ).toEqual({ openSide: null, trigger: 'right' });

      // Ritorno da stato aperto verso chiusura
      expect(
        resolveHybridSwipeRelease({
          offsetX: -72,
          baseOffset: -88,
          velocityX: 0.35,
          width: 360,
          allowLeft: true,
          allowRight: true,
        })
      ).toEqual({ openSide: null, trigger: 'none' });

      // Secondo swipe deciso mentre era aperto -> attiva trigger 'left'
      expect(
        resolveHybridSwipeRelease({
          offsetX: -175,
          baseOffset: -88,
          velocityX: -0.2,
          width: 360,
          allowLeft: true,
          allowRight: true,
        })
      ).toEqual({ openSide: null, trigger: 'left' });

      expect(computeHybridSwipeVisual(0, 360)).toEqual({
        direction: 'none',
        revealRatio: 0,
        fullRatio: 0,
        armed: false,
      });
      expect(computeHybridSwipeVisual(-180, 360)).toEqual({
        direction: 'left',
        revealRatio: 1,
        fullRatio: 1,
        armed: true,
      });
    });
  });

  describe('Manifest PWA Android, Service Worker e intestazioni server', () => {
    it('valida public/manifest.webmanifest rispetto ad asset reali, rotte e icone maskable', () => {
      const publicDir = path.resolve(process.cwd(), 'public');
      const manifestRaw = fs.readFileSync(path.join(publicDir, 'manifest.webmanifest'), 'utf8');
      const manifest = JSON.parse(manifestRaw) as {
        id: string;
        name: string;
        short_name: string;
        start_url: string;
        scope: string;
        display: string;
        orientation: string;
        prefer_related_applications: boolean;
        categories: string[];
        icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
        shortcuts: Array<{ name: string; url: string; icons?: Array<{ src: string }> }>;
        share_target: {
          action: string;
          method: string;
          params: Record<string, string>;
        };
      };

      expect(manifest.id).toBe('/');
      expect(manifest.name).toContain('DuoSpend');
      expect(manifest.short_name).toBe('DuoSpend');
      expect(manifest.start_url).toBe('/?source=pwa');
      expect(manifest.scope).toBe('/');
      expect(manifest.display).toBe('standalone');
      expect(manifest.orientation).toBe('any');
      expect(manifest.prefer_related_applications).toBe(false);
      expect(manifest.categories.length).toBeGreaterThan(0);

      for (const icon of manifest.icons) {
        const cleanFile = icon.src.split('?')[0].replace(/^\/+/, '');
        expect(fs.existsSync(path.join(publicDir, cleanFile))).toBe(true);
      }

      const maskableIcons = manifest.icons.filter((i) => i.purpose === 'maskable');
      const anyIcons = manifest.icons.filter((i) => i.purpose === 'any');
      expect(maskableIcons.length).toBeGreaterThan(0);
      expect(anyIcons.some((i) => i.sizes === '192x192')).toBe(true);
      expect(anyIcons.some((i) => i.sizes === '512x512')).toBe(true);
      expect(maskableIcons.every((i) => i.src !== anyIcons[1]?.src)).toBe(true);

      const appTsx = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
      const hookTs = fs.readFileSync(
        path.resolve(process.cwd(), 'src/hooks/useDuoSpendData.ts'),
        'utf8'
      );

      for (const shortcut of manifest.shortcuts) {
        const parsed = new URL(shortcut.url, 'https://duospend.local');
        if (parsed.pathname !== '/') {
          expect(appTsx).toContain(`'${parsed.pathname}'`);
        }
        const actionParam = parsed.searchParams.get('action');
        if (actionParam) {
          expect(hookTs).toContain(actionParam);
        }
        for (const sIcon of shortcut.icons ?? []) {
          const cleanFile = sIcon.src.split('?')[0].replace(/^\/+/, '');
          expect(fs.existsSync(path.join(publicDir, cleanFile))).toBe(true);
        }
      }

      expect(manifest.share_target.action).toBe('/');
      expect(manifest.share_target.method).toBe('GET');
      expect(manifest.share_target.params).toMatchObject({
        title: 'title',
        text: 'text',
        url: 'url',
      });
    });

    it('preserva regole sicurezza Service Worker, zoom in index.html, updateViaCache e header server', () => {
      const swSource = fs.readFileSync(path.resolve(process.cwd(), 'public/sw.js'), 'utf8');
      expect(swSource).toContain("const CACHE_NAME = 'duospend-shell-v10'");
      expect(swSource).toContain("url.pathname.startsWith('/api/')");
      expect(swSource).toContain("url.pathname === '/manifest.webmanifest'");
      expect(swSource).toContain('!url.search');

      const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
      expect(indexHtml).toContain('/manifest.webmanifest?v=4');
      expect(indexHtml).not.toContain('user-scalable=no');
      expect(indexHtml).not.toContain('maximum-scale=1');

      const mainTsx = fs.readFileSync(path.resolve(process.cwd(), 'src/main.tsx'), 'utf8');
      expect(mainTsx).toContain("updateViaCache: 'none'");

      const serverApp = fs.readFileSync(path.resolve(process.cwd(), 'server/app.ts'), 'utf8');
      expect(serverApp).toContain("normalized.endsWith('/manifest.webmanifest')");
      expect(serverApp).toContain('no-cache, no-store, must-revalidate');
      expect(serverApp).toContain('application/manifest+json; charset=utf-8');
    });
  });

  describe('Accessibilità UI SSR, menu compatto ⋮ e alternative ai gesti', () => {
    it('rende ConfirmDialog, UndoToast e RowActionMenu con attributi ARIA completi', () => {
      const confirmHtml = renderToStaticMarkup(
        React.createElement(ConfirmDialog, {
          isOpen: true,
          title: 'Eliminare questa spesa?',
          description: 'Esselunga Spesa verrà rimossa.',
          confirmLabel: 'Elimina',
          onConfirm: () => {},
          onCancel: () => {},
        })
      );
      expect(confirmHtml).toContain('role="alertdialog"');
      expect(confirmHtml).toContain('aria-modal="true"');
      expect(confirmHtml).toContain('aria-describedby=');
      expect(confirmHtml).toContain('Esselunga Spesa verrà rimossa.');

      const toastHtml = renderToStaticMarkup(
        React.createElement(UndoToast, {
          notice: {
            id: 'undo-1',
            message: 'Spesa "Esselunga Spesa" eliminata.',
            onUndo: () => {},
          },
          onDismiss: () => {},
        })
      );
      expect(toastHtml).toContain('role="status"');
      expect(toastHtml).toContain('aria-live="polite"');
      expect(toastHtml).toContain('Ripristina');
      expect(toastHtml).toContain('Chiudi avviso di ripristino');

      const menuHtml = renderToStaticMarkup(
        React.createElement(RowActionMenu, {
          label: 'Azioni per Esselunga Spesa',
          items: [
            { id: 'edit', label: 'Modifica spesa', icon: null, onSelect: () => {} },
            {
              id: 'delete',
              label: 'Elimina spesa',
              icon: null,
              tone: 'danger',
              onSelect: () => {},
            },
          ],
        })
      );
      expect(menuHtml).toContain('aria-label="Azioni per Esselunga Spesa"');
      expect(menuHtml).toContain('aria-haspopup="menu"');
      expect(menuHtml).toContain('aria-expanded="false"');
      expect(menuHtml).toContain('data-no-swipe="true"');
    });

    it('mantiene controlli accessibili su ExpenseList, DashboardOverview, SettlementView, NotificationSyncModal e Navbar', () => {
      const expenseListHtml = renderToStaticMarkup(
        React.createElement(ExpenseList, {
          expenses: [sampleExpense],
          profile: sampleProfile,
          onEditExpense: () => {},
          onDeleteExpense: () => {},
          onOpenScanReceipt: () => {},
        })
      );
      expect(expenseListHtml).toContain('aria-label="Cerca spese per negozio, articolo o nota"');
      expect(expenseListHtml).toContain('aria-label="Azioni per Esselunga Spesa"');
      expect(expenseListHtml).toContain('aria-label="Modifica Esselunga Spesa"');
      expect(expenseListHtml).toContain('aria-label="Elimina Esselunga Spesa"');
      expect((expenseListHtml.match(/title="Spesa"/g) ?? []).length).toBe(1);

      const dashboardHtml = renderToStaticMarkup(
        React.createElement(DashboardOverview, {
          expenses: [sampleExpense],
          profile: sampleProfile,
          netBalance: 32.25,
          totalSharedSpend: 64.5,
          userTotalPaid: 64.5,
          partnerTotalPaid: 0,
          onOpenSettlement: () => {},
          onNavigateTab: () => {},
          onSelectExpense: () => {},
          onDeleteExpense: () => {},
        })
      );
      expect(dashboardHtml).toContain('Ultime Spese di Coppia');
      expect(dashboardHtml).toContain('€32.25');
      expect(dashboardHtml).toContain('aria-label="Azioni per Esselunga Spesa"');
      expect(dashboardHtml).toContain('aria-label="Elimina Esselunga Spesa"');
      expect((dashboardHtml.match(/title="Spesa"/g) ?? []).length).toBe(1);
      expect(dashboardHtml).not.toContain('Manuale');

      const settlementHtml = renderToStaticMarkup(
        React.createElement(SettlementView, {
          expenses: [sampleExpense],
          settlements: [sampleSettlement],
          profile: sampleProfile,
          netBalance: 0,
          totalSharedSpend: 64.5,
          userTotalPaid: 64.5,
          partnerTotalPaid: 0,
          onOpenSettlement: () => {},
          onDeleteSettlement: () => {},
        })
      );
      expect(settlementHtml).toContain(`aria-label="Annulla rimborso del ${sampleSettlement.date}"`);

      const notifHtml = renderToStaticMarkup(
        React.createElement(NotificationSyncModal, {
          isOpen: true,
          onClose: () => {},
          onImportExpenses: () => {},
          profile: sampleProfile,
        })
      );
      expect(notifHtml).toContain('role="dialog"');
      expect(notifHtml).toContain('aria-modal="true"');
      expect(notifHtml).toContain('Espandi pannello o trascina giù per chiudere');
      expect(notifHtml).toContain('role="tablist"');

      const navbarHtml = renderToStaticMarkup(
        React.createElement(Navbar, {
          currentTab: 'dashboard',
          onTabChange: () => {},
          profile: sampleProfile,
          onOpenSecurityModal: () => {},
          onLockVault: () => {},
          theme: 'dark',
          onToggleTheme: () => {},
          canInstallPwa: true,
          onInstallPwa: () => {},
        })
      );
      expect(navbarHtml).toContain('aria-label="Installa app DuoSpend su questo dispositivo"');
      expect(navbarHtml).toContain('aria-haspopup="menu"');
      expect(navbarHtml).toContain('ds-bottom-dock');
    });

    it('formatta date e quote compatte, evita collisioni inline-flex/hidden su CategoryBadge e rende LoginGate completo', () => {
      expect(formatCompactSplitLabel({ splitType: '50_50' })).toBe('50/50');
      expect(formatCompactSplitLabel({ splitType: 'custom', customSplitRatio: 0.7 })).toBe('70%');
      expect(formatCompactSplitLabel({ splitType: '100_user' })).toBe('Personale');
      expect(formatCompactSplitLabel({ splitType: '100_partner' })).toBe('Personale');

      expect(formatShortExpenseDate('2026-11-21', 2026)).toBe('21 nov');
      expect(formatShortExpenseDate('2025-11-21', 2026)).toBe('21 nov 25');

      const hiddenBadgeHtml = renderToStaticMarkup(
        React.createElement(CategoryBadge, {
          category: 'Spesa',
          size: 'lg',
          className: 'hidden sm:flex',
        })
      );
      expect(hiddenBadgeHtml).not.toMatch(/\binline-flex\b/);
      expect(hiddenBadgeHtml).toContain('hidden sm:flex');

      const prodLoginHtml = renderToStaticMarkup(
        React.createElement(LoginGate, {
          profile: sampleProfile,
          onUnlock: async () => true,
          enableLocalDevelopmentLogin: false,
          theme: 'dark',
          onToggleTheme: () => {},
        })
      );
      expect(prodLoginHtml).toContain('Duo');
      expect(prodLoginHtml).toContain('Spend');
      expect(prodLoginHtml).toContain('Accedi con Google');
      expect(prodLoginHtml).toContain('Accesso verificato dal server');
      expect(prodLoginHtml).toContain('aria-label="Attiva tema chiaro"');
      expect(prodLoginHtml).not.toContain('Password di sviluppo locale');

      const devLoginHtml = renderToStaticMarkup(
        React.createElement(LoginGate, {
          profile: sampleProfile,
          onUnlock: async () => true,
          enableLocalDevelopmentLogin: true,
        })
      );
      expect(devLoginHtml).toContain('aria-label="Password di sviluppo locale"');
      expect(devLoginHtml).toContain('Sviluppo locale');
    });
  });

  describe('Stack overlay Android Back (overlayHistory) e animazioni GPU CSS', () => {
    const originalWindow = (globalThis as { window?: unknown }).window;

    function installMockWindowHistory(initialPath = '/spese') {
      const entries: Array<{ state: unknown; url: string }> = [
        { state: { tab: 'expenses' }, url: `https://duospend.local${initialPath}` },
      ];
      let index = 0;
      const listeners = new Set<(event: PopStateEvent) => void>();
      const pushSpy = vi.fn((state: unknown, _title: string, url?: string | URL | null) => {
        entries.splice(index + 1);
        const resolvedUrl =
          typeof url === 'string'
            ? url.startsWith('http')
              ? url
              : `https://duospend.local${url}`
            : entries[index].url;
        entries.push({ state, url: resolvedUrl });
        index = entries.length - 1;
      });
      const replaceSpy = vi.fn((state: unknown, _title: string, url?: string | URL | null) => {
        const resolvedUrl =
          typeof url === 'string'
            ? url.startsWith('http')
              ? url
              : `https://duospend.local${url}`
            : entries[index].url;
        entries[index] = { state, url: resolvedUrl };
      });
      const dispatchPopState = () => {
        const current = entries[index];
        const event = { state: current.state } as PopStateEvent;
        for (const fn of listeners) {
          fn(event);
        }
      };
      const goSpy = vi.fn((delta: number) => {
        const nextIndex = Math.max(0, Math.min(entries.length - 1, index + delta));
        if (nextIndex === index) return;
        index = nextIndex;
        queueMicrotask(dispatchPopState);
      });

      const mockWindow = {
        location: {
          get href() {
            return entries[index].url;
          },
        },
        history: {
          get state() {
            return entries[index].state;
          },
          pushState: pushSpy,
          replaceState: replaceSpy,
          go: goSpy,
        },
        addEventListener: (type: string, fn: (event: PopStateEvent) => void) => {
          if (type === 'popstate') listeners.add(fn);
        },
        removeEventListener: (type: string, fn: (event: PopStateEvent) => void) => {
          if (type === 'popstate') listeners.delete(fn);
        },
        simulateHardwareBack: async () => {
          index = Math.max(0, index - 1);
          dispatchPopState();
          await Promise.resolve();
        },
        get entriesCount() {
          return entries.length;
        },
        get currentIndex() {
          return index;
        },
      };

      (globalThis as { window: unknown }).window = mockWindow;
      return { mockWindow, pushSpy, replaceSpy, goSpy };
    }

    afterEach(() => {
      resetOverlayHistoryForTests();
      vi.useRealTimers();
      if (originalWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window?: unknown }).window = originalWindow;
      }
    });

    it('chiude solo l’overlay in cima allo stack al tasto Indietro e riallinea la history', async () => {
      vi.useFakeTimers();
      const { mockWindow, pushSpy, goSpy } = installMockWindowHistory('/spese');

      const onCloseModal = vi.fn();
      const onCloseConfirm = vi.fn();

      const modalId = registerOverlayHistory(onCloseModal);
      vi.runAllTimers();
      expect(pushSpy).toHaveBeenCalledTimes(1);
      expect(getOverlayHistorySnapshot()).toEqual({ stackLength: 1, pushedDepth: 1 });

      registerOverlayHistory(onCloseConfirm);
      vi.runAllTimers();
      expect(pushSpy).toHaveBeenCalledTimes(2);
      expect(getOverlayHistorySnapshot()).toEqual({ stackLength: 2, pushedDepth: 2 });

      // Primo Indietro: chiude solo ConfirmDialog, la modale sottostante resta aperta
      await mockWindow.simulateHardwareBack();
      expect(onCloseConfirm).toHaveBeenCalledTimes(1);
      expect(onCloseModal).not.toHaveBeenCalled();
      expect(getOverlayHistorySnapshot()).toEqual({ stackLength: 1, pushedDepth: 1 });

      // Secondo Indietro: chiude la modale e riporta la history allo stato iniziale
      await mockWindow.simulateHardwareBack();
      expect(onCloseModal).toHaveBeenCalledTimes(1);
      expect(getOverlayHistorySnapshot()).toEqual({ stackLength: 0, pushedDepth: 0 });
      expect(goSpy).not.toHaveBeenCalled();
      expect(mockWindow.currentIndex).toBe(0);

      // Unregister tardivo di un id già chiuso via Back non esegue doppie navigazioni
      unregisterOverlayHistory(modalId);
      vi.runAllTimers();
      expect(goSpy).not.toHaveBeenCalled();
    });

    it('gestisce chiusura manuale, transizione modale->modale nello stesso tick e cambio rotta da menu', async () => {
      vi.useFakeTimers();
      const { mockWindow, pushSpy, replaceSpy, goSpy } = installMockWindowHistory('/spese');

      const onCloseFirst = vi.fn();
      const onCloseSecond = vi.fn();

      const id1 = registerOverlayHistory(onCloseFirst);
      vi.runAllTimers();
      expect(pushSpy).toHaveBeenCalledTimes(1);

      // Chiusura di modale A e apertura simultanea di modale B nello stesso commit:
      // non deve chiamare history.go(-1) né creare race
      unregisterOverlayHistory(id1);
      const id2 = registerOverlayHistory(onCloseSecond);
      vi.runAllTimers();
      expect(goSpy).not.toHaveBeenCalled();
      expect(getOverlayHistorySnapshot()).toEqual({ stackLength: 1, pushedDepth: 1 });

      // Chiusura manuale di B: rimuove in silenzio la entry senza chiudere altri overlay
      unregisterOverlayHistory(id2);
      vi.runAllTimers();
      expect(goSpy).toHaveBeenCalledWith(-1);
      await Promise.resolve();
      expect(onCloseFirst).not.toHaveBeenCalled();
      expect(onCloseSecond).not.toHaveBeenCalled();
      expect(getOverlayHistorySnapshot()).toEqual({ stackLength: 0, pushedDepth: 0 });

      // Cambio tab da menu aperto: sostituisce lo slot overlay invece di lasciare voci morte
      const onCloseMenu = vi.fn();
      registerOverlayHistory(onCloseMenu);
      vi.runAllTimers();
      pushAppRouteHistory({ tab: 'advisor' }, '/advisor');
      expect(replaceSpy).toHaveBeenCalledWith({ tab: 'advisor' }, '', '/advisor');
      expect(mockWindow.location.href).toBe('https://duospend.local/advisor');
      expect(getOverlayHistorySnapshot()).toEqual({ stackLength: 0, pushedDepth: 0 });
    });

    it('verifica classi CSS animazioni device-only e integrazione useOverlayBackHandler nei dialoghi', () => {
      const css = fs.readFileSync(
        path.resolve(process.cwd(), 'src/styles/components.css'),
        'utf8'
      );
      expect(css).toContain('.ds-anim-backdrop');
      expect(css).toContain('.ds-anim-dialog');
      expect(css).toContain('.ds-anim-sheet');
      expect(css).toContain('.ds-anim-view');
      expect(css).toContain('.ds-anim-pop');
      expect(css).toContain('.ds-anim-fab-stagger');
      expect(css).toContain('.ds-stagger');
      expect(css).toContain('.ds-expand-in');

      const modalShell = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/ui/ModalShell.tsx'),
        'utf8'
      );
      const confirmDialog = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/ui/ConfirmDialog.tsx'),
        'utf8'
      );
      expect(modalShell).toContain('useOverlayBackHandler');
      expect(confirmDialog).toContain('useOverlayBackHandler');
    });
  });

  describe('Persistenza Gmail, proposta incrementale anti-ripescaggio e avvisi anti-falsi-positivi', () => {
    it('ricorda il periodo 30 giorni, propone la data incrementale dopo 15 gg ed evita falsi allarmi su giorni senza email', () => {
      // 1. Nessuna scansione mai effettuata -> nessun avviso falso positivo
      expect(
        evaluateGmailScanFreshness({
          gmailScanState: { searchMode: 'days', lookbackDays: 30 },
          accountEmail: 'marco@example.com',
          todayIso: '2026-11-22',
        })
      ).toBeNull();

      // 2. Utente esegue scansione "Ultimi 30 giorni" il 07/11/2026
      const scanNov07Start = resolveRequestedScanStartDate({
        searchMode: 'days',
        lookbackDays: 30,
        todayIso: '2026-11-07',
      });
      expect(scanNov07Start).toBe('2026-10-08');

      const stateAfterNov07 = recordCompletedGmailScan(undefined, {
        accountEmail: 'marco@example.com',
        searchMode: 'days',
        lookbackDays: 30,
        scanStartDate: scanNov07Start!,
        scanEndDate: '2026-11-07',
      });

      const sanitizedRoundTrip = sanitizeGmailScanState(
        JSON.parse(JSON.stringify(stateAfterNov07))
      );
      expect(sanitizedRoundTrip?.searchMode).toBe('days');
      expect(sanitizedRoundTrip?.lookbackDays).toBe(30);

      // 3. 15 giorni dopo (22/11/2026), la finestra 30 giorni partirebbe dal 23/10/2026:
      // l'app propone in automatico il 07/11/2026 evitando 15 giorni già scansionati
      const requestedOnNov22 = resolveRequestedScanStartDate({
        searchMode: 'days',
        lookbackDays: 30,
        todayIso: '2026-11-22',
      });
      expect(requestedOnNov22).toBe('2026-10-23');

      const proposal = computeSmartIncrementalProposal({
        gmailScanState: sanitizedRoundTrip,
        accountEmail: 'marco@example.com',
        searchMode: 'days',
        requestedStartDate: requestedOnNov22,
        todayIso: '2026-11-22',
      });
      expect(proposal).toEqual({
        shouldApply: true,
        proposedStartDate: '2026-11-07',
        requestedStartDate: '2026-10-23',
        coveredUntilDate: '2026-11-07',
        savedDays: 15,
        daysSinceLastScan: 15,
        alreadyScannedToday: false,
      });

      // E segnala i 15 giorni scoperti con proposta di ripresa dal 07/11/2026
      expect(
        evaluateGmailScanFreshness({
          gmailScanState: sanitizedRoundTrip,
          accountEmail: 'marco@example.com',
          todayIso: '2026-11-22',
        })
      ).toEqual({
        isStale: true,
        daysSinceLastScan: 15,
        lastScannedDate: '2026-11-07',
        suggestedResumeDate: '2026-11-07',
      });

      // 4. Scansione completata il 20/11 (anche con 0 email/spese trovate):
      // al 22/11 (2 giorni dopo) NON deve scattare nessun falso allarme!
      const stateAfterEmptyScan = recordCompletedGmailScan(sanitizedRoundTrip, {
        accountEmail: 'marco@example.com',
        searchMode: 'days',
        lookbackDays: 30,
        scanStartDate: '2026-11-07',
        scanEndDate: '2026-11-20',
      });
      expect(
        stateAfterEmptyScan.accounts?.['marco@example.com']?.coverageIntervals
      ).toEqual([{ from: '2026-10-08', until: '2026-11-20' }]);
      expect(
        evaluateGmailScanFreshness({
          gmailScanState: stateAfterEmptyScan,
          accountEmail: 'marco@example.com',
          todayIso: '2026-11-22',
        })
      ).toBeNull();

      // 5. Se l'utente estende la ricerca indietro prima dell'intervallo coperto (90 gg = 24/08),
      // la proposta NON salta la parte non ancora scansionata
      expect(
        computeSmartIncrementalProposal({
          gmailScanState: stateAfterEmptyScan,
          accountEmail: 'marco@example.com',
          searchMode: 'days',
          requestedStartDate: '2026-08-24',
          todayIso: '2026-11-22',
        })
      ).toBeNull();
    });
  });
});
