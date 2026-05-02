# auto-rebaser

<img src="icons/logo.svg" alt="auto-rebaser" width="120" align="right" />

Chrome / Firefox extension that auto-rebases your open GitHub PRs and runs a small set of cleanup automations on top. Polls your authored PRs on a configurable interval, then for each one decides what to do — rebase if behind, delete the branch if merged, flip on auto-merge if eligible, resolve obsolete review threads, dismiss stale notifications.

Local-first, single-user. No backend. Everything runs in the extension service worker against the GitHub API with your Personal Access Token.

## Features

### Phase 1 — Rebase MVP (shipped)

- **PAT sign-in** — paste a Personal Access Token; stored in `chrome.storage.sync`
- **Authored PR discovery** — `GET /search/issues?q=is:pr+is:open+author:@me`, paginated
- **Auto-rebase** — any PR with `mergeable_state === "behind"` gets `PUT …/update-branch` with `update_method: "rebase"`
- **Configurable poll interval** — 1m / 2m / 5m / 10m / 15m / 30m / 1h / 2h / 4h
- **Popup PR list** — repos collapse into groups; status badges; "Poll now" button; spinner while polling
- **Badge count** — extension icon shows how many PRs got rebased in the last cycle
- **ETag caching** — `If-None-Match` everywhere; 304s cost zero rate-limit
- **Graceful errors** — auth errors prompt re-paste; rate limits skip the cycle silently; per-PR errors don't block the rest

### Phase 2 — Automations (shipped)

All automations apply only to PRs you authored. Each one has its own kill-switch and its own per-repo skip list.

- **Auto-delete merged branches** (default ON) — when an authored PR merges and the repo doesn't already auto-delete head branches, the extension deletes the head ref. Forks are never touched.
- **Auto-enable auto-merge** (default OFF) — flips on the GitHub auto-merge toggle so the PR lands as soon as required checks/reviews pass. Configurable merge method (squash / merge / rebase). 422s mark the PR `automerge-unsupported` and stop retrying.
- **Auto-resolve obsolete review threads** (default OFF) — resolves review threads whose anchor line no longer exists (`isOutdated && line === null`). Threads still anchored to a line are never auto-resolved; manually-unresolved threads aren't re-resolved.
- **Auto-dismiss stale PR notifications** (default OFF) — marks notification threads read once their PR is closed/merged. Optional sub-toggle to also unsubscribe. Requires the GitHub `notifications` PAT scope; the popup surfaces a "Grant notifications access" CTA when missing.

### Settings

- **Globally ignored repos** — repos in this list are invisible to the popup *and* untouched by every automation. Adding a repo here removes its PRs from the popup display immediately, no poll required.
- **Per-automation skip-repos** — narrower opt-out: a repo here is excluded from one automation but still polled and shown.
- **`github_poll_interval`** — the alarm cadence; covers PRs, notifications, threads, and any future GitHub-side checks.

The popup footer summarises the last cycle: `rebased N · branches deleted N · auto-merge enabled N · threads resolved N · notifications dismissed N · errors N`. Zero-count items are hidden.

## Architecture

| Layer | Owns |
|---|---|
| `src/core/` | Storage primitives (auth, settings, PR store, automations store, ETag cache) and shared types |
| `src/github/` | HTTP + endpoint wrappers, GraphQL client |
| `src/background/` | Service-worker entry, alarm, poll cycle, state machine, automations + orchestrator |
| `src/popup/` | React popup — views, components, hooks |

`src/core` has no DOM and no React. `src/github` has no DOM. `src/background` has no React. Tests live alongside under `tests/`.

The popup uses a terminal-inspired theme — JetBrains Mono, Tokyo Night palette, prompt-style headings.

## Development

```sh
npm install
npm run dev            # vite build --watch
npm test               # vitest run (~430 tests, ~99% line coverage)
npm run typecheck
npm run build          # chrome
npm run build:firefox  # firefox (writes to dist-firefox/)
npm run build:all      # both
```

Load the unpacked extension from `dist/` (Chrome) or `dist-firefox/` (Firefox).

## Docs

- `docs/superpowers/RUNBOOK.md` — setup, troubleshooting, PAT scopes
- `PRIVACY.md` — what gets stored where
- `docs/LAUNCH_PLAN.md` — store submission tracks
- `docs/runbooks/` — chrome / firefox smoke tests, store submission, icons, styling
- `docs/superpowers/BACKLOG.md` — story-level acceptance criteria
- `docs/superpowers/ROADMAP.md` — phase plan
