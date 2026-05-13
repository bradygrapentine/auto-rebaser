# Reviewer-flow smoke — single Cowork prompt

Companion to `v2-smoke-cowork-prompt.md` and `settings-smoke-cowork-prompt.md`. Covers the multi-party PR surface that's only testable now that both fixture accounts (`bradygrapentine` + `bgrapentine`) collaborate on `bradygrapentine/auto-rebaser-sandbox`.

Paste everything between the rule lines into Cowork.

---

You are validating the **auto-rebaser** browser extension's reviewer-side automations. The extension is loaded unpacked in Chrome (`~/projects/auto-rebaser/dist/`) and Firefox Developer Edition (`~/projects/auto-rebaser/dist-firefox/`). Both fixture accounts (`bradygrapentine` + `bgrapentine`) are already signed in via the v2 smoke prompt.

## Mission

Walk the reviewer flow end-to-end with both accounts in play. Verify reviewer-side popup state, the cross-account action-dot, push-since-approval, request-re-review, "auto-enable auto-merge after my approval if last required gate," and activity-log isolation. Report PASS/FAIL per section.

## Test fixtures

| Account | Owns | Collaborator on |
|---|---|---|
| `bradygrapentine` | `bradygrapentine/auto-rebaser-sandbox` | — |
| `bgrapentine` | `bgrapentine/test-repo` | `bradygrapentine/auto-rebaser-sandbox` |

For this smoke we need a **fresh PR on `bradygrapentine/auto-rebaser-sandbox` authored by `bgrapentine`**. §1 creates it.

## Reporting format

For each section, post:

```
### §<n> — <PASS|FAIL|PARTIAL>

- Bullet result with one-line evidence (or screenshot path)
- ...

Notes: <anything surprising>
```

End with the summary block at the bottom.

## Human-in-the-loop

GitHub auth, PR creation in the browser UI, and merge confirmation may need human action. State the request precisely and pause for "ready" before resuming.

---

## §1 — Setup: bgrapentine authors a PR on auto-rebaser-sandbox

**[HUMAN]** In a terminal, run:

```bash
cd /tmp
gh auth switch --user bgrapentine
git clone https://github.com/bradygrapentine/auto-rebaser-sandbox.git reviewer-smoke-$$
cd reviewer-smoke-$$
git checkout -b reviewer-smoke-bgrapentine
echo "// reviewer-flow smoke — $(date -u +%FT%TZ)" >> README.md
git add README.md
git commit -m "reviewer-flow smoke fixture (bgrapentine author)"
git push -u origin reviewer-smoke-bgrapentine
gh pr create --repo bradygrapentine/auto-rebaser-sandbox \
  --base main --head reviewer-smoke-bgrapentine \
  --title "[smoke] reviewer-flow fixture (authored by bgrapentine)" \
  --body "Cross-account reviewer-flow smoke fixture. Safe to close after smoke." \
  --reviewer bradygrapentine
gh auth switch --user bradygrapentine
```

Report:
- PR number (record as **PR_RS**).
- That `bradygrapentine` was added as a requested reviewer.

## §2 — bgrapentine sees PR_RS in their feed (author view)

- Switch the popup to `@bgrapentine`.
- Press `r` to force a poll.
- Confirm PR_RS appears under the `bradygrapentine/auto-rebaser-sandbox` repo group (collaborator-authored path). Capture screenshot.
- Switch to `@bradygrapentine` — confirm PR_RS does NOT appear in the **authored** PR list (bradygrapentine didn't author it).

## §3 — bradygrapentine sees PR_RS in the reviewer tab

- Active account: `@bradygrapentine`.
- Open settings → confirm `reviewer-tab-master` is ON (flip it if not, then revert to ON before exiting).
- Press `r` to poll.
- Confirm a "reviewer" / "review requests" surface appears in the popup with PR_RS listed. Capture screenshot.
- Verify the row shows author `@bgrapentine`, repo `bradygrapentine/auto-rebaser-sandbox`.

## §4 — Cross-account action-dot (regression cover for PR #118)

The dot should surface "another account has work for you" without forcing the user to switch.

- Active account: `@bgrapentine` (the author's account — NOT the reviewer).
- Open the AccountSwitcher dropdown. Confirm `@bradygrapentine`'s row shows the **action dot** indicating a pending review request lives over there. Capture screenshot.
- Switch to `@bradygrapentine` — dot should clear (or at least decrement) once the review-request surface is visible.
- Switch back to `@bgrapentine`. The dot should NOT reappear (the review request hasn't changed state).

## §5 — Request re-review

- Active account: `@bradygrapentine`. From the reviewer surface, find PR_RS.
- Trigger the **request re-review** action (button or shortcut). Confirm it fires without error and the activity log gains a `[bradygrapentine] re-request-review on PR_RS` entry.
- Wait ~10s, press `r`. Verify the action does NOT fire a second time (it's throttled per `rerequestedPRs`).

## §6 — bgrapentine pushes a new commit; push-since-approval flips

- Active account: `@bradygrapentine`. From the reviewer surface, **approve** PR_RS (click approve / use the GitHub UI as prompted).
- **[HUMAN]** In the terminal at the §1 worktree:

```bash
gh auth switch --user bgrapentine
git -C /tmp/reviewer-smoke-* checkout reviewer-smoke-bgrapentine
echo "// follow-up push — $(date -u +%FT%TZ)" >> README.md
git -C /tmp/reviewer-smoke-* add README.md
git -C /tmp/reviewer-smoke-* commit -m "reviewer-flow: follow-up push"
git -C /tmp/reviewer-smoke-* push
gh auth switch --user bradygrapentine
```

- Active account: `@bradygrapentine`. Press `r`. Confirm the push-since-approval indicator now renders on PR_RS in the reviewer surface (badge, chip, or dot — record what you see).

## §7 — "Auto-enable auto-merge after my approval if last required gate"

> The toggle copy was reworded in PR #125. The behavior under test: when `bradygrapentine`'s approval is the LAST required gate, the extension should arm `gh pr merge --auto --squash` on the PR.

- Active account: `@bradygrapentine`. Open settings → enable `enable-reviewer-auto-merge`.
- The PR_RS approval from §6 still stands; if the branch protection on `auto-rebaser-sandbox` requires only one approval, the toggle should have armed auto-merge.
- Inspect `gh pr view <PR_RS> --json autoMergeRequest --jq '.autoMergeRequest'` — confirm a non-null entry.
- If null: capture SW DevTools console for `[reviewer-auto-merge]` lines and report the no-op cause.
- Flip the toggle OFF before exiting settings.

## §8 — Activity log isolation across the flow

- Active account: `@bradygrapentine`. Open activity log.
  - `this account` filter: entries reference reviewing actions (approval, re-request) on `auto-rebaser-sandbox`. No `[bgrapentine]` tags.
  - `all accounts` filter: entries include `[bgrapentine]`-tagged events for the push.
- Active account: `@bgrapentine`. Open activity log.
  - `this account` filter: entries reference author-side events (commit pushed, review received). No `[bradygrapentine]` tags.

## §9 — Firefox parity

Repeat §2–§8 against Firefox Developer Edition. Report any divergence.

## §10 — Teardown

**[HUMAN]** From a terminal:

```bash
gh pr close PR_RS --repo bradygrapentine/auto-rebaser-sandbox --delete-branch || true
rm -rf /tmp/reviewer-smoke-*
```

## §11 — Verification summary

```
## Summary

Chrome:  <PASS|FAIL|PARTIAL>
Firefox: <PASS|FAIL|PARTIAL>

Reviewer tab surface:           <PASS|FAIL>
Cross-account action-dot:       <PASS|FAIL>
Request re-review (+throttle):  <PASS|FAIL>
Push-since-approval indicator:  <PASS|FAIL>
Auto-merge after approval:      <PASS|FAIL>
Activity log isolation:         <PASS|FAIL>

Regressions found: <count + brief>
Recommended next action: <merge / fix-then-retest / ship>
```

## Out of scope

- Merging real production code.
- Changing branch protection rules on `auto-rebaser-sandbox`.
- Modifying source.
- Pushing commits to extension repo branches.

Begin with §1.
