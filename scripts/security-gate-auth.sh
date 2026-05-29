#!/usr/bin/env bash
# SEC-7 — curated auth-diff security gate (advisory, non-required).
#
# Asserts a small set of high-signal auth invariants established by shipped SEC
# work (SEC-1/2/3/6) over the auth-touching source. Exits non-zero on any
# violation, printing the offending file:line. Run by .github/workflows/
# security-gate-pr.yml on PRs that touch auth paths; also runnable locally:
#   bash scripts/security-gate-auth.sh
#
# Scope note: this is a CI-runnable static checker, NOT the /security-gate
# Claude skill (which can't run in CI). It catches regressions of three
# concrete, greppable invariants — not a full review. Manifest CSP/permission
# review stays manual.
set -uo pipefail

AUTH_FILES=(src/core/auth*.ts)
HTTP_FILES=(src/github/http*.ts)
fail=0

# (a) No token WRITE to chrome.storage.sync in auth core. The legacy PAT
#     migration legitimately READS/REMOVES the old sync token
#     (storage.sync.get / .remove), so only `.set` is forbidden — access /
#     refresh tokens belong in storage.local (or storage.session per SEC-5).
if grep -nE 'storage\.sync\.set' "${AUTH_FILES[@]}" 2>/dev/null; then
  echo "SEC-7 (a) FAIL: chrome.storage.sync.set in auth core — tokens must not be written to sync." >&2
  fail=1
fi

# (b) No token-like value passed to console.* in auth/http paths (secrets in
#     logs — see CLAUDE.md secrets rule; matches the variable identifiers, not
#     the English word "token", to avoid prose false-positives).
if grep -nE 'console\.[a-z]+\([^)]*\b(accessToken|refreshToken|access_token|refresh_token|client_secret)\b' "${AUTH_FILES[@]}" "${HTTP_FILES[@]}" 2>/dev/null; then
  echo "SEC-7 (b) FAIL: token-like identifier passed to console.* — never log secrets." >&2
  fail=1
fi

# (c) Every GitHub HTTP client file must validate the request origin before
#     attaching credentials (SEC-2/6 invariant). Trips if a file drops its
#     assertGithubOrigin guard entirely.
for f in "${HTTP_FILES[@]}"; do
  if ! grep -q 'assertGithubOrigin' "$f"; then
    echo "SEC-7 (c) FAIL: $f does not reference assertGithubOrigin — auth-attaching fetch must validate origin." >&2
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "SEC-7 auth-gate: FAIL (see violations above)" >&2
  exit 1
fi
echo "SEC-7 auth-gate: PASS"
