# Backlog

## §1 Ready

### BOT-001 — Auto-rerun transient CI failures

Parse failed-job logs for known transient patterns and rerun the failed jobs once. Cap at 2 reruns per job per PR-head-sha so real failures can't loop.

**Initial pattern list** (extend over time):
- `received a shutdown signal` — job cancelled mid-run
- `Cannot connect to the Docker daemon` — Docker Desktop bounced
- `Failed to resolve latest Supabase CLI release: rate limit exceeded`
- `gitleaks.tmp already exists` — until upstream uses `TMPDIR: ${{ runner.temp }}`
- `429 Too Many Requests` from `ghcr.io` or `docker.io` pulls
- `Cannot connect to the Docker daemon at unix://...docker.sock` (self-hosted variant)

**Acceptance**: rerun fires within 60s of failure detection; emits a single comment on the PR explaining what was matched and that it's an auto-rerun (avoid silent rereruns).

### BOT-002 — Auto-clean self-hosted runner state pre-rerun

Before issuing a BOT-001 rerun, hit the runner host (ssh or runner API) and clean known stale paths: `$TMPDIR/gitleaks*`, leftover `~/.docker/run/docker.sock` socket if Docker has bounced, stale `_work/<repo>/_temp/*` older than 1h.

Manual cleanup we did this session moves into the bot.

### BOT-003 — Detect stale required-check ghosts

Branch-protection contexts that were renamed/removed from workflows but still required will pin PRs forever (TD-198 incident in carelog). Detect: "no check with this name has run in N days" → emit a warning comment on every blocked PR; optionally open a chore PR to fix the protection ruleset.

### BOT-004 — Auto-label PRs by touched paths

Inferred from workflow `paths:` filters or a `.github/labeler.yml`-style config. Examples: `mobile-validate` when `apps/mobile/**` changes, `e2e-required` when `e2e/**` changes. Saves typing the gate-trigger label by hand.

### BOT-005 — Auto-close stale draft PRs + branches

Configurable thresholds (e.g. draft + no activity 30d → comment-and-wait, 60d → close).

### BOT-006 — Daily digest on long-running PRs

Single comment per day on PRs open ≥ 3d, summarizing what's blocking ("waiting on CI checks: foo, bar"; "waiting on review from @someone"; "needs rebase").

## §2 Notes

These 6 rows expand auto-rebaser from "just rebase PRs" toward a broader PR-flow concierge bot, modeled on [refined-github](https://github.com/refined-github/refined-github)'s many-small-features approach. None of these block current usage; they're opportunistic quality-of-life adds.

Pattern lists in BOT-001 and BOT-002 should grow over time as we find more transients worth automating around.
