# SEC-7 — auth-diff security gate (runbook)

**Shipped:** 2026-05-29. **Status:** advisory (NOT a required check).

## What it is

A `pull_request`-triggered GitHub Actions job (`.github/workflows/security-gate-pr.yml`)
that runs `scripts/security-gate-auth.sh` whenever a PR touches `src/core/auth*`
or `src/github/http*`. The script asserts three concrete auth invariants from
the shipped SEC work and fails (non-zero, posted as the `auth-gate` check) on
violation.

This is a **CI-runnable static checker**, not the `/security-gate` Claude skill
(which cannot run in CI). It catches regressions of greppable invariants — it is
not a substitute for the human/Claude security review.

## The three checks

- **(a)** No `chrome.storage.sync.set` in auth core — access/refresh tokens must
  go to `storage.local` (or `storage.session` per SEC-5). The legacy PAT
  migration's `storage.sync.get`/`.remove` are allowed (read/clear only).
- **(b)** No token-like identifier (`accessToken`/`refreshToken`/`access_token`/
  `refresh_token`/`client_secret`) passed to `console.*` in auth/http paths.
- **(c)** Every `src/github/http*` file references `assertGithubOrigin`
  (origin validation before attaching credentials — SEC-2/6).

## Run locally

```bash
bash scripts/security-gate-auth.sh   # exits 0 clean, non-zero + file:line on violation
```

## Tuning / follow-ups

- **Promotion to required check:** add `auth-gate` to the `main` ruleset
  (`16056686`) required-status-checks set and validate with a throwaway PR
  (mirror the OPS-1 procedure). Held off until the checker has run on a few real
  auth PRs without false-positives.
- **False positives:** the patterns are intentionally narrow (variable
  identifiers, not prose). If a legitimate edit trips a check, tighten the
  pattern here rather than weakening the invariant.
- **Manifest review** (CSP, permissions) is out of scope for this script and
  stays a manual review item.
