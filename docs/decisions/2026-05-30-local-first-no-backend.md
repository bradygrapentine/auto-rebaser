# Local-first, no-backend architecture

**Date:** 2026-05-30
**Status:** Accepted
**Backlog:** DOC-1 (retrospective — decision predates the ADR)

## Context

Auto-rebaser polls a user's authored GitHub PRs and rebases the ones that fall
behind. That work could run server-side — a hosted service holding each user's
token and polling on their behalf. That design carries a standing cost: a server
to run, and a database of user GitHub tokens to secure and be liable for.

## Decision

Run entirely client-side, with no first-party backend. The poll loop is an
alarm-driven job in the MV3 service worker (`src/background/alarm.ts`,
`poll-cycle.ts`, `service-worker.ts`) that calls the GitHub API directly. All
state lives in `chrome.storage` — auth tokens, settings, the ETag cache, the
activity log. There is no server, no database, and no first-party network
endpoint anywhere in the codebase.

## Consequences

- **Benefit:** the user's GitHub token never leaves their browser; there is no
  server to operate, scale, or breach, and no per-user data to be liable for.
- **Benefit:** the extension works offline-to-online opportunistically — it acts
  whenever the browser wakes the service worker's alarm.
- **Cost:** all work is bounded by the MV3 service-worker lifecycle (the worker
  is killed when idle and revived by the alarm); long-running or guaranteed
  background work is not possible. Cross-device continuity is limited to what
  `chrome.storage.sync` carries, not a server-side source of truth.
- **Cost:** rate limiting, retries, and ETag caching all live client-side
  (`src/core/etag-cache.ts`, the poll cycle's throttles) rather than behind a
  shared server cache.
