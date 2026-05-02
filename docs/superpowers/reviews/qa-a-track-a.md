# QA-A Track A Review Report

**Reviewer:** QA-A (Sonnet review agent)
**Date:** 2026-05-02
**Scope:** `src/core/auth-store.ts`, `src/core/etag-cache.ts`, `src/core/pr-store.ts`, `src/core/settings-store.ts`, `src/core/auth.ts`, `src/github/http.ts`, `src/github/endpoints.ts` and their tests

---

## 1. Summary Verdict

**APPROVE_WITH_FOLLOWUPS**

Code quality is high, security posture is good, coverage is 100%, and all critical error paths are tested. One MAJOR typecheck failure (`import.meta.env` missing from `ImportMeta`) must be fixed before downstream branches can build cleanly. Two MINOR gaps round out the findings.

---

## 2. Coverage Table

All 49 tests pass. Coverage from `npx vitest run --coverage`:

| File                  | Stmts | Branch | Funcs | Lines |
|-----------------------|-------|--------|-------|-------|
| core/auth-store.ts    | 100%  | 100%   | 100%  | 100%  |
| core/auth.ts          | 100%  | 100%   | 100%  | 100%  |
| core/etag-cache.ts    | 100%  | 100%   | 100%  | 100%  |
| core/pr-store.ts      | 100%  | 100%   | 100%  | 100%  |
| core/settings-store.ts| 100%  | 100%   | 100%  | 100%  |
| github/endpoints.ts   | 100%  | 100%   | 100%  | 100%  |
| github/http.ts        | 100%  | 100%   | 100%  | 100%  |
| **All files**         | **100%** | **100%** | **100%** | **100%** |

Configured thresholds (lines: 95%, functions: 95%, branches: 88%, statements: 95%) — all exceeded.

---

## 3. Findings

### MAJOR

**M-1: `import.meta.env` TypeScript error in `src/core/auth.ts`**
- `tsc --noEmit` fails with two errors:
  ```
  src/core/auth.ts(9,32): error TS2339: Property 'env' does not exist on type 'ImportMeta'.
  src/core/auth.ts(10,36): error TS2339: Property 'env' does not exist on type 'ImportMeta'.
  ```
- Root cause: `tsconfig.json` does not include `"types": ["vite/client"]` (or equivalent) to augment `ImportMeta` with Vite's `env` property. The project uses `vite build` but the `tsconfig.json` `compilerOptions` does not reference the Vite client types.
- Impact: Any downstream branch that runs `tsc --noEmit` will fail. Auth flow would also fail at runtime in a plain `tsc` build pipeline.
- Fix: Add `"types": ["vite/client"]` (or `/// <reference types="vite/client" />`) to tsconfig, or add `"@types/vite"` augmentation. Because this is a Chrome extension using `import.meta.env` from Vite, adding `"vite/client"` to `compilerOptions.types` in `tsconfig.json` is the standard fix.

### MINOR

**m-1: `http.ts` accepts arbitrary URL path — no allowlist enforcement at call sites**
- `request<T>(path: string, ...)` prepends `GITHUB_API_BASE`, so the final URL is always `https://api.github.com<path>`. This is safe as long as callers pass relative paths. However, if a caller passes a full `https://evil.example.com/...` URL, the result is a malformed URL (`https://api.github.comhttps://...`) that will fail fetch, not a successful SSRF — so this is low severity. No test covers the "caller passes absolute URL" edge case and the behavior is silently wrong rather than throwing. A guard (`if (path.startsWith('http')) throw new Error(...)`) would make the contract explicit.

**m-2: `etag-cache.ts` has no `deleteEntry` / cache eviction — unbounded growth**
- `setEntry` grows the `etags` map indefinitely. `chrome.storage.local` has a 10 MB quota. For a user with many PRs over time, stale URLs accumulate. No story explicitly requires eviction, but there's no test asserting old entries are cleaned up and no documented known limitation. A NIT-level note in code comments or a follow-up story would address this before it causes quota errors in production.

### NIT

**n-1: `pr-store.test.ts` missing `beforeEach` resets for `chrome.storage.local` mocks**
- Tests reassign `chrome.storage.local.get` and `.set` inline per test (which is fine), but do not reset them in a shared `beforeEach`. If test order shifts or a new test is added without its own mock, it may inherit a prior test's mock. Not currently a problem, but fragile. Recommend adding a `beforeEach(() => { vi.resetAllMocks(); })` at the describe root.

**n-2: `endpoints.test.ts` does not test error propagation**
- All endpoint tests mock `request` as resolved. No test verifies that a rejection from `request` propagates out of `searchAuthoredPRs`, `updateBranch`, etc. Currently the endpoints do no error handling (they let errors bubble), which is correct — but a single negative-path test per endpoint would confirm that contract.

---

## 4. Spec Coverage Matrix

| Story.AC | Description | Covered by test |
|----------|-------------|-----------------|
| 1.1 — Token persists across restarts | `setToken` writes to `chrome.storage.sync` | `auth-store.test.ts :: setToken writes correct key` |
| 1.1 — Sign out clears token | `clearToken` removes from sync | `auth-store.test.ts :: clearToken calls remove with correct key` |
| 1.1 — CSRF: state mismatch rejected | `AUTH_STATE_MISMATCH` thrown on wrong state | `auth.test.ts :: signIn throws AUTH_STATE_MISMATCH when state differs` |
| 1.1 — State generated with crypto.randomUUID | `crypto.randomUUID()` called in `signIn` | `auth.test.ts` (spy on `crypto.randomUUID` confirms usage) |
| 1.1 — Redirect URI from `getRedirectURL` | `chrome.identity.getRedirectURL()` called, not hardcoded | Verified by source review (no hardcoded URI) |
| 1.1 — Cancel stays on sign-in screen | `AUTH_CANCELLED` thrown when flow returns undefined | `auth.test.ts :: signIn throws AUTH_CANCELLED when launchWebAuthFlow returns undefined` |
| 1.2 — Authorization header present | `Bearer <token>` in request headers | `http.test.ts :: sends Authorization header` |
| 1.2 — 304 uses cached data | cached result returned on 304 | `http.test.ts :: 304 with useETag returns cached data` |
| 1.3 — updateBranch calls PUT with rebase | PUT body `{ update_method: 'rebase' }` | `endpoints.test.ts :: calls PUT with correct path and rebase body` |
| 1.5 — Default interval 5 min | `DEFAULT_INTERVAL_MINUTES = 5` in constants | `settings-store.test.ts :: returns default settings when nothing stored` |
| 1.5 — Interval persists | `saveSettings` writes to `chrome.storage.sync` | `settings-store.test.ts :: saveSettings stores provided settings` |
| 1.9 — First request stores ETag | `setEntry` called with new ETag on 200 | `http.test.ts :: 200 with etag stores new entry` |
| 1.9 — Subsequent request sends If-None-Match | `If-None-Match` header included when entry exists | `http.test.ts :: 304 with useETag sends If-None-Match header` |
| 1.9 — 304 returns cached data | cached data returned, `setEntry` not called | `http.test.ts :: 304 with useETag returns cached data` |
| 1.10 — 401/403 clears token, throws AUTH_ERROR | `clearToken` called + error thrown | `http.test.ts :: 401 throws AUTH_ERROR and calls clearToken` |
| 1.10 — 429 skips cycle | `RATE_LIMITED` thrown | `http.test.ts :: 429 throws RATE_LIMITED` |
| 1.10 — 5xx throws HTTP_n | `HTTP_500` thrown | `http.test.ts :: 500 throws HTTP_500` |

**Gaps:** None for Track A scope. Story 1.10 AC for 422/409 from `update-branch` (mark `needs-manual` / `conflict`) is background-layer logic, not Track A — correctly out of scope here.

---

## 5. Recommended Follow-ups

1. **(Fix before next merge)** Add `"vite/client"` to `tsconfig.json` `compilerOptions.types` to resolve the two `import.meta.env` TS2339 errors. Confirm `npx tsc --noEmit` exits 0 after fix.

2. **(MINOR, before launch)** Add an explicit guard in `http.ts` `request()` that throws if `path` starts with `http` or `//`, making the relative-path contract explicit and preventing silent URL mangling.

3. **(MINOR, before launch)** Add a comment or follow-up story for `etag-cache.ts` about cache eviction strategy. At minimum, document the known unbounded-growth behavior and the `chrome.storage.local` 10 MB quota risk.

4. **(NIT, nice-to-have)** Add `beforeEach(() => { vi.resetAllMocks(); })` to `pr-store.test.ts` describe root to prevent test-order dependency on chrome mock state.

5. **(NIT, nice-to-have)** Add at least one rejection-propagation test per endpoint in `endpoints.test.ts` to document the "errors bubble" contract.
