# Minimal CLI — scope plan
_2026-05-06_

Reference plan, not active work. Triggered when (a) two or more users say "I'd use it if I had a CLI" AND (b) `brew install <something>` works on their corporate machine without a ticket.

## Goal

Ship a small `auto-rebaser` CLI that does the **same job as the extension's poll cycle** in environments where the extension is blocked (corporate Chrome policy) but a user-space CLI is permitted. Same auth path, same automation behavior, no new feature surface.

This is **packaging-level parity, not product expansion**. Nothing in this plan introduces capabilities the extension doesn't already have.

## Non-goals (explicit)

- No new commands beyond what the poll cycle does (no `--strategy ours/theirs`, no `--org`, no `schedule`, no `report`).
- No daemon mode. Cron is the user's responsibility — the CLI runs once per invocation and exits.
- No new monetization tier, marketing positioning shift, or "developer infrastructure product" framing.
- No SaaS backend, telemetry, or update server.
- No CI integration as a first-class feature (it'll happen to work, we don't promise it).

If this drifts toward a separate product: stop and re-scope.

## Architecture

Monorepo restructure of the existing repo. Three workspaces:

```
auto-rebaser/
  packages/
    core/        # extracted from current src/core (no chrome.*)
    extension/   # current src/, importing from @auto-rebaser/core
    cli/         # new — Node entry point
```

Why monorepo, not separate repos: shared core stays a single source of truth. Extension and CLI test against the same modules. Bug fixes land once.

## Files to extract into `packages/core` (no chrome.* imports)

Confirmed CLI-portable today:
- `auth-device-flow.ts` (uses `fetch` only)
- `auth-refresh.ts` (uses `fetch` + an injectable storage interface — needs a small refactor)
- `host-config.ts` (uses settings — needs storage interface)
- `staleness.ts` (pure)
- `installations-helpers.ts` (pure, except the import-request URL helper which uses host-config)
- `state-machine.ts` (pure)
- `automations-types.ts` (types only)
- `activity-log-types.ts` (types only)
- `ping-throttle.ts` logic (storage interface)
- All `endpoints/*.ts` (use `request()`, which goes through `http.ts`)
- `http.ts`, `http-extra.ts`, `graphql.ts` (use storage indirectly via auth-refresh)

Storage abstraction needed: today these modules call `chrome.storage.local.get/set` directly. CLI needs filesystem-backed equivalents. Solution: introduce a `Storage` interface in `packages/core`:

```ts
interface KVStorage {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}
```

Two implementations:
- `packages/extension/storage.ts` — wraps `chrome.storage.local`
- `packages/cli/storage.ts` — JSON file at `~/.config/auto-rebaser/state.json`, mode 0600

Each entry point injects its storage at startup. `auth-store.ts`, `etag-cache.ts`, `pr-store.ts`, `automations-store.ts`, `ping-throttle.ts` all consume the interface instead of `chrome.storage.local` directly.

This is a meaningful refactor in the extension codebase (~15 files touched) but unblocks the CLI cleanly. It's also good extension hygiene — gets us closer to testable storage.

## Files to create in `packages/cli`

```
src/
  index.ts          # CLI entry; argv parse → dispatch to commands
  commands/
    login.ts        # device flow, save token, print success
    logout.ts       # clear token file
    poll.ts         # one poll cycle (same as extension's runPollCycle)
    status.ts       # print current PRs + last-poll time
  storage.ts        # KVStorage impl backed by ~/.config/auto-rebaser/state.json
  log.ts            # structured stderr logging (tagged levels, no token leakage)
package.json        # bin: { auto-rebaser: dist/index.js }
README.md
```

Total estimated: ~400 LOC for `cli/`, ~200 LOC of core refactor, ~50 LOC of new storage abstraction. Two days, ungenerously estimated.

## Commands (surface)

```
auto-rebaser login                    # device flow
auto-rebaser logout
auto-rebaser poll                     # run one poll cycle, print summary, exit
auto-rebaser status                   # print PRs + last summary, exit
auto-rebaser --version
auto-rebaser --help
```

That's the entire user-facing surface for v1.

## Auth flow (CLI side)

1. `auto-rebaser login` calls `startDeviceFlow()` from core.
2. Print `Open https://github.com/login/device and enter ABCD-1234` to stdout. Print device-code-expires-at as a timestamp.
3. Call `pollDeviceFlow()`. While polling, print a spinner / dots to stderr (NOT stdout — keeps stdout clean for piping).
4. On success, save the `TokenSet` to `~/.config/auto-rebaser/state.json` under key `auth` with `{ method: 'github_app', ...tokenSet }` — same shape the extension uses.
5. Print `Signed in as <login>` and exit 0.

Token refresh: on each `auto-rebaser poll`, the same `ensureFreshToken()` from core runs. If access-token is near expiry, refresh transparently. If refresh-token expired (~6mo), exit with non-zero and `Run \`auto-rebaser login\` to sign in again.`

PAT path: support too, for users who can't / won't use Device Flow. `auto-rebaser login --pat` prompts for a PAT, validates against `/user`, saves `{ method: 'pat', token }`. Same path the extension's PAT entry takes.

## Cron pattern (documented, not built)

README example:

```cron
*/5 * * * * /usr/local/bin/auto-rebaser poll >> ~/.cache/auto-rebaser.log 2>&1
```

That's the entire scheduled-execution story. No daemon. No supervisor. No state file lock contention because each invocation is self-contained.

## Distribution

v1: npm only. `npm install -g @bradygrapentine/auto-rebaser`. Easy, free, works for the JS-friendly users who'd plausibly install this.

v2 (later, if demand): homebrew tap. Requires GitHub Action to build per-arch binaries via `pkg` or `@vercel/ncc` + a small Formula. Skip until users actually ask.

Not needed: Windows MSI, deb/rpm, Snap, Flatpak. Don't sign up for that until usage justifies it.

## Telemetry

None. Match the extension. Project's `PRIVACY.md` line for CLI: same data classes (auth + ETag cache + PR list + activity log), filesystem instead of `chrome.storage.local`, never sent off the user's machine.

## What this DOESN'T fix

- Endpoint allowlists. If `api.github.com` is blocked at the corporate proxy, nothing user-space can fix that — same as the extension hitting the same endpoint.
- Binary allowlists (Santa, AppLocker). User has to file a ticket either way.
- Scheduled execution when laptop is closed. Cron only fires when the machine is on. If users want 24/7 polling, they need a server — out of scope.

## Open questions to resolve before starting

1. **Validation**: Are 2+ users actually blocked on this? If only 1, point them at GitHub's native auto-merge + branch protection.
2. **Monorepo cost**: Restructuring touches every existing import path. Roughly half a day of mechanical churn + risk of breaking the extension during the move. Worth it for one CLI? Probably yes if we expect this code to live; probably no if the CLI is "spike and discard."
3. **Alternative — copy don't share**: instead of a monorepo, write the CLI as a standalone Node project that *vendors* a snapshot of the auth modules. Lower upfront cost, higher drift cost over time. Acceptable if we're confident the CLI is small enough that drift never matters.

## Recommended sequence

1. Confirm the constraint with one specific user: "If I shipped this as `brew install auto-rebaser`, would your IT let you run it?"
2. If yes for 2+ users:
   - **Day 1**: monorepo restructure. Extract `packages/core`, leave extension importing from it. CI green at end of day.
   - **Day 2**: CLI scaffold. `login` + `poll` commands. README. Manual smoke test against a real account.
   - Ship as `0.1.0` on npm. Linked from extension's PR list footer ("CLI version available — see GitHub").
3. If yes for 0–1 users: don't build it. Add a paragraph to the README ("If you can't install the extension, here's how to use GitHub's native auto-update branch + branch protection") and move on.

## Cost recap

| Step | Estimate |
|---|---|
| Monorepo restructure + storage abstraction | 1 day |
| CLI scaffold + login + poll + tests | 1 day |
| Distribution (npm) + README | 0.5 day |
| **Total** | **~2.5 days** |

Versus the ChatGPT-proposed "developer infrastructure product" with org commands, scheduling, strategies, monetization tiers: weeks-to-months and not what this project is.
