<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# DuoSpend — Zero-Effort Couple Expense Tracker

DuoSpend is an installable Chrome PWA and personal-finance tracker for couples, built with React 19, Vite 8, Express 4.21, Gemini AI, Google OAuth 2.0, and Node.js 22 built-in SQLite (`node:sqlite`).

The interface opens in dark mode by default. Use the sun/moon control in the navigation bar to switch themes; your preference is saved on the current device. Shared theme tokens and component styles live under `src/styles/`.

**Documentation:**
- [English User Guide](USER_GUIDE.md)
- [Guida Utente in Italiano](USER_GUIDE_IT.md)
- [Technical Specification, Security Audit & Operations Manual](TECHNICAL_GUIDE_AND_USER_MANUAL.md)
- [Project & Verification Rules](GEMINI.md)

---

## Run Locally

**Prerequisites:** **Node.js 22+** (required for built-in `node:sqlite`) or **Docker**.

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.development.example` (or `.env.example`) to `.env.development.local`, set `VITE_GOOGLE_CLIENT_ID`, optional `GOOGLE_CLIENT_SECRET`, a random `DUOSPEND_DEV_PASSWORD`, and your `GEMINI_API_KEY`. Keep `.env*` and `*.sqlite*` files out of version control.
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Verification commands:
   - `npm run lint` (`tsc --noEmit`)
   - `npm test` (`vitest run` — 10 test files, 90 tests)
   - `npm run build` (`vite build`)

---

## Deploy with Docker & Rollback (Ubuntu Server 24.04 LTS)

A multi-stage `Dockerfile` (`node:22-alpine`, non-root user `1000:1000`), `.dockerignore`, `docker-compose.yml`, and `deploy.sh` are included for isolated production deployment:

- SQLite database persists on the host at `./data/duospend.sqlite` (`DB_PATH=/app/data/duospend.sqlite`, `PRAGMA journal_mode = WAL;`).
- Container binds strictly to `127.0.0.1:3000:3000` (reached via Cloudflare Tunnel / Tailscale, never exposed directly to LAN) with healthcheck at `GET /api/health`.
- Optional tunnel helper script for Windows/SSH workflows: `scripts/secure-tunnel.ps1`.

```bash
cp .env.example .env && chmod 600 .env
# Populate VITE_GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GEMINI_API_KEY, DUOSPEND_WEBHOOK_SECRET
./deploy.sh
# or: docker compose up -d --build
```

**Rollback Procedure:**
1. Always snapshot `./data/duospend.sqlite` (and `-wal`/`-shm` if container is running, or stop container cleanly first with `docker compose down`) before upgrading.
2. To roll back code: check out the previous Git commit/tag (`git checkout <previous-commit-or-tag>`) and rebuild with `docker compose up -d --build`.
3. To restore database state: stop the container (`docker compose down`), restore the backed-up `duospend.sqlite` with `1000:1000` ownership, and restart (`docker compose up -d`).

---

## Google Sign-In, Session Security & Gmail Sync

- **GIS Code Model BFF (`HttpOnly` Cookie):** When `GOOGLE_CLIENT_SECRET` is configured on the server, Google Sign-In uses `initCodeClient` (`ux_mode: 'popup'`), posts the code to `POST /api/auth/google-code` with `X-Requested-With: XMLHttpRequest`, exchanges it (`redirect_uri: 'postmessage'`), and keeps `access_token` and `refresh_token` exclusively in server RAM. When omitted, DuoSpend falls back automatically to the legacy GIS Token Model (`POST /api/auth/google-session`). `GET /api/auth/config` provides runtime client config.
- **Session Lifetimes & Isolation:** Google sessions rotate upon login, are stored in bounded in-memory maps (`200` Google sessions, `50` dev sessions), and enforce a **30-minute sliding idle timeout** (`DUOSPEND_SESSION_IDLE_MINUTES`, `5–240`) plus a **4-hour maximum lifetime** (`DUOSPEND_SESSION_MAX_HOURS`, `1–12`). Passive status checks (`GET /api/auth/session`) do not reset inactivity. Logging out revokes the session token and clears `sessionStorage` OCR/notification drafts.
- **Gmail Sync:** Searches purchase keywords excluding spam/trash/promotions/social/forums (`-category:promotions -category:social -category:forums`) and paginates all results in 30-message batches. Only candidate text (no attachments) is sent to Gemini (`gemini-3.8-flash` with fallback to `gemini-3.5-flash-lite`, `gemini-3.7-flash`, `gemini-3.1-flash-lite`), backed by a 30-day per-account SQLite scan cache.
- **Quick Actions FAB, Reconciliation (`±14d`), Trip Mode & Recurring Expenses:** The `+` FAB launches receipt OCR scanning, manual entry, SMS/notification paste, and Gmail sync. Incoming transactions run through a multi-channel reconciliation engine (`src/services/reconciliation.ts`, `±14` day window) that merges delayed Gmail receipts with earlier bank notifications without duplicates, isolates unverified `0 €` receipts in quarantine until completed, and tracks active Trip Mode (`trips`) and Recurring Subscriptions (`recurring_expenses`). Both Gmail sync and OCR run in the background (with swipe-right notification pills). Offline writes set `duospend_dirty_sync_v1` and flush through a serialized queue; reconnect merges preserve pending local edits over stale server records while keeping server `receiptUrl` attachments if omitted from quota-constrained `localStorage`.

---

## Installable Chrome PWA, Security & Native APK Limitations

- **Installable Chrome PWA (Not a Native APK):** DuoSpend installs from Chrome (`public/manifest.webmanifest`, `display: standalone`, shortcuts, Android `share_target`) and runs in a responsive standalone layout respecting safe areas (`env(safe-area-inset-*)`), browser zoom, keyboard navigation, modal focus traps (`useFocusTrap`), `Escape` dismissal, and `prefers-reduced-motion`.
- **What Requires a Native APK:** Because DuoSpend is a Chrome PWA, it cannot run Android `NotificationListenerService`, intercept background SMS/bank push alerts while closed, or maintain silent background wakeup timers. Automated push forwarding uses an Android companion automation (e.g., MacroDroid/Tasker posting to `POST /api/notifications/ingest` with `x-duospend-secret`) or the Android Share sheet (`share_target`).
- **Service Worker (`public/sw.js`):** Static app-shell cache (`duospend-shell-v7`) separates assets from private traffic. `/sw.js`, `/index.html`, and `/manifest.webmanifest` are served with `Cache-Control: no-cache, no-store, must-revalidate` so updates activate promptly; `/api/*` responses and OAuth tokens are never cached.
- **Upload & HTTP Hardening:** Client and server validate JPEG/PNG/WebP uploads (12 MB client file limit, canvas JPEG re-encoding up to `1280px`; server 14M-char base64 / 10 MB decoded cap, magic-byte inspection, `8192px` / `25 MP` decompression-bomb checks, filename/extension validation, `<script>`/`<?php` polyglot rejection, and server JPEG `APP1` EXIF / `COM` stripping). All `/api` mutations enforce `X-Requested-With`, origin/`Referer` validation, and reject `Sec-Fetch-Site: cross-site` (except valid `x-duospend-secret` webhook ingestion). Production responses include Helmet CSP (`script-src` + `scriptSrcAttr: 'none'`), HSTS, per-route rate limits, and sanitized JSON errors without stack traces.
- **Residual Risks:** Active sessions reside in server RAM (lost on container restart, single-instance deployment); base64 receipt attachments stored in SQLite can trigger `localStorage` stripping on quota pressure; omitting `GOOGLE_CLIENT_SECRET` falls back to the Token Model; offline per-ID merge favors the latest reconnecting editor if both partners modify the exact same transaction offline.

---

## Developer Console (`DUOSPEND_DEV_PASSWORD`)

- Outside production (`NODE_ENV !== 'production'`), the login gate offers **Entra nell’app (sviluppo locale)** via `DUOSPEND_DEV_PASSWORD`.
- **In production (`NODE_ENV=production`)**, `DUOSPEND_DEV_PASSWORD` never bypasses Google Sign-In. When unset/empty, all `/api/dev/*` endpoints return `404`. When configured (12+ chars recommended), **Strumenti dev** unlocks only *after* an authorized couple Google sign-in **and** password verification, providing diagnostics, JSON export, and a **Reset Database** dialog requiring typed `RESET` confirmation (`empty` or `demo`, preserving `userEmail` and `partnerEmail`).

---

## Backend Structure

- `server.ts` starts `server/app.ts` (Express 4.21 + Helmet + `express-rate-limit` + JSON error middleware + `GET /api/health`).
- Endpoints live in `server/routes/` (`auth`, `data`, `ai`, `gmail`, `notifications`, `dev`), controllers in `server/controllers/`, business logic in `server/services/`, sanitizers/parsers/worker watchdog (`8s` timeout) in `server/utils/`, and WAL-mode `node:sqlite` persistence + migrations in `server/database.ts`.
