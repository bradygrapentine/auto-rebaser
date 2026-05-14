# OWASP Review — Auto Rebaser v2.0.0

**Date:** 2026-05-14
**Reviewer:** /owasp (Claude Opus 4.7)
**Scope:** Entire `src/` tree, `manifest.json`, `.github/workflows/`
**Mode:** Review (no exploitation, read-only)

## Threat model summary

Auto Rebaser is a browser-only MV3 extension. Trust boundaries:

1. **GitHub ↔ extension** — TLS to `api.github.com` / configured GHES. Holds an OAuth user-to-server token (GitHub App device flow, with refresh) or a legacy PAT in `chrome.storage.local`.
2. **Popup ↔ background SW** — `chrome.runtime` message channel.
3. **Settings ↔ network** — user-provided `enterpriseHost` becomes a fetch origin and an Authorization-header recipient.
4. **Browser process ↔ disk** — `chrome.storage.local` is unencrypted at rest.

No content scripts, no LLM calls, no server-side component, no third-party JS at runtime (React + bundled). No `eval`, `innerHTML`, or `dangerouslySetInnerHTML` found.

## Tool pass

Skipped — Semgrep/gitleaks/trivy not installed locally; will be addressed by SEC-8 below.

## Findings (severity-ordered)

### SEC-1 — Missing sender validation on `chrome.runtime.onMessage` — **Medium**
- **File:** `src/background/messages.ts:78-80`
- **Impact:** Handler ignores `sender`. Any future content script, externally-connectable extension, or compromised in-process page could invoke `START_DEVICE_FLOW`, `POLL_NOW`, `CANCEL_DEVICE_FLOW`. Today only the popup speaks to the SW, but defense-in-depth is missing.
- **Remediation:** Validate `sender.id === chrome.runtime.id` and `sender.url?.startsWith(chrome.runtime.getURL(''))` before dispatching; return `{ok:false, error:'UNAUTHORIZED_SENDER'}` otherwise. Same fix for any other `onMessage` listeners.
- **Refs:** OWASP A01:2025, CWE-862.

### SEC-2 — `enterpriseHost` interpolation lacks defense-in-depth — **Medium**
- **Files:** `src/core/host-config.ts:14,18,22`; `validateHost` at `:60`.
- **Impact:** `https://${host}` and `https://${host}/api/v3` are built from user input. `validateHost` allows `[a-z0-9.-]+` but does not reject leading/trailing `-` or `.`, consecutive dots, length > 253, or single-label hosts. If `chrome.storage.local` is tampered with (devtools, another extension with `management` perm, malware on disk) the validator is bypassed and the access token is sent to an attacker-controlled origin.
- **Remediation:**
  1. Tighten `validateHost`: reject `..`, leading/trailing `.` or `-`, length > 253, labels > 63 chars, require at least one dot for non-localhost.
  2. At every request site, assert `new URL(url).hostname` matches `api.github.com` OR equals `settings.enterpriseHost` (read fresh, not interpolated). Refuse to send `Authorization` otherwise.
- **Refs:** OWASP A05:2025 (Injection / SSRF flavor), A04, CWE-918.

### SEC-3 — Add basic supply-chain & secret scanning to CI — **Medium**
- **File:** `.github/workflows/ci.yml` — only runs typecheck/test/build/e2e.
- **Impact:** No `npm audit`, `osv-scanner`, `gitleaks`, or dependency-review action. A vulnerable transitive (vite/react ecosystem) or a leaked token in a future commit would not be caught.
- **Remediation:** Add a `security.yml` workflow running `npm audit --audit-level=high`, `osv-scanner`, `gitleaks detect --no-git`, and the official `actions/dependency-review-action@v4` on PRs. The `/harden-project` skill ships this scaffold.
- **Refs:** OWASP A03:2025, A08, A06.

### SEC-4 — No explicit Content Security Policy in manifest — **Low**
- **File:** `manifest.json`.
- **Impact:** MV3 ships a restrictive default CSP, but declaring it explicitly catches accidental relaxation in future edits and clarifies intent in review.
- **Remediation:** Add `"content_security_policy": { "extension_pages": "script-src 'self'; object-src 'self'; base-uri 'self'" }` (and the firefox manifest variant). Confirm popup still renders.
- **Refs:** OWASP A02:2025.

### SEC-5 — Access tokens stored in `chrome.storage.local` (unencrypted at rest) — **Low**
- **Files:** `src/core/auth-store.ts`, `src/core/storage/multi-account.ts`.
- **Impact:** Local malware or another extension with broad permissions can read tokens off disk. This is the standard MV3 limitation; documenting + mitigating where possible is the bar.
- **Remediation:** Hold the **access token** in `chrome.storage.session` (in-memory, cleared on browser restart) and only persist the **refresh token** in `local`. SW eviction triggers a refresh on next request — acceptable. Write an ADR capturing the trade-off.
- **Refs:** OWASP A04:2025, A07.

### SEC-6 — `Authorization` header sent before any host allowlist re-check — **Low**
- **File:** `src/github/http.ts:54`, `src/github/http-extra.ts:30`, `src/core/auth-store.ts:71`, `src/background/auth-device-flow-runner.ts:76`.
- **Impact:** All four fetch sites build URL from `getApiBase()` and attach `Bearer ${token}` without an inline host check. Fixed by SEC-2's request-site assertion, but listed separately so the fix is verified across all four call sites.
- **Remediation:** Helper `assertGithubOrigin(url)` called inside `request()` / `requestText()` / `fetchLoginForToken()` / device-flow user fetch before any `fetch(url, …Authorization…)`.
- **Refs:** A01, A05, CWE-501.

### SEC-7 — No automated PR-time security gate — **Low**
- **Impact:** `/security-review` and `/security-gate` exist as harness skills but are not wired into CI. Manual-only review will drift.
- **Remediation:** Optional — add a GitHub Action that runs `npm run typecheck && npm test && npm run build && npx playwright test` and, when secrets allow, a Claude Code action calling `/security-gate` on PRs touching `src/core/auth*`, `src/github/http*`, `manifest*.json`, `.github/workflows/**`.
- **Refs:** A06.

### SEC-8 — Document storage-tamper threat in PRIVACY.md / README — **Info**
- **Impact:** Current docs describe what's stored but not the trust model (local-only, browser-process owns it). A short threat-model paragraph reduces inbound questions and clarifies the SEC-5 trade-off.
- **Remediation:** Add a "Threat model & storage" subsection to PRIVACY.md referencing SEC-5's eventual ADR.
- **Refs:** A02.

## Confirmed-clean (no action)

- No `eval`, `new Function`, `innerHTML`, `dangerouslySetInnerHTML`, `document.write` anywhere in `src/`.
- React text children auto-escape; PR titles and repo names in notifications go through `chrome.notifications.create` (plain text, not HTML).
- OAuth device flow polling is bounded by `expiresAt` — no infinite loop.
- Reactive 401 retry triggers at most one refresh per request — no recursion.
- No `client_secret` is held client-side (device flow does not require one).
- `optional_host_permissions: ["https://*/*"]` is broad in manifest but narrowed at request time to `https://${host}/*` (`SettingsView.requestHostPermission`).
- Tokens are not present in any `console.log`/`console.error` call we audited.
- No agentic or LLM call sites — OWASP LLM Top 10 and ASI 2026 categories are N/A.

## Backlog stories

Added to `docs/superpowers/BACKLOG.md` §5 — see SEC-1 through SEC-8.
