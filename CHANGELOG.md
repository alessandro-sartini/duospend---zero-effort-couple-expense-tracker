# Changelog

Tutte le modifiche rilevanti a **DuoSpend** sono documentate in questo file secondo il formato [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e il [Semantic Versioning](https://semver.org/lang/it/).

## [1.0.0] - 2026-11-22

### Added
- Versionamento SemVer unificato (`package.json`, `server/version.ts`, `src/services/version.ts`, `GET /api/health`, badge UI in Impostazioni Sicurezza, build args Docker `APP_BUILD_SHA` / `APP_BUILD_TIME` e script `npm run release`).
- Sistema completo di gestione spese di coppia 50/50 con SQLite WAL, autenticazione Google OAuth lato server e PWA installabile.
- Webhook Android/MacroDroid (`POST /api/notifications/ingest`) con filtro deterministico + schema AI `isExpense` (scarta OTP, promo/sconti, accrediti), deduplicazione in-flight + cache TTL 5 minuti, `sourceReference` persistente e riconciliazione multi-app.
- Scanner scontrini OCR con validazione immagini (magic bytes, dimensioni, anti-poliglotta, strip EXIF), sincronizzazione Gmail e sfide di risparmio virtuali (`Savings Challenges`).
