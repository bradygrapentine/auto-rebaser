# auto-rebaser

<img src="icons/logo.svg" alt="auto-rebaser" width="120" align="right" />

Chrome / Firefox extension that auto-rebases your open GitHub PRs and runs a small set of cleanup automations on top. Polls your authored PRs on a configurable interval, then for each one decides what to do — rebase if behind, delete the branch if merged, flip on auto-merge (or merge directly when the PR is already clean), resolve obsolete review threads, surface idle PRs.

Local-first. No backend. Everything runs in the extension service worker against the GitHub API with your GitHub App token (OAuth Device Flow, recommended) or a Personal Access Token. **Multi-account** on the same install is supported on v2 — sign in with multiple GitHub accounts and switch from the popup header. GitHub Enterprise Server is supported via a per-host setting.

## Install

- **Chrome Web Store**: https://chromewebstore.google.com/detail/auto-rebaser/fcbanfgcfcjmhnoanachedlpbopiodpi
- **Firefox Add-ons**: _in review_ — load unpacked from `dist-firefox/` in the meantime (see Development).

## Features

### Rebase core (shipped)

- **GitHub App sign-in (recommended) or PAT** — App auth uses OAuth Device Flow; tokens kept in `chrome.storage.local`, refresh tokens rotated. PAT remains as a legacy path.
- **Authored PR discovery** — `GET /search/issues?q=is:pr+is:open+author:@me`, paginated
- **Auto-rebase** — any PR with `mergeable_state === "behind"` gets `PUT …/update-branch` with `update_method: "rebase"`
- **Configurable poll interval** — 1m / 2m / 5m / 10m / 15m / 30m / 1h / 2h / 4h
- **Popup PR list** — repos collapse into groups; status badges; "Poll now" button; spinner while polling
- **Badge count** — extension icon shows how many PRs got rebased in the last cycle
- **ETag caching** — `If-None-Match` everywhere; 304s cost zero rate-limit
- **Graceful errors** — auth errors prompt re-authentication; rate limits skip the cycle silently; per-PR errors don't block the rest
- **GitHub Enterprise Server** — optional `enterpriseHost` setting points all OAuth + REST + GraphQL traffic at a self-hosted instance.

### Automations (shipped)

All automations apply only to PRs you authored. Each one has its own kill-switch and its own per-repo skip list. The global "Ignored repos" list removes repos from both the popup and every automation.

- **Auto-delete merged branches** (default ON) — when an authored PR merges and the repo doesn't already auto-delete head branches, the extension deletes the head ref. Forks are never touched.
- **Auto-enable auto-merge** (default OFF) — flips on the GitHub auto-merge toggle so the PR lands as soon as required checks/reviews pass. Smart merge-method selection: configure an ordered preference list (squash / rebase / merge) and the extension picks the first method the repo allows.
- **Merge clean PRs immediately** (default OFF, sub-toggle of auto-enable auto-merge) — when GitHub refuses to enable auto-merge because the PR is already clean (nothing to wait on), the extension falls through to a direct REST merge with a `sha` precondition. Logged as `auto_merged_now` in the activity log.
- **Auto-resolve obsolete review threads** (default OFF) — resolves review threads whose anchor line no longer exists (`isOutdated && line === null`). Threads still anchored to a line are never auto-resolved; manually-unresolved threads aren't re-resolved.
- **Stale-PR badge + ping reviewers** (default OFF) — surfaces idle days on your own PRs; one-click reviewer ping with a confirmation dialog and a configurable comment template. 24h per-PR throttle.

### Quality-of-life (shipped)

- **Activity log** — every write action (rebases, branch deletes, auto-merge enables, direct merges, thread resolves, reviewer pings) is recorded with timestamp, repo, PR, result, and details. 200-entry / 30-day cap. Filter by action / repo / date / account; sort newest-first, oldest-first, or by repo.
- **Keyboard shortcuts** (default ON) — `r` poll now, `s` settings, `?` help, `j` / `k` navigate, `Enter` open, `Esc` back.
- **Repo-name autocomplete** — every "Skip repos" / "Ignored repos" input is backed by a `<datalist>` of repos sourced from your current open PRs.

### Multi-account (v2 — shipped)

- **Account switcher** — popup header dropdown lists every signed-in account; click to switch active. Supports `+ Add account`, `Sign out <login>`, and `Sign out all`.
- **Multi-account polling** — every signed-in account polls independently on each cycle; the toolbar badge shows the combined rebased-this-cycle count across accounts.
- **Settings split** — global cross-account settings (poll interval, ignored repos, keyboard shortcuts, GHES host) sit above an explicit `this account (<login>)` divider that scopes everything else (the per-automation toggles + skip lists).
- **Activity log account filter** — when more than one account is signed in, a `this account · all accounts` chip appears; `all` interleaves activity newest-first and tags non-active rows with `[login]`.
- **Repo-filter chip** — header `[ filter (N) ▾ ]` dropdown narrows the popup PR list to a chosen subset of repos. Multi-select, persists per-account, polling is unchanged.
- **Desktop notifications** (default OFF, opt-in) — toggle ON in settings to fire a system notification when a PR is rebased / hits a conflict / merges / goes idle / reviewer-ping confirms. 1-hour throttle per (PR, event); permission is requested on first toggle and removed on toggle-off.

### Settings

- **Globally ignored repos** — repos in this list are invisible to the popup *and* untouched by every automation. Adding a repo here removes its PRs from the popup display immediately, no poll required.
- **Per-automation skip-repos** — narrower opt-out: a repo here is excluded from one automation but still polled and shown.
- **`github_poll_interval`** — the alarm cadence.

The popup footer summarises the last cycle: `rebased N · branches deleted N · auto-merge enabled N · merged N · threads resolved N · errors N`. Zero-count items are hidden.

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
npm test               # vitest run (~810 tests)
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
