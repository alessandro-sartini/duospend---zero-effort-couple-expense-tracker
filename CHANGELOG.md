# Changelog

Tutte le modifiche rilevanti a **DuoSpend** sono documentate in questo file secondo il formato [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e il [Semantic Versioning](https://semver.org/lang/it/).

## [1.1.0] - 2026-11-22

### Added
- Chiusura nativa con il tasto Indietro (Android/browser) per tutte le modali bottom sheet (`ModalShell`), finestre di conferma (`ConfirmDialog`, `DeveloperResetConfirmDialog`), menu `⋮` (`RowActionMenu`), azioni rapide `+` (`QuickActionsFab`) e menu mobile `Altro` tramite stack LIFO sincronizzato con `window.history` (`overlayHistory` e `useOverlayBackHandler`).
- Animazioni GPU CSS client-side a zero impatto sul server (`ds-anim-sheet`, `ds-anim-dialog`, `ds-anim-backdrop`, `ds-anim-view`, `ds-anim-pop`, `ds-anim-fab-stagger`, `ds-stagger`, `ds-expand-in`, contatori fluidi `useAnimatedNumber` e feedback tattile sui bottoni) con supporto automatico a `prefers-reduced-motion: reduce`.
- Nuova schermata di accesso mobile-first (`LoginGate.tsx`) compatibile con tema chiaro/scuro e safe area.
- Swipe ibrido Android (trascinamento parziale con bottoni solidi o swipe lungo con feedback aptico, conferma e `UndoToast` con ripristino) su Registro Spese e Ultime Spese.

### Fixed
- Risolto il bug delle icone categoria duplicate su smartphone in `ExpenseList` dovuto alla collisione `inline-flex` / `hidden` in `CategoryBadge` e `RowActionMenu`.
- Migliorata la leggibilità smartphone di filtri e righe spesa (`formatShortExpenseDate`, `formatCompactSplitLabel`) e aggiornata la cache Service Worker a `duospend-shell-v10`.

## [1.0.0] - 2026-11-22

### Added
- Versionamento SemVer unificato (`package.json`, `server/version.ts`, `src/services/version.ts`, `GET /api/health`, badge UI in Impostazioni Sicurezza, build args Docker `APP_BUILD_SHA` / `APP_BUILD_TIME` e script `npm run release`).
- Sistema completo di gestione spese di coppia 50/50 con SQLite WAL, autenticazione Google OAuth lato server e PWA installabile.
- Webhook Android/MacroDroid (`POST /api/notifications/ingest`) con filtro deterministico + schema AI `isExpense` (scarta OTP, promo/sconti, accrediti), deduplicazione in-flight + cache TTL 5 minuti, `sourceReference` persistente e riconciliazione multi-app.
- Scanner scontrini OCR con validazione immagini (magic bytes, dimensioni, anti-poliglotta, strip EXIF), sincronizzazione Gmail e sfide di risparmio virtuali (`Savings Challenges`).
