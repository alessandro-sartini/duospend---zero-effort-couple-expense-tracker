# DuoSpend — Complete User Guide & Feature Manual

Welcome to **DuoSpend**, your automated couple expense tracker designed specifically for you and your fiancée. This guide explains every feature, ingestion method, calculation, and capability available in the application.

---

## 0. Security, Sessions & Privacy

- **Server-Verified Google OAuth 2.0 Code Model (`HttpOnly` Cookie)**: The backend verifies Google identity and issues an `HttpOnly; SameSite=Strict` session cookie exclusively to the configured couple emails (`userEmail` / `partnerEmail`). When `GOOGLE_CLIENT_SECRET` is configured, Google `access_token` and `refresh_token` never leave server memory (automatic fallback to the Token Model when omitted). Firebase is not used.
- **Idle & Absolute Session Timeouts (30 min / 4 hr cap)**: Sessions renew on active use and automatically expire after **30 minutes of inactivity** (`DUOSPEND_SESSION_IDLE_MINUTES`) or at the **4-hour maximum cap** (`DUOSPEND_SESSION_MAX_HOURS`), auto-locking the UI back to the login screen. Use **Lock / Logout** at any time to terminate and revoke the session immediately.
- **Developer Console & Protected DB Reset (`DUOSPEND_DEV_PASSWORD`)**: Optional in `.env`. Disabled in production (`404`) unless configured; when set, requires both an active authorized couple Google session **and** the `.env` developer password. Resetting the database opens a **"Sei sicuro di voler procedere?"** confirmation modal with quick JSON backup export, `Empty (0 expenses)` vs `Restore Demo` selection (always preserving couple emails), and typed `RESET` verification enforced client-side and server-side.
- **Webhook Secret**: External Android ingestion requires either an authenticated couple session or the server-side `x-duospend-secret` header (`DUOSPEND_WEBHOOK_SECRET`).
- **Installable PWA**: DuoSpend can be installed from Chrome, but this is a web app rather than a native APK. Camera, notifications and offline capabilities therefore depend on browser/platform support. Private API responses are never cached.

---

## 1. Quick Start: The 4 Effortless Ways to Track Expenses

DuoSpend is built around the principle of **near-zero effort**. You never have to spend hours typing in receipts. All 4 capture tools are reachable from the **floating `+` Quick Actions button** at the bottom-right corner (as well as contextual shortcuts):

### Background Tasks & Swipe-Right Notification Pills
- Both **Gmail Sync** and **Camera Receipt OCR** can run in the background (persisting across page reloads).
- A floating status pill appears in the top-right corner while processing or when ready. Tap it to reopen, or dismiss it via the `X` button or by **swiping/flinging right**.
- Dismissing the popup **preserves your saved search results / OCR draft**: an indicator dot remains on the `+` button and status badges (**In corso**, **N salvate**, **Bozza**) appear inside the `+` menu so you can resume anytime.

### Method 1: Android Payment Notifications & History (Fastest on Mobile)
- **What it is**: Your smartphone receives push notifications whenever you pay with your bank card, phone, or contactless (Revolut, Google Pay, Intesa Sanpaolo, UniCredit, PayPal, N26, SMS).
- **How to use it**:
  1. Tap the floating **`+`** button and select **Incolla Notifica / SMS** (or use the shortcut on the dashboard).
  2. Paste your notification text (e.g., `Revolut: Paid €12.50 at Bar Centrale`).
  3. Or copy multiple lines from your Android phone's **Notification History** (*Impostazioni → Notifiche → Cronologia Notifiche*).
  4. Select who paid (**Partner 1** or **Partner 2**).
  5. Tap **Extract Expenses with Gemini**. In less than a second, Gemini extracts the merchant, amount, category, and date.
  6. Tap **Import to Couple Ledger**.
- **Automated Hands-Free Mode (Webhook)**:
  - In the **Android Automation Setup** tab inside the Alerts window, you will find your unique Webhook URL.
  - Using a free automation app on Android (like MacroDroid or Tasker), your phone can automatically send bank notifications to DuoSpend the exact moment you pay at a store—with zero manual taps!

### Method 2: Instant Camera Receipt Scan (Physical Paper Receipts)
- **What it is**: For paper slips at supermarkets, restaurants, bars, and shops.
- **How to use it**:
  1. Tap **`+` → Scansiona Scontrino OCR** (or the camera button inside **Spese**).
  2. On your Android phone, tap **Use Camera (Android)** to snap a live photo of the receipt, or choose an existing photo.
  3. Gemini Vision OCR scans the receipt (and you can tap **Continua in background** to keep browsing while the draft persists), extracting:
     - Merchant/store name
     - Date
     - Total amount & currency
     - Category (Groceries, Dining Out, etc.)
     - Itemized line items (e.g., pasta, wine, vegetables)
     - Sales tax / VAT
  4. Verify who paid and the split (50/50 or personal), then tap **Add to Couple Ledger**.
  5. The photo receipt is kept attached to the transaction for your records.

### Method 3: Direct Gmail Receipt Sync (Digital Purchases & Bills)
- **What it is**: For digital receipts that arrive in your email (Amazon orders, Uber rides, Deliveroo, utility bills, airline tickets, Airbnb).
- **How to use it**:
  1. Tap **`+` → Sincronizza Gmail**.
  2. Click **Sign in with Google** (uses official Google `gmail.readonly` permissions; when `GOOGLE_CLIENT_SECRET` is configured, tokens stay exclusively on the server via `HttpOnly` cookie and auto-refresh).
  3. Choose 7 days, 30 days (one month, default), or 90 days and tap **Scan Inboxes**. DuoSpend searches purchase-related keywords while automatically excluding Spam, Trash, Promotions, Social, and Forums (`-category:promotions -category:social -category:forums`), and follows every results page in 30-message batches (continuing in background across tabs/reloads).
  4. Only candidate email text is sent to Gemini, not attachments. Already-imported or ignored messages are skipped, and a 30-day server SQLite cache avoids redundant AI calls while retaining unimported results.
  5. Unverified `0 €` expenses surface a persistent top banner (`ZeroAmountBanner`) so you can jump directly to edit a single item or filter all zero-amount items in one tap.
  6. Check the items you want to import and click **Import to Shared Ledger**.

### Method 4: Manual Expense Entry
- **What it is**: For quick cash payments or custom adjustments.
- **How to use it**:
  1. Tap **`+` → Nuova Spesa Veloce**.
  2. Enter the amount, merchant, date, and category.
  3. Choose who paid (**Partner 1** or **Partner 2**).
  4. Choose the split rule:
     - **Shared 50 / 50**: Standard equal split.
     - **100% Personal**: Only for the person who bought it (does not split debt).
     - **Custom %**: Adjust the slider (e.g., 60% / 40% or 70% / 30%).
  5. Tap **Save Expense**.

---

## 2. The 50/50 Settlement Engine: "Who Owes Whom"

The biggest challenge in couple budgeting is knowing who paid more and how to settle up without awkward calculations.

### How the Calculation Works
- Every shared expense is divided 50/50.
- If **Partner 1** pays an €80 dinner:
  - Partner 1 paid €80.
  - Partner 2's fair share is €40.
  - Partner 2 owes Partner 1 €40.
- If **Partner 2** pays a €50 grocery bill:
  - Partner 2's credit is €25.
  - The net balance adjusts automatically (€40 - €25 = **Partner 2 owes Partner 1 €15**).
- Personal expenses (marked 100% personal) are excluded from the shared pool unless one partner paid for the other's personal item.

### The Dashboard Settlement Banner
At the very top of your Dashboard, you will always see the exact live status:
- 🟢 **All Settled Up!**: Contributions are balanced.
- 🟢 **Partner 2 owes you €X.XX**: You have contributed more to the shared pool.
- 🟠 **You owe Partner 2 €X.XX**: Partner 2 has covered more shared expenses.

### How to Settle Up
1. When you or your fiancée make a reimbursement (via Revolut, bank transfer, PayPal, or cash), tap **Settle Up Balance**.
2. DuoSpend pre-fills the exact net balance amount.
3. Select the payment method (Revolut, Bank Transfer, Cash) and tap **Record Settlement**.
4. The balance returns to €0.00, and the transfer is permanently logged in your **Settlement Transfer History**.

---

## 3. Screen-by-Screen Guide

### A. Dashboard Tab
- **Focal Settlement Banner**: Instant view of your net balance and "Settle Up" action.
- **Contribution Split Strip**:
  - Partner 1 Paid Total
  - Partner 2 Paid Total
  - Total Shared Pool Spend (and each partner's fair 50% share)
- **Monthly Spending Progress**: Visual progress meter comparing this month's spending against your **€2,800.00** monthly budget goal.
- **Top Categories**: Quick horizontal bars displaying the highest spending categories for the current month.
- **Zero-Effort Capture Strip**: 1-click access to Camera Scan, Gmail Sync, Android Push Alerts, and the AI Advisor.
- **Recent Transactions Feed**: The latest couple expenses with merchant icons and source tags.

### B. Expenses Tab
- **Full Shared Ledger**: Searchable, filterable list of all expenses.
- **Filters**:
  - Filter by Category (Groceries, Dining, Housing, Utilities, etc.).
  - Filter by Payer (All, Paid by Partner 1, Paid by Partner 2).
  - Search bar: Type merchant names or notes.
- **Actions**:
  - **Expand (chevron)**: View itemized receipt lines, VAT/tax, and the attached photo receipt.
  - **Edit (pencil)**: Modify amounts, dates, or split rules.
  - **Delete (trash)**: Remove an expense.

### C. Categories & Trends Tab
- **Timeframe Selector**: Toggle between **This Month**, **Past 3 Months**, **Year-to-Date (2026)**, and **All-Time**.
- **Summary Metrics**: Total incurred spend, top category, and average spend per transaction.
- **Proportional Spectrum Bar**: A color-coded distribution bar showing what percentage of your budget went to each category.
- **Category Deep Dive Table**:
  - Shows total amount and transaction count per category.
  - Shows exactly who paid what (**Partner 1 paid €X** vs **Partner 2 paid €Y**).
  - **Monthly Benchmarks & Alerts**: Displays whether a category is within budget or has exceeded its limit (with a red "Over Target" badge).

### D. Couple Settlement Tab
- **Deep-Dive Settlement Breakdown**: Full mathematical transparency showing:
  - Total shared expenses
  - Fair 50% target for each partner
  - Exactly how much each partner has paid above or below their fair share.
- **Transfer History**: A chronological ledger of all past balance settlements with dates, transfer methods, and notes.

### E. AI Advisor Tab (Multi-Model Gemini Financial Coach)
DuoSpend features a multi-turn conversational financial assistant that automatically reads your current couple spending data.

#### The 4 Specialized Models:
1. **Flash (General Advisor — Free Tier)**:
   - *Best for*: Everyday budgeting questions, quick monthly summaries, and savings tips.
2. **Carbon (Deep Spending Auditor)**:
   - *Best for*: Forensic analysis, finding hidden subscription leakage, identifying waste, and optimizing recurring bills.
3. **Argon (Scenario & Wedding Planner)**:
   - *Best for*: Complex interactive planning, simulating wedding budget trajectories, honeymoon savings, and multi-month forecasts.
4. **Flash-Lite (Rapid Query)**:
   - *Best for*: Fast, concise, bulleted answers to specific questions.

#### Quick Prompt Chips:
Click any suggested prompt for instant analysis:
- *"Audit our spending for this month"*
- *"How can we optimize our grocery and dining expenses?"*
- *"Simulate our wedding savings trajectory"*
- *"Explain our current settlement balance"*

### F. Vision Board Tab (1K, 2K, 4K Milestone Generator)
- **Couple Milestone Cards**: Active savings targets (e.g., Amalfi Coast Honeymoon Fund, Wedding Reception Venue Deposit, Apartment Buffer) with percentage funded progress bars.
- **High-Resolution Goal Visualizer**:
  - Powered by **`gemini-3-pro-image-preview`**.
  - Type any dream goal (e.g., *"Romantic sunset honeymoon in Amalfi Coast"* or *"Cozy Italian countryside wedding reception"*).
  - **Resolution Selector**: Choose **1K** (1024×1024), **2K** (2048×2048), or **4K** (4096×4096).
  - Tap **Generate High-Res Goal Image** and attach the resulting picture to any of your couple saving goals!

---

## 4. Best Practices for Android Users

1. **Install as a Web App (PWA)**:
   - Open DuoSpend in Chrome on your Android phone.
   - Tap the three dots (⋮) in the top-right corner of Chrome.
   - Tap **Add to Home screen** (or *Installa app*).
   - DuoSpend will now open like a native Android app without browser bars!
2. **Use the Camera Shortcut**:
   - Keep paper receipts when you dine out or shop. Tap **Scan** on the home screen to snap a quick photo before throwing the receipt away.
3. **Weekly 30-Second Check-In**:
   - Once a week, open DuoSpend and tap **Sync Gmail** to import any online Amazon or utility orders.
   - Glance at the **Settlement Banner** to see if anyone needs to settle up.
