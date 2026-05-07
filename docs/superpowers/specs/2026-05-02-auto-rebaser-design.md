# Auto-Rebaser Extension — Design Spec
_2026-05-02 · status: ✅ shipped (v1.0.x). Frozen reference. Current behaviour may have evolved — `src/` and `docs/superpowers/BACKLOG.md` §7 are authoritative._

## Overview

A Chrome extension (Manifest V3) that polls GitHub for all open PRs authored by the authenticated user and automatically rebases any that are behind their base branch. Eliminates the manual "Update branch" click and pipeline retrigger loop.

## Scope

- **MVP target:** github.com only
- **Auth:** GitHub OAuth App (upgradeable to multi-user production later)
- **Distribution:** Chrome extension (Chrome Web Store compatible)
- **Backend:** None — standalone extension only

---

## Architecture

### Module Map

```
manifest.json
background/
  service-worker.ts   ← alarm handler, orchestrates poll + rebase loop
  github-client.ts    ← all GitHub API calls (auth, ETag, rate limits)
  pr-store.ts         ← chrome.storage.local read/write
popup/
  popup.tsx           ← PR list with per-PR status badges
  settings.tsx        ← polling interval config, sign in/out
```

### Tech Stack

- TypeScript throughout
- React for popup UI (no component library)
- Vite for bundling
- `chrome.alarms` for scheduled polling
- `chrome.storage.sync` for OAuth token
- `chrome.storage.local` for PR state cache

---

## Auth

GitHub OAuth App flow via `chrome.identity.launchWebAuthFlow`:

1. User clicks "Sign in with GitHub" in popup
2. Extension opens OAuth redirect URL
3. GitHub redirects back with `code`
4. Extension exchanges `code` for access token via token endpoint
5. Token stored in `chrome.storage.sync`

**Scopes:** `repo` (covers public and private repos, required for `update-branch`)

**Token refresh:** GitHub OAuth tokens don't expire. Re-auth only needed if user revokes.

**Client secret note:** OAuth App token exchange requires `client_secret`. For MVP it is embedded in the extension (acceptable per GitHub guidelines for installed apps — secret is scoped to a registered redirect URI). For production distribution, replace the exchange step with a thin backend proxy; no other auth code changes.

---

## Poll Loop

Triggered by `chrome.alarms` at user-configured interval (default: 5 min).

```
1. GET /search/issues?q=is:pr+is:open+author:@me&per_page=100
   → list of {owner, repo, number} tuples

2. For each PR:
   GET /repos/{owner}/{repo}/pulls/{number}
   → check mergeable_state

3. If mergeable_state === "behind":
   PUT /repos/{owner}/{repo}/pulls/{number}/update-branch
   body: { update_method: "rebase" }

4. Write result to pr-store → popup reads from store
```

**Rate limits:** Search API = 30 req/min authenticated. PR fetches and update-branch calls count against the 5000 req/hr REST limit. For typical usage (< 20 open PRs, polling every 5 min) this is negligible.

**ETag caching:** `github-client` stores ETag per URL in `chrome.storage.local`. On repeat requests, sends `If-None-Match` header. GitHub returns 304 (no API cost) when nothing changed.

---

## PR States

| State | Meaning |
|---|---|
| `current` | `mergeable_state` is not `behind` — no action needed |
| `behind` | Detected behind, rebase queued |
| `updating` | `update-branch` call in flight |
| `updated` | Successfully rebased this poll cycle |
| `conflict` | `mergeable_state === "dirty"` — has merge conflicts, skip |
| `needs-manual` | `update-branch` returned 422 — complex history, skip |
| `error` | Network/5xx error — will retry next poll |

**Never falls back to merge.** Only `update_method: "rebase"` is used. If GitHub rejects it, the PR is marked `needs-manual` and left alone.

---

## Data Model

```ts
interface PRRecord {
  id: number;
  number: number;
  title: string;
  repo: string;        // "owner/repo"
  url: string;
  state: PRState;
  lastUpdated: number; // epoch ms
  errorMessage?: string;
}

type PRState = "current" | "behind" | "updating" | "updated" | "conflict" | "needs-manual" | "error";
```

Stored as `{ prs: PRRecord[] }` in `chrome.storage.local`.

---

## Popup UI

Two views:

**PR List (default):**
- Compact list of all open authored PRs
- Per-row status badge (color-coded by state)
- Last poll timestamp at bottom
- "Poll now" button to trigger immediate run

**Settings:**
- Polling interval selector (1 min / 5 min / 15 min / 30 min)
- Sign out button
- GitHub username display

**Badge:** Extension icon badge shows count of PRs updated in last poll cycle. Clears on next poll.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| 422 from `update-branch` | Mark `needs-manual`, skip until PR changes |
| 409 conflict | Mark `conflict`, skip |
| 401/403 | Clear token, show "Re-authenticate" in popup |
| Rate limit (429) | Skip current poll, log warning, retry next alarm |
| Network error | Mark affected PRs as `error`, retry next poll |
| Search returns 0 PRs | No-op (user has no open PRs) |

---

## Future Upgrade Path

- **GitHub Enterprise:** Parameterize base URL in `github-client.ts` — one config field
- **GitHub OAuth → multi-user:** The OAuth App setup is already the correct foundation; adding a backend is additive, not a rewrite
- **Firefox:** MV3 is supported in Firefox 109+; manifest adjustments are minor

---

## Out of Scope (MVP)

- PRs not authored by the user
- Org-level PR watching
- Webhook/real-time updates (polling only)
- Desktop notifications
- PR review or merge actions
