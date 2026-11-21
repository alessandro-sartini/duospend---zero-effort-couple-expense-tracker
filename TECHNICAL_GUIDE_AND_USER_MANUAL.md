# DuoSpend — Technical Specification, PWA Audit & Operations Manual

---

## 1. Executive Summary

**DuoSpend** is a full-stack React 19 + Vite 8 + Express 4.21 + Node.js 22 SQLite personal-finance Progressive Web App (PWA) designed specifically for couples. It installs and runs as a **Chrome PWA** on Android and desktop browsers—not as a native APK—and provides four low-friction ingestion channels:

1. **Android Notification Paste, Web Share Target & Webhook Ingestion** (`POST /api/notifications/ingest`, `/api/notifications/parse-history`, and `manifest.webmanifest` `share_target`).
2. **Direct Gmail Receipt Synchronization** (Google OAuth 2.0 `gmail.readonly`, 30-message batch pagination, 30-day per-account SQLite scan cache).
3. **Instant Camera / Gallery Receipt OCR** (client-side JPEG compression/EXIF stripping + server binary validation + Gemini Vision OCR).
4. **Manual Entry, Custom Split Rules & Real-Time 50/50 Settlement** (including `trackingStartDate` / Starting Point, custom & hidden categories, CSV export).
5. **Multi-Channel Reconciliation Engine (`±14d`), Zero-Amount Quarantine, Trip Mode & Recurring Tracker** (`src/services/reconciliation.ts`, SQLite `trips` & `recurring_expenses` tables, delayed Gmail/bank merge, `zero_quarantine` 1-tap resolution).
6. **Couple Savings Challenges (Virtual Savings Engine)** (`server/services/savings-challenge-engine.ts`, `server/services/savings-challenges.service.ts`, integrated into Vision Board with server-authoritative calculation, optimistic version concurrency, idempotency keys, and atomic SQLite transactions).

---

## 2. Core Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   CLIENT LAYER (Installable Chrome PWA)                    │
│                                                                            │
│  - React 19 SPA + Vite 8 + Tailwind CSS v4 (dark-mode default, CSS tokens) │
│  - Service Worker (public/sw.js, shell cache 'duospend-shell-v8')          │
│  - Installable Manifest (display: standalone, shortcuts, share_target GET) │
│  - Accessibility: preserved browser zoom, safe-area insets, useFocusTrap,  │
│    Escape modal dismissal, prefers-reduced-motion support                  │
│  - Offline write queue (serialized syncPatchToServer + duospend_dirty_sync)│
│  - GIS OAuth popup (initCodeClient code model / Token fallback)            │
└──────────────────────────────────┬─────────────────────────────────────────┘
                                   │ HTTPS / Same-Origin API (HttpOnly Cookie)
                                   ▼
┌────────────────────────────────────────────────────────────────────────────┐
│             SERVER LAYER (Node.js 22+ / Docker + Express 4.21)             │
│                                                                            │
│  - Helmet CSP (scriptSrcAttr: 'none', HSTS in prod), CORS/Origin/Referer & │
│    Sec-Fetch-Site CSRF guards, path-traversal blocker, JSON error handler  │
│  - Bounded per-route express-rate-limit windows                            │
│  - Built-in node:sqlite (WAL mode, DB_PATH=/app/data/duospend.sqlite)      │
│  - Worker thread parsing with 8,000ms watchdog timeout + in-process fallback│
│                                                                            │
│  API Endpoints:                                                            │
│  • GET  /api/health                        (Container healthcheck)         │
│  • GET  /api/auth/config                   (OAuth mode, clientId, dev flag)│
│  • POST /api/auth/google-code              (BFF OAuth code exchange)       │
│  • POST /api/auth/google-session           (Token fallback when no secret) │
│  • GET  /api/auth/session · POST /api/auth/logout                          │
│  • GET  / POST /api/data                   (Couple SQLite ledger sync)     │
│  • GET  / POST /api/savings-challenges     (List, estimate, create)        │
│  • PATCH / DELETE /api/savings-challenges/:id · pause/resume/complete/recalc│
│  • POST /api/savings-challenges/:id/confirm-contribution · revert · history│
│  • POST /api/notifications/ingest          (MacroDroid/Tasker webhook)     │
│  • POST /api/notifications/parse-history   (Batch alert extraction)        │
│  • POST /api/gemini/parse-receipt          (Image validation + Vision OCR) │
│  • POST /api/gmail/sync                    (Gmail readonly scan & rules)   │
│  • POST /api/gemini/chat                   (Multi-model AI Advisor)        │
│  • POST /api/gemini/generate-vision-image  (1K/2K/4K Vision Board art)     │
│  • POST /api/auth/dev-login · GET /api/dev/status · POST /api/dev/reset-database │
└──────────────────────────────────┬─────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL APIS & AI MODELS                           │
│                                                                            │
│  1. Google GenAI SDK (@google/genai)                                       │
│     - Text & OCR fallback chain: gemini-3.8-flash → gemini-3.5-flash-lite  │
│       → gemini-3.7-flash → gemini-3.1-flash-lite                           │
│     - Advisor selectable: gemini-3.8-flash, gemini-4-carbon,               │
│       gemini-4-argon, gemini-4-hydrogen, gemini-3.1-flash-lite             │
│     - Vision images: gemini-3.1-flash-image-preview →                      │
│       gemini-2.5-flash-image → gemini-3-pro-image-preview → imagen-4.0-*   │
│                                                                            │
│  2. Google Workspace Gmail API (gmail.googleapis.com)                      │
│     - Scope: https://www.googleapis.com/auth/gmail.readonly                │
│     - Confidence thresholds: >= 75% auto, 55–74% review, < 55% suppressed  │
└────────────────────────────────────────────────────────────────────────────┘
```

### Runtime & Dependencies Summary
- **Server / Persistence**: `express` (`^4.21.2`), Node.js 22 built-in `node:sqlite` (`PRAGMA journal_mode = WAL;`), `helmet` (`^8.3.0`), `express-rate-limit` (`^8.7.4`), `dotenv` (`^17.2.3`), `@google/genai` (`^3.2.0`), `tsx` (`^4.21.0`).
- **Frontend**: `react` / `react-dom` (`^19.0.1`), `vite` (`^8.3.8`), `tailwindcss` / `@tailwindcss/vite` (`^4.3.5`), `lucide-react` (`^0.546.0`), `motion` (`^12.23.24`), `typescript` (`^7.0.2`).

---

## 3. Chrome PWA Evaluation vs. Native APK

### Chrome PWA Capabilities
- **Installability & Manifest (`public/manifest.webmanifest`)**: `display: "standalone"` with `"minimal-ui"` fallback, `192x192` / `512x512` / maskable icons, 4 launcher shortcuts (`/?action=add-expense`, `/?action=paste-notification`, `/?action=scan-receipt`, `/saldo`), and Android Chrome `share_target` (`GET /?title=&text=&url=`).
- **Service Worker & Cache Headers (`public/sw.js` & `server/app.ts`)**:
  - `CACHE_NAME = 'duospend-shell-v8'`.
  - `/sw.js`, `/index.html`, and `/manifest.webmanifest` are served with `Cache-Control: no-cache, no-store, must-revalidate` so browser update checks always observe new deployments promptly.
  - `/assets/*` are served with `Cache-Control: public, max-age=31536000, immutable`.
  - Navigation (`request.mode === 'navigate'`) uses network-first and refreshes `/index.html` cleanly in cache only for clean non-query navigation requests; `/api/*` responses (including `/api/savings-challenges*`) are bypassed and never stored in Cache Storage.
- **Mobile Viewport, Safe Areas & Accessibility**:
  - `viewport` meta preserves user zoom (no `user-scalable=no`).
  - Layout, floating quick actions, bottom sheets, and alert dialogs include `env(safe-area-inset-*)` spacing and `100dvh` sizing.
  - `useFocusTrap` traps `Tab`/`Shift+Tab` inside open modals and dialogs and restores triggering focus on close; all dialogs close on `Escape`.
  - `@media (prefers-reduced-motion: reduce)` and `scrollIntoView` guards respect OS motion preferences.
- **Offline Queue & Conflict Precedence (`src/services/storage.ts`)**:
  - Mutations write locally first, set `duospend_dirty_sync_v1`, and enqueue `POST /api/data` calls through `syncPatchToServer` (`syncQueuePromise` with `pendingSyncCount` and `batchHadFailure`, clearing the dirty flag only when all queued writes succeed).
  - On reconnect, `syncWithServerDatabase()` merges server data with local changes: pending local edits take precedence per expense/settlement/goal/profile field (keeping authoritative `userEmail`/`partnerEmail` and preserving server `receiptUrl` attachments if omitted locally after `QuotaExceededError`), then posts the merged state back through `syncPatchToServer`.

### Capabilities Requiring a Native APK (PWA Limitations)
| Feature | Chrome PWA Status | Why Native APK Is Required / Recommended Workaround |
| :--- | :--- | :--- |
| Background banking push / SMS interception | Unsupported in web browsers | Requires Android `NotificationListenerService` or `RECEIVE_SMS`. **Workaround**: MacroDroid / Tasker forwarding alerts to `POST /api/notifications/ingest` with `x-duospend-secret`. |
| Silent background sync when app is completely closed | Unsupported (PWA background tasks survive page reloads while active/cached; no persistent OS daemon) | Requires Android `WorkManager` / foreground service in a native APK. |
| Direct camera stream without chooser or persistent camera grant | On-demand OS camera/gallery chooser (`<input capture="environment">`) | Avoids premature browser permission prompts; works reliably on Android & iOS without a native APK, though custom burst scanning needs native Camera2. |
| Cross-browser Web Share Target | Android Chrome PWA supported | Safari iOS lacks `share_target`; iOS users paste copied alerts directly. |

---

## 4. Security Controls Implemented & Verified

1. **Authentication, BFF OAuth & Session Bounds (`server/services/google-auth.ts`, `server/middleware/auth.ts`, `src/services/auth.ts`)**:
   - `HttpOnly; SameSite=Strict` cookies scoped to `/api`, setting `Secure` on HTTPS (`isSecureCookieRequest` checking `req.secure` or `x-forwarded-proto`).
   - Session rotation on re-authentication (revoking prior session tokens), expired pruning, and bounded in-memory session stores (`MAX_GOOGLE_SESSIONS = 200`, `MAX_DEV_SESSIONS = 50` with oldest-entry eviction).
   - Idle timeout (`DUOSPEND_SESSION_IDLE_MINUTES`, default `30`) and absolute lifetime (`DUOSPEND_SESSION_MAX_HOURS`, default `4`); passive `/api/auth/session` checks do not extend idle timer.
   - Logout revokes server session and clears `duospend_ocr_draft_v1` and `duospend_dismissed_bg_notifications_v1` from `sessionStorage`.
   - Owner enforcement in `server/controllers/data.controller.ts` requires non-empty `ownerEmail && requesterEmail && requesterEmail === ownerEmail` before accepting `partnerEmail` edits (`403` otherwise).
2. **CSRF, Headers, Error Handling & Path Traversal (`server/app.ts`, `server/utils/sanitizers.ts`)**:
   - Helmet CSP with `scriptSrcAttr: ["'none'"]` and restricted `fontSrc` (`'self'`, `https://fonts.gstatic.com`, `data:`), plus HSTS in production and `Cache-Control: no-store` on `/api/*`.
   - State-changing `/api` mutations require `X-Requested-With: XMLHttpRequest`, validate `Origin` or `Referer` origin against allowed host/port, and reject `Sec-Fetch-Site: cross-site` (unless authenticated via `x-duospend-secret` on allowed webhook route).
   - Path inspection rejects encoded traversal, dotfiles (`.env`), SQLite files (`.sqlite*`), and backend routes; SSRF checks (`validateUbuntuSyncTarget`) block loopback/private targets except configured routes.
   - Global Express JSON error handler catches `entity.too.large` (`413`), malformed JSON (`400`), and unexpected errors (`500`) without exposing stack traces.
3. **Rate Limiting (`server/app.ts`, 15-minute windows)**:
   - Global `/api`: `300` | `/api/data`: `120` | `/api/savings-challenges`: `80` | `/api/gmail/sync`: `60` | `/api/gemini`: `40` | `/api/notifications`: `40` | `/api/dev`: `30` | `/api/auth/google-code`: `15` | `/api/auth/google-session`: `10` | `/api/auth/dev-login`: `5`.
4. **Couple Savings Challenges SQLite Schema & Guarantees (`server/database.ts`, `server/services/savings-challenges.service.ts`)**:
   - **Additive tables**: `savings_challenges`, `savings_challenge_categories` (`FK CASCADE`), `savings_challenge_periods` (`UNIQUE(challenge_id, period_ym)`), `savings_challenge_contributions` (unique partial index on `idempotency_key`), `savings_challenge_history`, and `savings_challenge_idempotency` (24h TTL / bounded 500 entries).
   - **Data migration & compatibility**: Existing SQLite databases upgrade automatically via `CREATE TABLE IF NOT EXISTS` without touching `expenses`, `settlements`, `goals`, `profile`, `trips`, `recurring_expenses`, or `gmail_scan_cache`. `savings_challenges.goal_id` is indexed and validated transactionally rather than declared as an `ON DELETE CASCADE` foreign key to `goals(id)` because `replaceGoals` refreshes `goals` during `/api/data` sync.
   - **Authorization & Anti-Replay**: `/api/savings-challenges*` requires `requireCoupleAuth` (rejects `x-duospend-secret` webhooks with `401`, rejects unauthenticated/expired sessions with `401` and non-couple Google accounts with `403`), enforces `X-Requested-With: XMLHttpRequest` + `64 KB` body cap on mutations, validates IDs with `/^[A-Za-z0-9_-]{3,80}$/`, checks `expectedVersion` (`409` on concurrent edits), requires `confirmRetroactive: true` for retroactive changes (`409`), and executes contribution confirmations/reversions inside `BEGIN IMMEDIATE ... COMMIT` transactions with `Idempotency-Key` protection.
   - **Backup & Restore**: `DeveloperModal` JSON export includes `savingsChallenges`; `SqliteDatabaseHandle` exposes `exportSavingsChallengesBackup()`, `restoreSavingsChallengesBackup()`, and `clearSavingsChallenges()`.
   - **SQLite Schema Example (Additive)**:
     ```sql
     CREATE TABLE IF NOT EXISTS savings_challenges (
       id TEXT PRIMARY KEY, title TEXT NOT NULL, goal_id TEXT NOT NULL,
       monthly_limit REAL NOT NULL, currency TEXT NOT NULL, start_month TEXT NOT NULL,
       duration_months INTEGER NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
       status TEXT NOT NULL, split_scope TEXT NOT NULL DEFAULT 'all',
       virtual_savings_accumulated REAL NOT NULL DEFAULT 0,
       virtual_savings_applied REAL NOT NULL DEFAULT 0,
       timezone TEXT NOT NULL DEFAULT 'Europe/Rome', version INTEGER NOT NULL DEFAULT 1
     );
     -- Child tables (FK ON DELETE CASCADE): savings_challenge_categories, savings_challenge_periods,
     -- savings_challenge_contributions (with unique partial index on idempotency_key),
     -- savings_challenge_history, plus bounded savings_challenge_idempotency (24h TTL).
     ```
5. **Receipt Image & Upload Hardening (`src/components/camera/receiptOcrUtils.ts`, `server/utils/sanitizers.ts`)**:
   - **Client**: `validateReceiptFile` checks non-empty size `<= 12 MB`, exact MIME (`image/jpeg`, `image/png`, `image/webp`), rejects path traversal/control characters, double executable extensions (`.php.jpg`, `.exe.png`, etc.), and extension-MIME mismatches; `compressReceiptImage` guards `> 8192px` / `> 25 MP` sources and canvas-reencodes to JPEG (`<= 1280px`) to strip client EXIF GPS.
   - **Server**: Express JSON cap `15 MB`; base64 string cap `14,000,000` chars; `MAX_DECODED_IMAGE_BYTES = 10 MB`; real magic-byte header validation; `extractRasterDimensions` checking PNG `IHDR`, JPEG `SOF*`, WebP `VP8/VP8L/VP8X` against `8192px` max side and `25,000,000` max pixels; polyglot script/PHP/HTML tag scanning; `stripJpegExifAndCommentSegments` removing JPEG `APP1` (`0xE1`) and `COM` (`0xFE`) segments before persistence/OCR.
6. **Worker Watchdog & Prototype Pollution**:
   - `server/utils/background-worker.ts` enforces `WORKER_TIMEOUT_MS = 8_000`, terminating hung workers and falling back safely in-process.
   - `stripDangerousKeys` strips `__proto__`, `constructor`, and `prototype` recursively from untrusted payloads.

---

## 5. Configuration, Deployment & Rollback

### Environment Variables (`.env.example`)
| Variable | Purpose | Notes |
| :--- | :--- | :--- |
| `PORT` / `NODE_ENV` | HTTP port (`3000`) & runtime mode (`production`) | `NODE_ENV=production` enables HSTS, `Secure` cookies, hides dev-login gate |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth 2.0 Web Client ID | Baked at build (`vite build`) & served via `/api/auth/config` |
| `GOOGLE_CLIENT_SECRET` | Enables server-side OAuth Code Model (`HttpOnly` cookie + auto-refresh) | Strongly recommended in production; omitting triggers Token Model fallback |
| `GEMINI_API_KEY` | Google AI Studio key for OCR, Gmail analysis, Advisor, Vision Board | Kept strictly server-side |
| `DUOSPEND_WEBHOOK_SECRET` | Header secret (`x-duospend-secret`) for MacroDroid / Tasker webhook | Keep high-entropy and store out of repo |
| `DB_PATH` | SQLite file path (`/app/data/duospend.sqlite` in Docker) | Mounted to persistent host volume `./data` |
| `DUOSPEND_DEV_PASSWORD` | Optional dual-auth Dev Tools password in production (`12+` chars) | Unset/empty disables `/api/dev/*` with `404` in production |
| `DUOSPEND_SESSION_IDLE_MINUTES` / `DUOSPEND_SESSION_MAX_HOURS` | Session idle (`5–240`, default `30`) & absolute (`1–12`, default `4`) caps | Tunable per deployment |
| `DUOSPEND_UBUNTU_SERVER_URL` / `DUOSPEND_UBUNTU_TOKEN` | Optional secondary Ubuntu sync target | SSRF-validated before outbound sync |

### Deployment & Rollback Commands
- **Deploy**:
  ```bash
  cp .env.example .env && chmod 600 .env
  ./deploy.sh
  ```
  (`deploy.sh` sets `1000:1000` ownership on `${HOME}/duospend/data`, enforces `chmod 600 .env`, runs `docker compose up -d --build`, and probes `http://127.0.0.1:3000/api/health`.)
- **Rollback**:
  1. **Code/Container Rollback**:
     ```bash
     cp ./data/duospend.sqlite "./data/duospend.sqlite.bak-$(date +%F-%H%M%S)"
     git checkout <previous-known-good-commit>
     docker compose up -d --build
     ```
  2. **Database Restore Rollback**:
     ```bash
     docker compose down
     cp ./data/duospend.sqlite.bak-<timestamp> ./data/duospend.sqlite
     rm -f ./data/duospend.sqlite-wal ./data/duospend.sqlite-shm
     chown 1000:1000 ./data/duospend.sqlite
     docker compose up -d
     ```

---

## 6. Residual Risks & Automated Test Coverage

### Residual Risks & Operational Notes
- **In-memory session persistence**: Google and Dev sessions live in Node.js process RAM (`200` / `50` entries). Container restarts require re-authentication, and horizontal multi-instance scaling would require an external session store.
- **SQLite inline receipt photos**: Verified receipts remain base64 data URIs inside SQLite payloads; large histories can still encounter browser `localStorage` quota stripping (mitigated gracefully via `QuotaExceededError` fallback and server `receiptUrl` preservation).
- **Offline multi-device edit collision**: Simultaneous offline edits by both partners on the *exact same transaction ID* resolve by last-reconnecting local-precedence overwrite. For savings challenges, mutations are server-authoritative (`expectedVersion` + `409 Conflict`) and blocked offline (read-only cached preview only).
- **Savings challenge currency & PWA limits**: Challenges do not apply implicit FX conversion (foreign-currency expenses are excluded and flagged); Chrome PWAs cannot trigger silent end-of-month push notifications while closed.
- **Webhook HTTPS requirement**: MacroDroid / external webhooks must travel over HTTPS (e.g., Cloudflare Tunnel / reverse proxy) so `x-duospend-secret` is encrypted in transit.
- **MacroDroid setup**: The complete Android notification and SMS setup, server secret configuration, request payload, variables and verification procedure are documented in [MACRODROID_SETUP_IT.md](./MACRODROID_SETUP_IT.md).

### Automated Verification Suites (`npm test`, `npm run lint`, `npm run build`)
- `tests/analytics-math.test.ts` (10 tests): category analytics, date filtering, budgets.
- `tests/background-notifications.test.ts` (5 tests): background pill state & dismissal preservation.
- `tests/developer-console.test.ts` (3 tests): production dual-auth dev tools & `RESET` confirmation gating.
- `tests/fallback-parsers.test.ts` (8 tests): deterministic offline SMS/notification & email regex fallbacks.
- `tests/google-auth-and-gmail.test.ts` (20 tests): couple authorization, token validation, Gmail pagination/confidence filtering/rules.
- `tests/reconciliation-and-trips.test.ts` (8 tests): elastic `±14 day` cross-channel reconciliation, `0 €` quarantine completion, active `TripProject` auto-tagging + isolated 50/50 trip balance, `RecurringExpenseItem` cycle matching, and SQLite persistence.
- `tests/savings-challenges-engine.test.ts` (8 tests): server-side virtual savings math (`max(0, limit - validSpend)`), zero/negative/extreme limits, leap years (`2028-02-29`), DST transitions, IANA timezones, currency exclusion without implicit FX, custom/orphaned categories, overlapping challenges, rounding, and setup estimates.
- `tests/savings-challenges-api.test.ts` (7 tests): CRUD lifecycle, retroactive confirmation (`409`), deleted-expense recalculation, atomic contributions/reversions, idempotency replay/double-click protection, optimistic version conflict (`409`), simulated SQLite trigger crash rollback, legacy DB additive migration, backup/restore, DB reset, CSRF/payload-limit/XSS/IDOR/auth/webhook-rejection guards.
- `tests/savings-challenges-ui.test.ts` (5 tests): Vision Board integration, collapsed-by-default color-coded accordions with 5-row pagination and inline 2-column desktop + mobile-first expansion, ARIA/dialog/live-region accessibility, long names & extreme amounts, loading/empty/error/offline states, reconnect sync & `401` lock handling, SW `/api/*` bypass & `prefers-reduced-motion`.
- `tests/server-security-and-data.test.ts` (17 tests): XSS/prototype-pollution stripping, path traversal, SSRF, `x-duospend-secret` route scoping, magic bytes, PNG decompression bomb rejection, polyglot rejection, JPEG EXIF `APP1`/`COM` stripping, and filename/MIME validation.
- `tests/settlement.test.ts` (5 tests): 50/50, personal, custom split, and settlement balance math.
- `tests/sqlite-database.test.ts` (10 tests): SQLite WAL persistence, schema migrations, ID deduplication, Gmail 30-day cache.
- `tests/storage-and-gemini-resilience.test.ts` (4 tests): `QuotaExceededError` handling, Gemini transient cooldown/fallback, and offline dirty-sync local-precedence merge preserving `receiptUrl`.
- `tests/vision-image-fallback.test.ts` (6 tests): `responseModalities: ['IMAGE', 'TEXT']`, `400` retry without `imageSize`, Gemini Image to `imagen-*` automatic fallback, transparent `quota_or_billing` / `missing_api_key` fallback diagnostics, and collapsible Vision Board cover UI (`Genera con AI` + `Carica foto`).
