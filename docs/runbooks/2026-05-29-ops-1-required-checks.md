# Finish CI hardening: require status checks on the `main` ruleset (OPS-1)

The one manual action left to make the new self-hosted-runner CI setup actually
safe. `main` is already protected by a **ruleset** (id `16056686`) — PR-only,
linear history, no force-push, no deletion, 0 required approvals — but it
requires **zero status checks**, so a PR can still be squash-merged while
`test` / `e2e` are red (the 2026-05-17 incident, where #194/#195/#196 landed on
red CI). This runbook adds the required checks. ~10 minutes.

> Note: The runner itself needs **no action** — it's a healthy launchd service
> (`actions.runner.bradygrapentine-auto-rebaser…`, auto-starts on login). And
> there's **no deployment to do** — `docs/` auto-deploys to GitHub Pages on
> push to main, on GitHub's infra, unaffected by any of this.

## 1. Prerequisites

- [ ] You're the repo owner / admin (you are — `bradygrapentine`)
- [ ] `gh` authenticated — `gh auth status` shows the right account
- [ ] On a clean `main` — `git -C ~/projects/auto-rebaser status -s` is empty-ish

```bash
gh auth status && git -C ~/projects/auto-rebaser rev-parse --abbrev-ref HEAD
```

> Tip: This is a ruleset, not classic branch protection — the classic
> Settings → Branches UI will show "no protection." That's expected; everything
> lives under Settings → Rules → Rulesets.

## 2. The required-check set (decide before you click)

These five must pass before a PR can merge:

- [ ] `test` — unit + typecheck + build (self-hosted)
- [ ] `e2e` — Playwright (ubuntu-latest, as of #209)
- [ ] `npm audit (critical)` — prod-dep critical advisories (self-hosted)
- [ ] `Gitleaks secret scan` — secret scan (self-hosted)
- [ ] `Dependency review` — PR dependency diff (self-hosted)

**Now included (OPS-4, 2026-05-30):**

- [x] `OSV Scanner` — **ADDED to the required set as of OPS-4.** Originally
      excluded here because it was time-box-red from dev-only advisories
      (vite 5→6, esbuild, ws) tracked as OPS-2. OPS-2 is now complete (#221/
      #223/#225): vite is on 6.4.2 and `osv-scanner.toml` carries zero
      suppressions, so OSV is honestly green and safe to require. Six checks now.

**Still deliberately excluded:**

- [ ] Confirm you will NOT add `build` / `deploy` / `report-build-status` —
      those are the GitHub Pages post-merge deploy, not a PR-time gate.

> Watch: Leave **"Require branches to be up to date before merging" OFF.** On a
> solo repo it forces a rebase on every PR for no safety gain, and the
> extension auto-rebases anyway. Keep **required approvals at 0** — with 1, you
> couldn't merge your own PRs (you can't approve your own).

## 3. Apply — Option A: GitHub UI (recommended)

- [ ] Open the rulesets page and click the **`main`** ruleset

  [Settings → Rules → Rulesets](https://github.com/bradygrapentine/auto-rebaser/settings/rules)

- [ ] Tick **"Require status checks to pass"**
- [ ] Add each of the six checks by exact name (search the box; the name must
      match a check that has run recently, so they'll autocomplete): `test`,
      `e2e`, `npm audit (critical)`, `Gitleaks secret scan`, `Dependency review`,
      `OSV Scanner` (the last added via OPS-4 — see §2)
- [ ] Leave **"Require branches to be up to date before merging" unchecked**
- [ ] Leave everything else as-is (PR-only, linear history, 0 approvals all stay)
- [ ] Click **Save changes**

> Note: This is dashboard auth — do it yourself in the browser. (An agent can't
> drive your authenticated GitHub session.)

## 4. Apply — Option B: gh API (automatable alternative)

Rulesets only support **full-replacement** `PUT` (no per-rule PATCH), so this
fetches the current ruleset, injects the `required_status_checks` rule while
preserving everything else, and writes it back. Review the diff before the PUT.

- [ ] Fetch + build the updated ruleset body (preserves name/target/enforcement/
      conditions/bypass, appends the new rule)

```bash
cd ~/projects/auto-rebaser
gh api repos/bradygrapentine/auto-rebaser/rulesets/16056686 \
  | jq '{name, target, enforcement, bypass_actors, conditions,
         rules: (.rules + [{
           type: "required_status_checks",
           parameters: {
             strict_required_status_checks_policy: false,
             do_not_enforce_on_create: false,
             required_status_checks: [
               {context: "test"},
               {context: "e2e"},
               {context: "npm audit (critical)"},
               {context: "Gitleaks secret scan"},
               {context: "Dependency review"}
             ]
           }
         }])}' > /tmp/ruleset-new.json
cat /tmp/ruleset-new.json | jq '.rules[].type'   # sanity: should list required_status_checks among them
```

- [ ] Apply it

```bash
gh api -X PUT repos/bradygrapentine/auto-rebaser/rulesets/16056686 \
  --input /tmp/ruleset-new.json | jq '.rules[] | select(.type=="required_status_checks")'
```

> Ask: "Apply OPS-1: fetch ruleset 16056686 on bradygrapentine/auto-rebaser, append a required_status_checks rule for contexts test, e2e, npm audit (critical), Gitleaks secret scan, Dependency review, OSV Scanner (strict policy false), preserving all existing rules/conditions/bypass, show me the resulting required_status_checks rule before and after the PUT."
>
> _(OPS-4, 2026-05-30: `OSV Scanner` is now included — it was excluded in the original OPS-1 prompt while the OSV time-box allowlist existed; OPS-2 cleared it.)_

> Watch: A malformed `PUT` can drop existing rules (it's full-replacement). The
> `jq` above re-selects `name/target/enforcement/bypass_actors/conditions/rules`
> so nothing is lost — but eyeball `/tmp/ruleset-new.json` before applying.

## 5. Verify (OPS-1 "Done when")

Prove the gate actually blocks a red PR.

- [ ] Create a throwaway branch with a deliberately failing unit test, push, open a PR

```bash
cd ~/projects/auto-rebaser
git checkout main && git pull --ff-only
git checkout -b chore/verify-required-checks
printf "\nimport { test, expect } from 'vitest';\ntest('OPS-1 gate probe — intentional fail', () => { expect(1).toBe(2); });\n" >> tests/core/actionable-pr.test.ts
git add tests/core/actionable-pr.test.ts
git commit -m "test: OPS-1 gate probe (intentional failure — do not merge)"
git push -u origin chore/verify-required-checks
gh pr create --fill --base main --title "DO NOT MERGE — OPS-1 gate probe"
```

- [ ] Wait for `test` to go red, then confirm the **Merge button is disabled**
      (PR page shows "Required statuses must pass" / `test` blocking)

```bash
gh pr checks chore/verify-required-checks
```

- [ ] Tear down the probe — close the PR, delete the branch (local + remote)

```bash
gh pr close chore/verify-required-checks --delete-branch
git checkout main
git branch -D chore/verify-required-checks 2>/dev/null || true
```

> Ask: "Create the OPS-1 verification PR on auto-rebaser exactly as in the runbook (throwaway branch with one intentionally-failing vitest), confirm via gh pr checks that the required `test` check fails and the merge is blocked, then close the PR and delete the branch (local + remote). Report whether the merge was blocked."

> Watch: Don't `gh pr merge --auto` the probe — if the gate is misconfigured it
> could merge the failing test to main. Just observe that merge is blocked, then
> close it.

## 6. Follow-ups

- **OPS-2 — ✅ DONE** (vite 5→6 + vitest 1→3 + esbuild/ws, #221/#223/#225) — cleared
  all dev-only OSV advisories; `osv-scanner.toml` now carries zero suppressions.
- **OPS-4 — ✅ DONE** (2026-05-30) — `OSV Scanner` added to this required-checks set
  now that OSV is honestly green. The set is now **six** checks. Verify:
  `gh api repos/bradygrapentine/auto-rebaser/rulesets/16056686 --jq '.rules[]|select(.type=="required_status_checks").parameters.required_status_checks[].context'`
- **PERF-1** — popup `POLL_NOW` re-poll loop for zero-PR accounts; unrelated dev
  work, tracked in BACKLOG §5.
- Optional: restrict the ruleset's `allowed_merge_methods` to `squash` only
  (currently allows merge/squash/rebase) to match the squash-merge convention.
