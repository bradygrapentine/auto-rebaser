# Repo-name autocomplete on the options page

**Date:** 2026-05-08
**Status:** Draft — approved for planning

## Problem

The options page lets users add `owner/repo` strings to skip/ignored-repository
lists via free-text inputs. Typos slip through silently and surface later as
confusing entries on the popup ("why isn't this repo being rebased?" — because
the rule was registered against a misspelled name). There is no feedback
distinguishing a real repo from a typo.

## Goal

Make it easy to enter a correct `owner/repo` on the options page by suggesting
repos the user actually has PRs in, while still allowing free-text entry for
repos the extension hasn't seen yet.

## Non-goals

- Live GitHub search API completion as the user types.
- Suggesting repos from browser history or open tabs.
- Fuzzy / substring matching beyond what `<datalist>` provides natively.
- Changing the popup UI.
- Any change to the rebase logic itself.

## Approach

Cache the set of `owner/repo` strings observed during the existing PR scan in
the service worker, and feed that cache into a `<datalist>` attached to the
skip/ignore inputs on the options page. Free-text entry stays valid; the
suggestions are advisory.

No new manifest permissions are required — `api.github.com` host access and
the existing PR scan already provide the data.

## Data model

New `chrome.storage.local` key:

```ts
type KnownRepo = {
  fullName: string;   // "owner/repo"
  lastSeenAt: number; // ms epoch
};

type KnownReposState = {
  knownRepos: KnownRepo[];
};
```

Invariants:

- `fullName` matches `^[\w.-]+/[\w.-]+$`.
- Entries are unique by `fullName`.
- Length capped at **200**; eviction is LRU by `lastSeenAt` ascending.

## Service worker changes

After every successful PR scan:

1. Build a `Set<string>` of `owner/repo` from the scan results.
2. Read current `knownRepos`.
3. For each scanned repo: upsert with `lastSeenAt = Date.now()`.
4. If length > 200, drop the oldest by `lastSeenAt` until length ≤ 200.
5. Persist.

Failures in this step must not block the rebase flow — wrap in try/catch and
log; the cache is best-effort.

## Options page changes

For each input that accepts an `owner/repo` (skip list, ignore list):

- Replace the bare `<input>` with `<input list="known-repos-<fieldId>">` plus a
  sibling `<datalist id="known-repos-<fieldId>">` populated from `knownRepos`,
  sorted by `lastSeenAt` descending.
- On `blur`:
  - Trim whitespace.
  - If non-empty and does not match `^[\w.-]+/[\w.-]+$`, render an inline
    error message ("Expected `owner/repo`") and prevent save.
- Save still accepts any value matching the regex, including names not in the
  cache (so brand-new repos aren't blocked).
- Show a small caption under the field: "Suggestions come from your open PRs."

### First-run behavior

When the options page mounts and finds `knownRepos` empty, dispatch a message
to the service worker requesting a one-shot scan. The page renders without
suggestions immediately and updates the datalist when the scan completes. If
the scan fails or returns empty, the datalist stays empty — free-text entry
still works.

## Error handling

- Storage read/write failures: log to the existing telemetry channel; the UI
  falls back to no-suggestions mode.
- Malformed entries already present in storage (e.g., from a prior bug):
  filtered out at read time, not surfaced.

## Testing

Unit:

- LRU eviction at the 200-entry cap, ordered by `lastSeenAt`.
- Upsert: existing `fullName` updates `lastSeenAt`, does not duplicate.
- Validator regex: positive cases (`a/b`, `Org-Name/repo.name`,
  `user/repo_1`) and negative cases (`bare`, `a/`, `/b`, `a b/c`, empty).

Options page:

- Datalist rendered with cache contents in `lastSeenAt`-desc order.
- Invalid free-text shows inline error and blocks save.
- Valid free-text not in cache saves successfully.
- Empty-cache mount triggers a scan request to the worker.

Service worker:

- After a scan, `knownRepos` contains the union of prior + scanned repos.
- Cap honored across multiple scans.
- Scan-side failures don't propagate out of the cache update path.

## Open questions

None.

## Out of scope (future)

- GitHub search API fallback for repos with no open PRs.
- Server-side validation that the repo exists / user has access.
- Cross-device sync of `knownRepos` (currently `local`, not `sync`).
