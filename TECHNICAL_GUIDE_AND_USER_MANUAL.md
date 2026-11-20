# DuoSpend — Technical Specification Sheet & User Guide

---

## 1. Executive Summary

**DuoSpend** is an automated, zero-cost personal finance and shared expense tracking application specifically designed for couples (with full Android and desktop optimization). It eliminates the friction of manual bookkeeping by providing four automated ingestion channels:
1. **Android Payment Notification Listener & History Ingestion** (Revolut, Google Pay, Intesa Sanpaolo, UniCredit, PayPal, SMS alerts).
2. **Direct Gmail Receipt Synchronization** (Google Workspace OAuth `gmail.readonly` for digital purchase receipts and invoices).
3. **Instant Mobile Camera Receipt OCR** (Multimodal Gemini 3.8 Flash extracting merchant, line items, VAT, and totals).
4. **Real-time 50/50 Shared Pool Settlement** (Instant calculation of net balances: "Who owes who how much", with one-tap settle-up logs).

All features operate strictly within **100% free tiers** (free Google Workspace OAuth quota, standard Google AI Studio free tier models, and local-first reactive storage).

---

## 2. Technical Specification Sheet

### A. Core Architecture & Services
```
┌────────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER (Android & Web)                   │
│                                                                        │
│  - React 19 SPA (Single Page Application) with Vite 8                  │
│  - Tailwind CSS v4 styling & dark-variant compliance                   │
│  - Quick Actions FAB (+) & SwipeableNotificationPill (swipe-right)     │
│  - Background draft persistence + auto-lock on session inactivity      │
│  - Google Identity Services OAuth (GIS Code Model popup / Token fallback)│
│  - Mobile Android Camera Capture (capture="environment")               │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ HTTPS / REST (HttpOnly Session Cookie)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│              SERVER LAYER (Node.js 22+ / Docker + Express)             │
│                                                                        │
│  - Runtime: Node.js 22+ on Express 4.21 (Docker node:22-alpine, 1000)  │
│  - Database: Built-in node:sqlite (PRAGMA journal_mode = WAL;, DB_PATH)│
│  - Security: Helmet CSP, express-rate-limit, X-Requested-With CSRF     │
│  - Process Runner: tsx (TypeScript execution engine)                   │
│                                                                        │
│  Key Endpoints:                                                        │
│  • GET  /api/health                    (Docker & uptime healthcheck)   │
│  • GET  /api/auth/config               (OAuth mode, clientId, dev flag)│
│  • POST /api/auth/google-code          (BFF OAuth code exchange)       │
│  • GET  /api/auth/session / POST /api/auth/logout                      │
│  • GET  / POST /api/data               (Couple SQLite ledger sync)     │
│  • POST /api/notifications/ingest      (Android Push webhook OCR)      │
│  • POST /api/notifications/parse-history (Android History batch parser)│
│  • POST /api/gemini/parse-receipt      (Camera image vision OCR)       │
│  • POST /api/gmail/sync                (Gmail readonly invoice sync)   │
│  • POST /api/gemini/chat               (Multi-turn AI advisor)         │
│  • POST /api/gemini/generate-vision-image (1K, 2K, 4K Goal images)     │
│  • POST /api/auth/dev-login · GET /api/dev/status · POST /api/dev/reset-database │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      EXTERNAL APIS & INTEGRATIONS                      │
│                                                                        │
│  1. Google GenAI SDK (@google/genai ^3.2.0)                            │
│     - gemini-3.8-flash        (Receipt OCR, Notification extraction)   │
│     - gemini-4-carbon         (Deep reasoning & financial audits)      │
│     - gemini-4-argon          (Complex interactive scenario planner)   │
│     - gemini-3.1-flash-lite   (Ultra-fast queries & fallback)          │
│     - gemini-3-pro-image-preview (1K/2K/4K resolution goal generator)  │
│                                                                        │
│  2. Google Workspace Gmail API (gmail.googleapis.com)                  │
│     - Scope: https://www.googleapis.com/auth/gmail.readonly            │
│     - Server-side OAuth access & auto-refresh when secret is set       │
│                                                                        │
│  3. Google Identity Services                                            │
│     - GIS Code Model (`redirect_uri: 'postmessage'`) with BFF cookie   │
│     - 30m sliding idle timeout / 4h absolute session cap               │
└────────────────────────────────────────────────────────────────────────┘
```

### B. Packages & Dependencies Manifest

| Category | Package / Library | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Runtime Server** | `express` | `^4.21.2` | Full-stack REST API server and SPA static host |
| **Persistence** | `node:sqlite` | Node.js 22 built-in | Transactional SQLite database (WAL mode, zero native addons) |
| **Security Middleware** | `helmet`, `express-rate-limit` | `^8.3.0` / `^8.7.4` | Strict CSP headers and per-endpoint rate limiting |
| **Runtime Config** | `dotenv` | `^17.2.3` | Ingestion of `.env` / `.env*.local` environment variables |
| **AI SDK** | `@google/genai` | `^3.2.0` | Official Google GenAI SDK for server-side Gemini models |
| **Frontend Framework** | `react` | `^19.0.1` | Declarative UI component library |
| **Frontend Framework** | `react-dom` | `^19.0.1` | DOM renderer for React |
| **Build Tool** | `vite` | `^8.3.8` | Next-generation frontend bundler & dev middleware |
| **Styling** | `tailwindcss` | `^4.3.5` | Utility-first CSS framework (v4 engine) |
| **Styling Plugin** | `@tailwindcss/vite` | `^4.3.5` | Vite integration plugin for Tailwind CSS v4 |
| **Icons** | `lucide-react` | `^0.546.0` | Clean, modern feather icon set |
| **Animations** | `motion` | `^12.23.24` | Performant layout transitions and micro-interactions |
| **TypeScript Tooling** | `tsx` | `^4.21.0` | Production & dev TypeScript runner for Express server |
| **TypeScript Tooling** | `typescript` | `^7.0.2` | Type-checking and compilation verification |

---

## 3. How Android Payment Notification Ingestion Works

### The Technology:
Android provides an internal operating system framework called **`NotificationListenerService`** as well as a user-facing system screen called **"Notification History" (Cronologia Notifiche)**.

### Method 1: Automated Real-Time Webhook (Zero Effort via MacroDroid)
1. Install **MacroDroid** (Free on Google Play Store).
2. Tap **Add Macro**:
   - **Trigger**: Select *Notification* → *Notification Received* → Select your bank apps (e.g., Revolut, Google Wallet, Intesa, UniCredit, PayPal, N26, SMS).
   - **Action**: Select *Connectivity* → *HTTP Request (POST)*:
     - URL: `https://[YOUR_APP_URL]/api/notifications/ingest`
     - Content-Type: `application/json`
     - Body:
       ```json
       {
         "notificationText": "{notification_text}",
         "appName": "{notification_app_name}",
         "payer": "user"
       }
       ```
3. Whenever a purchase notification arrives on your smartphone, MacroDroid immediately forwards the raw text to DuoSpend.
4. Gemini 3.8 Flash parses the merchant, amount, category, and date, recording it directly into the couple ledger without opening the app!

### Method 2: Android "Notification History" (Cronologia Notifiche)
If you prefer not to install automation apps:
1. On your Android phone, go to **Settings → Notifications → Notification History** (*Impostazioni → Notifiche → Cronologia notifiche*).
2. Highlight and copy recent bank notifications.
3. Open DuoSpend, tap **Alerts (Bell icon)** or **Android Payment Alerts & History**, paste the text, and tap **Extract Expenses with Gemini**.
4. Gemini will automatically extract all individual transactions, filter out spam, and import them in one tap.

---

## 4. User Manual: How to Use DuoSpend

### Step 1: Getting Started & Couple Profile
1. Open DuoSpend in your browser (or tap "Add to Home Screen" on your Android device to install it as an app).
2. The app comes pre-configured for **Partner 1 & Partner 2**, with an initial shared monthly budget target of **€2,800.00**.
3. All amounts are displayed in clean monospace tabular numerals with the Euro (`€`) currency.

### Step 2: Logging Expenses (4 Ingestion Options via Floating `+` FAB)
Choose whichever method is easiest in the moment from the **Quick Actions (`+`)** button:
- **Option A — Android Notification Sync**:
  Tap **`+` → Incolla Notifica / SMS** to paste bank notifications or setup the automated MacroDroid webhook (`x-duospend-secret`).
- **Option B — Camera Photo Scan (Instant OCR)**:
  Tap **`+` → Scansiona Scontrino OCR** on your phone, snap a photo of a restaurant bill or supermarket receipt, and optionally minimize to continue browsing in background (`Continua in background`).
- **Option C — Gmail Automatic Invoicing Sync**:
  Tap **`+` → Sincronizza Gmail**. Sign in with Google (server-side Code Model with `HttpOnly` cookie and auto-refresh when `GOOGLE_CLIENT_SECRET` is set). Choose a 7-, 30-, or 90-day window (30 days by default) and tap **Scansiona mese intero**. DuoSpend searches purchase-related keywords excluding promotions, social, and forums (`-category:promotions -category:social -category:forums`) and follows every Gmail results page in 30-message batches while persisting drafts across reloads. A per-account server SQLite cache retains message IDs and compact analysis results for 30 days.
- **Option D — Manual Entry**:
  Tap **`+` → Nuova Spesa Veloce** to type custom details, pick who paid, and set custom split percentages if needed.
- **Background Notification Pills**:
  Floating status pills appear top-right while Gmail/OCR tasks run or complete. Dismiss them with `X` or **swipe/fling right** without discarding saved results/drafts (always accessible via `+` menu badges).

### Step 3: Managing the 50/50 Settlement
1. In the **Dashboard** or **Couple Settlement** tab, view the central Settlement card.
2. The card indicates in bold numbers whether the pool is balanced or who owes whom (e.g., *"Fiancée owes you €42.50"* or *"You owe Fiancée €65.00"*).
3. Tap **Settle Up Balance** when a transfer is made via Revolut, bank transfer, or cash.
4. Record the payment to reset or adjust the balance with full audit history.

### Step 4: Tracking Monthly & Annual Category Trends
1. Navigate to the **Categories & Trends** tab.
2. Toggle between **This Month**, **Past 3 Months**, **Year-to-Date (2026)**, or **All-Time**.
3. View the proportional category distribution bar and review how much each partner spent across Groceries, Dining Out, Utilities, Housing, Travel, and Shopping.
4. Categories exceeding their monthly target limits display a visual alert.

### Step 5: Conversing with the Gemini AI Advisor
1. Navigate to the **AI Advisor** tab.
2. Choose your preferred Gemini reasoning engine:
   - **Flash (General)**: For quick day-to-day spending summaries and saving tips.
   - **Carbon (Deep Reasoning)**: For comprehensive audits of recurring leakages and budget restructuring.
   - **Argon (Complex Interactive)**: For simulating wedding costs, vacation funds, and long-term milestones.
   - **Flash-Lite**: For rapid checks.
3. The AI advisor is context-aware: it automatically receives your current couple expenses, November total, and settlement balances.

### Step 6: Visualizing Goals on the Vision Board
1. Navigate to the **Vision Board** tab.
2. Select your milestone (e.g., Amalfi Coast Honeymoon, Wedding Venue Reception, New Apartment).
3. Type a description and select your resolution: **1K**, **2K**, or **4K**.
4. Tap **Generate High-Res Goal Image** to render a cinematic visual using `gemini-3-pro-image-preview` and attach it to your savings goal.

---

## 5. Security & Privacy Guarantees
- **BFF OAuth 2.0 Code Model (`HttpOnly` Cookie)**: When `GOOGLE_CLIENT_SECRET` is configured, `POST /api/auth/google-code` exchanges authorization codes (`redirect_uri: 'postmessage'`) with CSRF header `X-Requested-With: XMLHttpRequest`, keeping `access_token` and `refresh_token` strictly in server RAM and never in browser JS/storage (graceful fallback to the legacy Token Model if the secret is omitted).
- **Sliding Idle Timeout & Absolute Cap**: Google sessions default to a **30-minute idle timeout** (`DUOSPEND_SESSION_IDLE_MINUTES`, `5–240`) and a **4-hour maximum lifetime** (`DUOSPEND_SESSION_MAX_HOURS`, `1–12`). Passive `/api/auth/session` checks do not extend idle expiry, and the UI auto-locks back to the login screen when expired.
- **Dual-Auth Production Developer Console (`DUOSPEND_DEV_PASSWORD`)**: Disabled in production (`404`) when omitted. When configured, requires both an authorized couple Google session **and** the developer password, and `POST /api/dev/reset-database` enforces explicit `RESET` confirmation (`empty` or `demo` mode, always preserving couple emails).
- **Read-Only Gmail Access & SQLite Storage**: Google Workspace Gmail integration is strictly read-only (`gmail.readonly`), and couple data persists in a single transactional SQLite database (`node:sqlite`, WAL mode) running inside an isolated non-root (`1000:1000`) Docker container bound exclusively to `127.0.0.1:3000:3000`.
- **Server Telemetry Compliance**: All backend Gemini SDK calls include the official `aistudio-build` telemetry identifier.
