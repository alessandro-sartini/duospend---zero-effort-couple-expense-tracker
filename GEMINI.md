# GEMINI.md — DuoSpend project rules

## Scope

DuoSpend is a React 19, Vite 8, Express 4 and Node.js 22 SQLite personal-finance PWA for couples. Treat it as an installable Chrome PWA, not as a native APK.

## Architecture rules

- Keep React UI components in `src/`, API controllers/routes in `server/controllers/` and `server/routes/`, and persistence in `server/database.ts`.
- Keep authentication, authorization and OAuth secrets on the server. Browser code must never receive or store Google OAuth access or refresh tokens.
- Preserve existing couple authorization and owner/partner rules.
- Use the existing sanitizers for all external text, URLs, image payloads, profile fields and database records.
- Keep the SQLite schema and migration behavior compatible. Do not delete or expose user data.
- Keep API responses, logs and PWA caches free of secrets and personal information.
- Do not cache `/api/*`, authentication responses or user-generated data in the Service Worker.

## Security requirements

- Validate route, origin and authentication before reading or writing private data.
- Reject cross-origin state-changing API requests and suspicious paths.
- Apply image MIME, binary-signature, dimension/decompression-bomb, polyglot, and EXIF-stripping validation plus size limits to all receipt uploads.
- Prefer HttpOnly, Secure in production and SameSite=Strict cookies, with bounded server-side session stores.
- Reject cross-origin `Sec-Fetch-Site: cross-site` mutations (except secret-authenticated webhooks) and return structured JSON errors without stack traces in production.
- Never add debug endpoints or developer bypasses to production.
- Use dependency limits and bounded retry/timeout behavior (including background worker timeouts) for external services.
- Preserve CSRF, CORS, XSS, SQL-injection, path-traversal and SSRF protections.
- Do not commit `.env*`, databases, logs, tokens or backup exports.

## PWA and UI requirements

- Mobile-first, accessible and responsive: do not disable browser zoom.
- Respect safe areas, keyboard input, camera capture, offline sync queue precedence, and standalone mode.
- Keep static asset caching separate from private API traffic, serving `sw.js`, `index.html`, and `manifest.webmanifest` with `no-cache, no-store, must-revalidate`.
- Preserve visible loading, empty, error and success states.
- Support keyboard navigation, `Escape` closing and focus traps for dialogs (`useFocusTrap`), and `prefers-reduced-motion` preferences.

## Verification rules

Before changes: inspect Git state and existing docs/tests.
After changes: run the smallest relevant Vitest suite, then `npm run lint`, `npm test`, and `npm run build`.
Do not modify tests only to hide regressions. Add focused tests only for real behavior gaps.
Do not commit, merge or push unless the user explicitly requests it.
