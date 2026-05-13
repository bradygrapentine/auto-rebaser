# v2 smoke — single Cowork prompt

Paste everything between the rule lines below into Cowork. The agent will walk the entire smoke pass end-to-end and report results.

---

You are validating the **auto-rebaser** browser extension. It's a local-first popup that polls a user's authored GitHub PRs and auto-rebases the ones marked `behind`. The extension is already unpacked and loaded in both Chrome (from `~/projects/auto-rebaser/dist/`) and Firefox Developer Edition (from `~/projects/auto-rebaser/dist-firefox/`). Build is current with `main` (HEAD `5b70975`).

## Mission

Run the v2 smoke validation against both browsers and report a structured pass/fail per section. The full markdown checklist lives at `~/projects/auto-rebaser/docs/runbooks/v2-smoke.md` — open it for reference, but you do NOT need to check off boxes there; you'll report inline.

## Test fixtures (already set up)

| Account | Owns | Collaborator on | Open PR |
|---|---|---|---|
| `bradygrapentine` | `bradygrapentine/auto-rebaser-sandbox` | — | https://github.com/bradygrapentine/auto-rebaser-sandbox/pull/5 |
| `bgrapentine` | `bgrapentine/test-repo` | `bradygrapentine/auto-rebaser-sandbox` | https://github.com/bgrapentine/test-repo/pull/1 |

Expected scope:
- Signed in as `@bradygrapentine` → sees PR #5 on `auto-rebaser-sandbox`. Does **NOT** see anything on `bgrapentine/test-repo` (no access).
- Signed in as `@bgrapentine` → sees PR #1 on `test-repo`. Sees `auto-rebaser-sandbox` only if they authored a PR there (they did not, in the current fixture state).

## Human-in-the-loop

The GitHub OAuth device flow requires the human to authorize each install in their browser. When you reach a step that needs human action:

1. State exactly what the human must do (which account to authorize, what URL is open).
2. Pause and wait for confirmation before continuing.
3. Resume from the next step after the human reports the action complete.

Do NOT try to complete the GitHub OAuth flow yourself.

## What to validate (per section)

For each section, capture **(a) screenshot of the popup**, **(b) any SW DevTools console errors**, **(c) pass/fail per bullet**. Report inline as you go; summary at the end.

### §3 Chrome — sign-in layout (acceptance for PRs #156 / #158 / #159)

Open the Chrome popup on a fresh signed-out state (if signed-in, sign out first via Settings → "Sign out all"). Confirm:

- Sign-in choice view: title (`$ auto-rebaser --auth`) + lede (`Keep your GitHub PRs up to date automatically`) + two buttons (`sign in with GitHub App (recommended)`, `use a personal access token (legacy)`) are **vertically centered** in the popup window (not glued to the top).
- Side margins comfortable (~30px from popup edge to button edge).
- Buttons are **narrower than the popup width** — max-width ~340px, NOT stretched edge-to-edge.
- Vertical rhythm: title→lede ~6px, lede→first-button ~28px, button→button ~14px.

Then walk the GitHub App device flow:

- Click `sign in with GitHub App (recommended)`. Popup shows a device code and an `open verification page` button.
- Device-flow view content is centered the same way (code + buttons + help text).
- **[HUMAN]** Sign in as `bradygrapentine`, paste the code at https://github.com/login/device, authorize the install on `auto-rebaser-sandbox`. Wait for the popup to transition to the PR list.
- Header chip now shows `@bradygrapentine`; footer shows installation count.

### §4 Chrome — PR list + shortcuts

- PR list shows the `bradygrapentine/auto-rebaser-sandbox` repo group, with PR #5 ("Smoke-test fixture PR (bradygrapentine)") visible.
- `bgrapentine/test-repo` does NOT appear (correct — no access).
- Press `?` → Shortcuts page opens. Rows are comfortably spaced (10px gap, 6px row padding), 7 rows total, content centered below the header. No jammed-together rows. No big empty band below the last row.
- Press `Esc` → returns to PR list.
- Press `r` → poll fires. Activity log entry appears.
- If PR #5 is `behind` main, expect a rebase activity entry; otherwise the PR stays `[current]` or `[clean]`.
- Press `s` → settings opens. Press `Esc` → returns.

### §5 Chrome — multi-account isolation (regression cover for #148-#150 + #152-#154)

This is the most important section. Both accounts have **disjoint repo access**, which makes any cross-account leak obvious.

1. From the PR list, click the `@bradygrapentine` header chip → `+ Add account`.
2. **[HUMAN]** Authorize as `bgrapentine` via device flow.
3. Confirm `@bradygrapentine` is NOT logged out by the second sign-in (regression check).
4. Switcher dropdown lists both accounts.

**Per-account scope sanity:**

- Switch to `@bgrapentine` → PR list re-renders within ~2s, shows `bgrapentine/test-repo` with PR #1 visible, does NOT show `auto-rebaser-sandbox`.
- Switch back to `@bradygrapentine` → PR list re-renders to `auto-rebaser-sandbox` only, `test-repo` is gone.

**Cross-account isolation under repeated polling (the #149 regression target):**

- Under `@bradygrapentine`, press `r` 3 times (wait ~3s between polls for the cycle to complete).
- Switch to `@bgrapentine`. Press `r` 3 times.
- Switch back to `@bradygrapentine`. Press `r` 1 time.
- **Acceptance:** at no point does `bradygrapentine`'s view ever show `bgrapentine/test-repo`; at no point does `bgrapentine`'s view show a PR `bradygrapentine` authored.

**Activity log isolation:**

- Activity log under `@bradygrapentine` (filter chip = `this account`) shows only entries for `auto-rebaser-sandbox`.
- Toggle filter to `all accounts` → entries from `test-repo` appear, tagged `[bgrapentine]`.
- Switch to `@bgrapentine`; activity log `this account` shows only `test-repo` entries.

### §6 Firefox parity

Repeat §3, §4, §5 against Firefox Developer Edition with the temporary add-on already loaded from `dist-firefox/`. Confirm:

- Same sign-in layout (centered, narrower buttons, comfortable margins).
- Same shortcuts page spacing.
- Same per-account scope behavior.
- Same cross-account isolation under the 3-3-1 poll sequence.
- OAuth redirect lands in the same tab; popup updates without manual reopen.
- Watch the SW DevTools console for any `[poll-cycle]` errors during the polls.

### §7 Verification summary

Final report should answer:

1. Did sign-in layout look polished in both browsers? (Y/N + screenshot)
2. Did shortcuts page have correct spacing? (Y/N + screenshot)
3. Did the cross-account isolation hold across all polls? (Y/N + counts)
4. Any `[poll-cycle]` warnings in either SW console? (paste excerpts)
5. Any divergence between Chrome and Firefox behavior? (list)

## Reporting format

For each section, post:

```
### §<n> <browser> — <PASS|FAIL|PARTIAL>

- Bullet result with one-line evidence (or screenshot path)
- ...

Notes: <anything surprising>
```

End the run with:

```
## Summary

Chrome: <PASS|FAIL|PARTIAL>
Firefox: <PASS|FAIL|PARTIAL>
Regressions found: <count + brief>
Recommended next action: <merge / fix-then-retest / ship>
```

## Out of scope

- Don't try to merge the bumper PR #6 on `auto-rebaser-sandbox` (it's blocked by branch protection on purpose; only the human can clear it).
- Don't write new tests or modify source.
- Don't push commits to any branch.
- Don't run the local Vitest suite — that already passed (952/952) on the build you're about to test.

Begin with §3 in Chrome. Pause for human OAuth as needed.
