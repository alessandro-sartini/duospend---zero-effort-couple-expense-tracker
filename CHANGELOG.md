# Changelog

Tutte le modifiche rilevanti a **DuoSpend** sono documentate in questo file secondo il formato [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e il [Semantic Versioning](https://semver.org/lang/it/).

## [1.2.0] - 2026-11-26

### Added
- Deduplicazione notifiche bancarie multi-livello su finestra estesa (72 ore / ±3 giorni) con serializzazione concorrente per `payer` (`withNotificationPersistLock`) e distinzione automatica tra duplicati certi (stesso testo/hash, stesso esercente normalizzato, re-notifiche/contabilizzazioni bancarie oltre 15 €) e casi ambigui.
- Stato di riconciliazione `possible_duplicate` con riferimento `duplicateCandidateId` (colonna SQLite `duplicate_candidate_id` con migrazione automatica retrocompatibile) per lasciare la scelta all’utente su piccoli pagamenti ripetuti senza esercente certo (≤ 15 €) o importi identici con esercenti diversi/incerti nello stesso giorno.
- Banner di revisione inline e voci nel menu mobile `⋮` in `ExpenseList` (**Unisci** / **Mantieni separate**), compatibili con tema chiaro/scuro, Modalità Viaggio e regole ricorrenti, con pulizia automatica del riferimento se il movimento gemello viene eliminato o modificato.

### Fixed
- Corretto il parser euristico locale delle notifiche (`extractNotificationMerchant` e `extractDateFromText`) con word-boundary sulle preposizioni, priorità a `c/o` / `presso` / `esercente`, stop-word bancarie (`tramite`, `alle ore`, `sulla carta`, `sul conto`) e supporto date italiane con anno a 2 cifre (`GG/MM/AA`).
- Evitata la generazione o conservazione di titoli esercente composti da una singola lettera (es. `"P"`) sia nel prompt/normalizzatore Gemini sia in `chooseRicherTitle` durante il merge dei movimenti.

## [1.1.0] - 2026-11-22

### Added
- Barra di navigazione inferiore mobile modernizzata a dock flottante traslucido (`.ds-bottom-dock`) con indicatore attivo sottile e barra azioni superiore compatta.
- Persistenza cross-dispositivo delle impostazioni e copertura scansioni Gmail (`gmailScanState` in `localStorage` e colonna SQLite `gmail_scan_state_json`), proposta automatica della data incrementale per evitare il ripescaggio di email già controllate e promemoria anti-falsi-positivi basato sui giorni effettivamente scansionati.
- Chiusura nativa con il tasto Indietro (Android/browser) per tutte le modali bottom sheet (`ModalShell`), finestre di conferma (`ConfirmDialog`, `DeveloperResetConfirmDialog`), menu `⋮` (`RowActionMenu`), azioni rapide `+` (`QuickActionsFab`) e menu mobile `Altro` tramite stack LIFO sincronizzato con `window.history` (`overlayHistory` e `useOverlayBackHandler`).
- Animazioni di chiusura simmetriche sui bottom sheet e dialoghi (`ds-anim-sheet-out`, `ds-anim-dialog-out`, `ds-anim-backdrop-out`), pull-to-refresh in-app per PWA standalone (`PullToRefreshBanner`), scroll-to-top al cambio/re-tap scheda, micro-aptica Android, badge numerico sull’icona PWA (`navigator.setAppBadge`), Screen Wake Lock durante scansioni OCR/Gmail (`useWakeLock`) e feedback tattile sull’esportazione CSV.
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
