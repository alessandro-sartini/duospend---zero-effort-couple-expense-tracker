<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# DuoSpend — Zero-Effort Couple Expense Tracker

DuoSpend is a full-stack personal finance and shared expense tracking web app for couples (built with React 19, Vite 8, Express, Gemini AI, Google OAuth 2.0, and native Node.js 22 SQLite).

The interface opens in dark mode by default. Use the sun/moon control in the navigation bar to switch themes; your preference is saved on the current device. Shared theme tokens and component styles live under `src/styles/`.

---

## Run Locally

**Prerequisites:** **Node.js 22+** (required for built-in `node:sqlite`) or **Docker**.

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.development.example` (or `.env.example`) to `.env.development.local`, set `VITE_GOOGLE_CLIENT_ID`, optional `GOOGLE_CLIENT_SECRET`, a random `DUOSPEND_DEV_PASSWORD`, and your `GEMINI_API_KEY`. Keep `.env*local` files out of version control.
3. Run the development server:
   ```bash
   npm run dev
   ```
4. For verification:
   - `npm run lint` (`tsc --noEmit`)
   - `npm test` (`vitest run`)
   - `npm run build` (`vite build`)

---

## Deploy with Docker (Ubuntu Server 24.04 LTS)

A multi-stage `Dockerfile` (`node:22-alpine`, non-root user `1000:1000`), `.dockerignore`, `docker-compose.yml`, and `deploy.sh` are included for isolated production deployment:

- SQLite database persists on the host at `./data/duospend.sqlite` (`DB_PATH=/app/data/duospend.sqlite`, `PRAGMA journal_mode = WAL;`).
- Container binds strictly to `127.0.0.1:3000:3000` (never exposed directly to LAN) with healthcheck at `GET /api/health`.

```bash
cp .env.example .env && chmod 600 .env
docker compose up -d --build
```

---

## Google Sign-In, Session Security & Gmail Sync

- **GIS Code Model BFF (`HttpOnly` Cookie):** Google Sign-In uses Google Identity Services directly (no Firebase). When `GOOGLE_CLIENT_SECRET` is configured on the server, the frontend uses `initCodeClient` (`ux_mode: 'popup'`), posts the authorization code to `POST /api/auth/google-code` with `X-Requested-With: XMLHttpRequest`, and the server exchanges it (`redirect_uri: 'postmessage'`) while keeping `access_token` and `refresh_token` exclusively in server RAM (auto-refreshing Gmail tokens seamlessly). When `GOOGLE_CLIENT_SECRET` is omitted, DuoSpend falls back automatically to the legacy GIS Token Model. `GET /api/auth/config` also provides `googleClientId` at runtime.
- **Session Lifetimes (Idle + Absolute Cap):** Google sessions default to a **30-minute sliding idle timeout** (`DUOSPEND_SESSION_IDLE_MINUTES`, `5–240`) and a **4-hour maximum lifetime** (`DUOSPEND_SESSION_MAX_HOURS`, `1–12`). Passive status checks (`GET /api/auth/session`) do not extend inactivity; active app usage refreshes the window, and idle tabs auto-lock to the login screen when expired.
- **Gmail Sync:** Searches purchase-related keywords excluding promotions, social, and forums (`-category:promotions -category:social -category:forums`) and follows every results page in 30-message batches. Only candidate email text (never attachments) is analyzed by Gemini (trying Gemini 3.8 Flash, Gemini 3.6 Flash, and Gemini 3.1 Flash-Lite on transient errors), with a 30-day per-account SQLite scan cache.
- **Quick Actions FAB & Swipeable Background Notifications:** The floating `+` button houses receipt OCR scanning, manual entry, SMS/notification paste, and Gmail sync. Both Gmail sync and receipt OCR continue in the background (surviving page reloads); floating notification pills can be dismissed with the `X` button or by **swiping/flinging right**, while keeping the saved scan results/drafts intact and accessible via badges in the `+` menu.

---

## Developer Console (`DUOSPEND_DEV_PASSWORD`)

- Outside production (`NODE_ENV !== 'production'`), the login screen also offers **Entra nell’app (sviluppo locale)** using `DUOSPEND_DEV_PASSWORD` from `.env.development.local`.
- **In production (`NODE_ENV=production`)**, `DUOSPEND_DEV_PASSWORD` never bypasses Google Sign-In on the login gate. If omitted or empty, all `/api/dev/*` endpoints return `404`. If set (recommended 12+ characters), the **Strumenti dev** console unlocks *only after* an authorized couple Google sign-in **and** the developer password, offering diagnostics, JSON backup export, and a **Reset Database** modal requiring explicit `RESET` confirmation (`empty` or `demo` mode, always preserving `userEmail` and `partnerEmail`).

---

## Backend Structure

- `server.ts` starts `server/app.ts` (Express 4.21 + Helmet + `express-rate-limit` + `GET /api/health`).
- Endpoints are organized under `server/routes/` (`auth`, `data`, `ai`, `gmail`, `notifications`, `dev`), controllers under `server/controllers/`, business logic under `server/services/` (`google-auth`, `google-oauth`, `auth.service`, `dev.service`, `gemini`, `gmail.service`, `ai.service`, `notification.service`), and persistence in `server/database.ts` (`node:sqlite` WAL).
