# Multi-account state isolation with per-account sync-settings keys

**Date:** 2026-05-30
**Status:** Accepted
**Backlog:** DOC-1 (retrospective — v2 multi-account model)

## Context

v2 supports multiple signed-in GitHub accounts, each polling independently.
v1 stored a single account's state in flat top-level `chrome.storage` keys. That
shape can't hold N accounts without their data colliding.

## Decision

Namespace all per-account state under one `accounts: { [accountId]: AccountState }`
object in `chrome.storage.local`, with `active_account_id` selecting the current
one (`src/core/storage/multi-account.ts`). Each account's auth, PR store, ETag
cache, activity log, and throttle state live under its id. A small set of values
stay **global** by design — `known_repos` is shared across accounts.

Per-account *sync* settings are stored as **separate keys**
(`per_account_settings:<accountId>`), not nested under one object, **because
`chrome.storage.sync`'s `QUOTA_BYTES_PER_ITEM` is 8192** — one key per account
keeps each account's settings comfortably under that per-item quota even with
many opt-out repos (`multi-account.ts` header). A `per_account_settings_index`
lists which accounts have sync settings.

## Consequences

- **Benefit:** account data cannot bleed across accounts — each account's ETag
  cache is keyed by its id (the cross-account-leak guard exercised by the
  COVERAGE-1 etag-cache tests), so account A's cached 304 body is never returned
  to account B.
- **Benefit:** the per-key sync layout sidesteps the 8192-byte per-item quota
  that a single nested settings object would eventually breach.
- **Cost:** every read/write must go through the multi-account facade rather than
  touching storage keys directly; the facade is load-bearing and every new
  per-account datum must be threaded through it.
- **Migration:** a v1→v2 upgrade moves flat v1 keys into the `accounts` namespace
  and preserves the originals under a `_migration_backup_v1` safety key.
