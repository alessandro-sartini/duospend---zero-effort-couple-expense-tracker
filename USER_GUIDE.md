# DuoSpend — Complete User Guide & Feature Manual

Welcome to **DuoSpend**, your automated couple expense tracker PWA built for Chrome on Android and desktop. This guide explains every feature, capture method, calculation, PWA capability, security guarantee, and limitation.

The interface opens in **dark mode** by default. Tap the sun/moon icon in the top bar to toggle light mode (saved on this device).

---

## 0. Security, Sessions, Privacy & PWA Model

- **Server-Verified Google OAuth 2.0 (`HttpOnly` Cookie)**: The backend verifies Google identity and issues an `HttpOnly; SameSite=Strict` cookie scoped to `/api` (`Secure` on HTTPS/production) exclusively to the configured couple emails (`userEmail` / `partnerEmail`). When `GOOGLE_CLIENT_SECRET` is configured, Google `access_token` and `refresh_token` never leave server memory and auto-refresh on the server (automatic fallback to Token Model only if `GOOGLE_CLIENT_SECRET` is omitted).
- **Idle & Absolute Session Timeouts (30 min / 4 hr cap)**: Sessions stay alive while you interact with the app or run scans, and automatically expire after **30 minutes of inactivity** (`DUOSPEND_SESSION_IDLE_MINUTES`) or at the **4-hour maximum cap** (`DUOSPEND_SESSION_MAX_HOURS`), auto-locking the UI back to the login screen. Tap **Lock / Blocca** anytime to revoke your server session and clear sensitive `sessionStorage` drafts immediately.
- **Couple Owner Protection**: Only the primary account owner (`userEmail`) can update `partnerEmail`. Non-owner mutations to `partnerEmail` are rejected (`403 Forbidden`).
- **Developer Console & Protected DB Reset (`DUOSPEND_DEV_PASSWORD`)**: Optional in `.env`. Disabled in production (`404`) when empty; when set, requires both an active authorized couple Google sign-in **and** the developer password. Resetting the database opens a confirmation dialog with quick JSON backup export, `Empty (0 expenses)` vs `Restore Demo` mode (always preserving couple emails), and typed `RESET` verification enforced client-side and server-side.
- **Webhook Authentication**: External Android webhooks (`POST /api/notifications/ingest`) require either an authenticated session or the server-side `x-duospend-secret` header (`DUOSPEND_WEBHOOK_SECRET`).
- **Installable Chrome PWA (Not a Native APK)**: DuoSpend installs directly from Chrome without Google Play / APK sideloading. Camera, clipboard, Share Target, and offline storage obey browser permissions. Private `/api/*` data and OAuth credentials are never cached by the Service Worker.

---

## 1. Quick Start: The 4 Effortless Ways to Track Expenses

All 4 capture tools are reachable from the **floating `+` Quick Actions button** at the bottom-right corner (as well as contextual shortcuts in Dashboard and Expenses).

### Background Tasks & Swipe-Right Notification Pills
- Both **Gmail Sync** and **Camera Receipt OCR** can continue in the background if you close the dialog (**Continua in background**), preserving results and drafts across page reloads (until logout).
- Floating notification pills appear in the top-right corner. Tap to reopen, or dismiss with `X` or by **swiping/flinging right**.
- Dismissing preserves saved scan results or OCR drafts: an indicator dot and status badges (**In corso**, **N salvate**, **Bozza**) remain in the `+` menu.

### Method 1: Android Payment Notifications, Share Target & History
- **What it is**: Card, wallet, or SMS alerts from Revolut, Google Wallet/Pay, Intesa Sanpaolo, UniCredit, PostePay, Nexi, Satispay, PayPal, N26, etc.
- **Option A — Clipboard Paste**:
  1. Tap **`+` → Incolla Notifica / SMS**.
  2. Tap **Incolla dagli Appunti** (requests clipboard read permission on tap only).
  3. Pick who paid (**Partner 1** or **Partner 2**), tap **Estrai Spesa con Gemini**, and import.
- **Option B — Android Web Share Target (`share_target`)**:
  - When DuoSpend is installed as a Chrome PWA on Android, highlight an SMS or banking text, choose Android **Share**, and pick **DuoSpend** — it opens straight into the notification parser pre-filled.
- **Option C — Android Notification History**:
  - Copy multiple lines from **Settings → Notifications → Notification History** (*Impostazioni → Notifiche → Cronologia Notifiche*) and paste them together for batch parsing.
- **Option D — Hands-Free Webhook (MacroDroid / Tasker)**:
  - Because Chrome PWAs cannot run Android's `NotificationListenerService` in the background while closed, configure an automation app like **MacroDroid** or **Tasker** on Android to forward bank notifications via HTTP `POST /api/notifications/ingest`.
  - The complete Italian setup manual is in [MACRODROID_SETUP_IT.md](./MACRODROID_SETUP_IT.md).

### Method 2: Instant Camera Receipt Scan (Physical Receipts)
1. Tap **`+` → Scansiona Scontrino OCR** (or the camera icon inside **Spese**).
2. Tap **Usa Fotocamera (Android)** (uses standard `<input type="file" capture="environment">` on tap — no upfront camera permission prompt) or pick an image from your gallery.
3. **Privacy & File Limits**:
   - Accepted formats: **JPEG, PNG, WebP** up to **12 MB** client-side.
   - Photos are compressed/re-encoded on your device (max `1280px` JPEG) to strip GPS/EXIF metadata before upload. The server also verifies real binary headers, blocks polyglot payloads and decompression bombs (`> 8192px` or `> 25 MP`), enforces `10 MB` decoded limit, and strips any remaining JPEG `APP1` EXIF / `COM` segments.
4. Tap **Continua in background** if you want to browse while Gemini scans merchant, date, totals, category, VAT, and itemized lines.
5. Verify payer and split rule (`50/50`, `Personal`, or `Custom %`), then save.

### Method 3: Direct Gmail Receipt Sync (Digital Orders & Bills)
1. Tap **`+` → Sincronizza Gmail**.
2. Sign in with Google (`gmail.readonly` read-only permission; with `GOOGLE_CLIENT_SECRET`, tokens remain exclusively in server RAM via `HttpOnly` cookie and auto-refresh).
3. Choose **7 days**, **30 days** (default), or **90 days** and start the scan. DuoSpend searches purchase keywords while excluding Spam, Trash, Promotions, Social, and Forums (`-category:promotions -category:social -category:forums`), paginating automatically in 30-message batches across every page.
4. Only candidate email text (never file attachments) is sent to Gemini. A 30-day per-account SQLite cache avoids duplicate AI analysis while keeping unimported receipts visible.
5. **AI Confidence Thresholds**:
   - **`75–100%`**: Proposed automatically as detected receipts.
   - **`55–74%`**: Placed in the manual review candidate list so nothing plausible is missed without review.
   - **`< 55%`**: Automatically filtered out as non-transactional noise.
6. Use **Imposta come spesa ricorrente** to create exact sender+subject rules for recurring invoices (applied without calling Gemini on future scans), or **Ignora email / Ignora tutte** to mute false positives.
7. Unverified `0 €` imported items highlight in a persistent **ZeroAmountBanner** at the top so you can fix them in one tap.

### Method 4: Manual Expense Entry
1. Tap **`+` → Nuova Spesa Veloce**.
2. Enter merchant/title, amount, date, and category.
3. Choose payer (**Partner 1** or **Partner 2**) and split rule (**Shared 50/50**, **100% Personal**, or **Custom %** slider).

---

## 2. The 50/50 Settlement Engine & Starting Point ("Punto Zero")

### How Shared Balance Calculation Works
- Shared `50/50` expenses credit half to the payer (`(total/2)`); custom splits use the stored percentage; `100% Personal` expenses exclude debt unless paid on behalf of the partner.
- If **Partner 1** pays an €80 dinner (+€40 credit) and **Partner 2** pays €50 groceries (+€25 credit), the net balance is **Partner 2 owes Partner 1 €15.00**.
- **Settling Up**: Tap **Pareggia Saldo / Settle Up**, review the pre-filled net balance, pick Revolut / Bank Transfer / Cash, and record the settlement to zero the active balance while keeping full history.

### Starting Point / Punto Zero (`trackingStartDate`)
- Configure a **Starting Point date** from Settings (**Impostazioni → Punto Zero**) or the Starting Point dialog if you want DuoSpend to count only expenses and settlements from that date forward in couple balance calculations. Clearing the field removes the cutoff cleanly on the server as well.

### Multi-Channel Reconciliation (±14 Days) & Zero-Amount Quarantine (`0 €`)
- Because bank push/SMS notifications arrive immediately while Gmail syncs may run days or weeks later (with invoice/shipping date offsets), DuoSpend runs a weighted reconciliation engine (`±14 days` window) matching canonical merchant names, exact/near amounts, and recurring rules:
  - **Delayed Channel Merge**: A Gmail receipt scanned 10 days after a bank notification merges into the same expense (`linkedSources` + `linkedReferences`), preserving itemized items and preventing that Gmail `messageId` from being re-imported later.
  - **Zero-Amount Quarantine (`0 €`)**: Gmail receipts detected without a price stay in `zero_quarantine` with an alert banner (`ZeroAmountBanner`). When a matching bank charge exists within ±14 days, DuoSpend either completes the real amount automatically or offers a 1-tap **Unisci ed esci dalla quarantena** action.

### Trip / Event Mode & Recurring Expenses Tracker
- **Modalità Vacanza & Progetti (`TripModeModal`)**: Create and activate a Trip or Special Project (e.g., *Weekend a Barcellona*) to auto-tag matching expenses with `tripId` and view an isolated 50/50 trip settlement and budget balance.
- **Spese Ricorrenti & Abbonamenti (`RecurringExpensesModal`)**: Track fixed or variable recurring bills (rent, utilities, streaming) with custom merchant aliases, monthly cycle tracking (`YYYY-MM`), automatic matching against incoming bank alerts/Gmail invoices, and 1-tap manual installment logging without duplicating already-matched months.

---

## 3. Screen-by-Screen Guide

- **A. Dashboard (`Panoramica`)**: Settlement Hero Banner, partner contribution totals, monthly spending progress bar, top categories, 1-tap capture shortcuts, and recent transactions.
- **B. Expenses (`Spese`)**: Searchable/filterable ledger by text, category, payer, and zero-amount items; expand any row for itemized lines/VAT/receipt image; edit/delete (with confirmation dialog); **CSV Export** for external spreadsheets.
- **C. Categories & Trends (`Categorie e Trend`)**: Switch between **Month**, **Quarter**, **Year**, and **All-Time** charts/metrics; add **Custom Categories** with monthly budgets; edit budgets in bulk; hide unused categories (`Altro` / `Other` stays protected so expenses always have a safe fallback).
- **D. Couple Settlement (`Pareggio Saldo`)**: Mathematical breakdown of shared pool totals, fair 50% shares, net balance, and chronological reimbursement history.
- **E. AI Advisor (`Consulente AI`)**: Context-aware Gemini chat with access to your ledger summary. Choose general **Flash** (`gemini-3.8-flash` with fallback to `gemini-3.5-flash-lite`, `gemini-3.7-flash`, `gemini-3.1-flash-lite`), deep audit **Carbon** (`gemini-4-carbon`), interactive scenario planner **Argon** (`gemini-4-argon`), **Hydrogen** (`gemini-4-hydrogen`), or fast **Flash-Lite** (`gemini-3.1-flash-lite`).
- **F. Vision Board (`Bacheca Obiettivi`) & Couple Savings Challenges (`Sfide di Risparmio`)**: Savings goal cards with progress bars, a collapsible **Goal Cover (`Copertina Obiettivi`)** panel supporting **1K / 2K / 4K** AI cover generation (`gemini-3.1-flash-image-preview`, `gemini-2.5-flash-image`, `gemini-3-pro-image-preview`, plus automatic fallback to `imagen-4.0-*` / `imagen-3.0-*`) alongside local gallery photo upload (`Carica foto` with EXIF stripping), and the integrated **Couple Savings Challenges** accordion list (collapsed by default with color-coded health indicators, 5-row compact pagination, and inline expansion).

### Couple Savings Challenges (Virtual Savings)
- **What Virtual Savings Means**: A savings challenge tracks a non-competitive monthly spending limit for selected categories linked to an existing Vision Board goal. Virtual savings are calculated server-side as `max(0, monthlyLimit - validSpend)`. **No real bank account is touched, no real money is moved, and there are no partner leaderboards or penalties.** Goal totals update only when an authorized couple member explicitly previews and confirms a virtual contribution (which remains reversible).
- **How to Create a Challenge**:
  1. Open **Obiettivi (Vision Board)** and tap **Nuova sfida** (or tap **Sfida** directly on a goal card).
  2. Pick the linked Vision Board goal, enter a name, select one or more categories (including custom categories), set a monthly limit (`> 0`), choose start month (`YYYY-MM`), duration (`1–12` months), scope (*all category expenses* vs *shared 50/50 & custom only*), and timezone.
  3. Review the live server estimate (previous 3-month average, suggested limit, and virtual-savings notice) and tap **Attiva sfida**.
- **Editing, Pausing & Retroactive Changes**: You can edit, pause, resume, complete, recalculate, or delete challenges at any time. Changing limits, categories, or dates on an already-started challenge requires explicit retroactive confirmation before recalculating; changing the linked goal while contributions are applied requires reverting those contributions first.
- **How to Confirm or Revert a Virtual Contribution**:
  1. Select a challenge with available virtual savings and tap **Prepara contributo virtuale**.
  2. Inspect the server-calculated preview (`Anteprima`), verify the amount and projected goal total, check the confirmation box, and tap **Conferma contributo virtuale** (double-click & replay protected).
  3. To undo anytime, open the challenge detail and tap **Rimuovi ultimo contributo** (or **Annulla** beside any applied entry in history); the virtual amount is deducted back from the Vision Board goal atomically.
- **Calculation, Currency & Offline Limits**:
  - **Currency**: No implicit FX conversion—only expenses matching the challenge currency (`EUR` by default) are counted; foreign-currency expenses are excluded and listed separately.
  - **Excluded Records**: Deleted expenses, `0 €` / `zero_quarantine` items, negative/refund amounts, future-dated expenses (relative to the challenge timezone), and partner `settlements` are excluded.
  - **Offline & PWA Behavior**: Cached challenge snapshots remain readable offline (`read-only`), while creating/editing/confirming/reverting challenges requires server connectivity so totals are always computed authoritatively in SQLite. Chrome PWAs do not run silent end-of-month background push notifications when closed.

---

## 4. Chrome PWA Installation, Offline Behavior & Native APK Limitations

### Installing DuoSpend on Chrome
- **Android Chrome**: Open DuoSpend → tap the in-app **Installa app** icon in the top bar or **Sicurezza** modal (or **`⋮`** → **Add to Home screen / Install app**). Adds app launcher icon + long-press **Shortcuts** (*Nuova Spesa*, *Notifiche*, *Fotocamera*, *Saldo*) and enables Android **Share Target** for SMS/alerts.
- **Desktop Chrome / Edge**: Click the install icon in the address bar (`⋮ → Install DuoSpend`).
- **Accessibility & Mobile UX**: Opens in standalone mode with mobile bottom-sheet dialogs, clean smartphone rows with an accessible `⋮` menu, Android-style hybrid lateral swipe actions in **Spese** and Dashboard **Ultime Spese** (short swipe to reveal action buttons, long swipe to trigger with haptic feedback, always paired with visible controls, explicit `ConfirmDialog` deletion confirmation, and an immediate **Ripristina** undo toast), mobile notches/safe areas (`env(safe-area-inset-*)`), preserved pinch-to-zoom, keyboard navigation, focus traps (`useFocusTrap`) with capture-phase `Escape` closing, and `prefers-reduced-motion`.

### Offline Behavior & Sync Recovery
- Static shell files are cached offline by the Service Worker (`duospend-shell-v9`, registered with `updateViaCache: 'none'`, network-first `/manifest.webmanifest`), while private `/api/*` data (including `/api/savings-challenges*`) is **never** cached in the Service Worker.
- Expenses, settlements, goals, and profile edits made offline save to `localStorage` and mark `duospend_dirty_sync_v1`. On reconnect, `syncWithServerDatabase()` merges changes through a serialized queue where pending local edits take precedence per record ID while restoring server `receiptUrl` photos if stripped locally due to `QuotaExceededError`.

### Browser Support & What Requires a Native APK
| Capability | Chrome PWA (Android / Desktop) | iOS Safari (Add to Home Screen) | Native APK (Why APK Needed) |
| :--- | :--- | :--- | :--- |
| Standalone Home-Screen App & Offline Shell | Full support | Partial (Safari storage limits) | Full native shell |
| Camera / Gallery Receipt Scan | On-demand tap via `<input capture="environment">` | On-demand camera/picker | Direct Camera2/background capture |
| Android Share Sheet (`share_target`) | Supported when installed in Chrome Android | Not supported by Safari | Full OS Share Intent |
| **Background OS Notification / SMS Listener** | Not possible in browser PWA | Not possible | **Requires Android `NotificationListenerService` / SMS permission** (workaround: MacroDroid webhook) |
| **Silent Background Sync When Closed** | Best-effort tab/reload drafts only | Not supported | **Requires OS foreground/WorkManager service** |
| Native Biometric App Lock | Relies on OS screen lock + BFF session cookies | Relies on OS screen lock + cookies | Hardware BiometricPrompt gate |
