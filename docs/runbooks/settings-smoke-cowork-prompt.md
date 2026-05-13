# Settings smoke — single Cowork prompt

Companion to `v2-smoke-cowork-prompt.md`. The v2 smoke proves sign-in + multi-account + cross-account isolation; this prompt proves every settings toggle and input actually does what the label says, end-to-end, under the same fixture accounts.

Paste everything between the rule lines into Cowork. The agent walks every setting, toggles it, verifies the observable behavior changes, toggles it back, and verifies it reverts.

---

You are validating the **auto-rebaser** browser extension's settings surface. The extension is loaded unpacked in Chrome from `~/projects/auto-rebaser/dist/` and Firefox Developer Edition from `~/projects/auto-rebaser/dist-firefox/`. Build is current with `main` (HEAD at start of run — record it).

## Mission

Walk every control in the Settings view, toggle each, verify the observable effect (in the popup PR list, the activity log, the notifications stream, or the storage layer as appropriate), then revert. Report a structured PASS/FAIL per setting. Capture screenshots and any SW DevTools console errors per section.

## Test fixtures (already set up — same as v2 smoke)

| Account | Owns | Collaborator on | Open PR |
|---|---|---|---|
| `bradygrapentine` | `bradygrapentine/auto-rebaser-sandbox` | — | [PR #5](https://github.com/bradygrapentine/auto-rebaser-sandbox/pull/5) |
| `bgrapentine` | `bgrapentine/test-repo` | `bradygrapentine/auto-rebaser-sandbox` | [PR #1](https://github.com/bgrapentine/test-repo/pull/1) |

Start signed in as `@bradygrapentine` with `@bgrapentine` already added as a second account (run the v2-smoke prompt first if not).

## Human-in-the-loop

Some toggles trigger a browser permission dialog (notifications scope) or open an external page (GitHub auth). When you hit one:

1. State exactly what the human must do.
2. Pause and wait for "ready" before continuing.
3. Resume from the next step.

Do NOT click through OS-level permission dialogs yourself.

## Reporting format

For each section, post:

```
### <section> — <PASS|FAIL|PARTIAL>

- <setting>: <one-line observable evidence or screenshot path>
- ...

Notes: <anything surprising>
```

End the run with the summary block at the bottom.

---

## §1 — Poll cadence

- Open the popup, press `s` to open settings.
- `github_poll_interval` dropdown: switch from the current value to each other option (`5 minutes`, `15 minutes`, `30 minutes`, `1 hour`).
- For the smallest interval, watch the SW DevTools console for ~1.5× the interval and confirm a `[poll-cycle]` log fires on schedule.
- Revert to the original interval.

> Note: Chrome may suspend SW between polls; the alarm should fire even when popup is closed.

## §2 — Account section (per-active-account)

Confirm with `@bradygrapentine` active:

- Header shows `account (bradygrapentine)`.
- `auth_method` displays `GitHub App` (or `PAT (legacy)` if that's the fixture).
- `switch to PAT (legacy)` / `switch to GitHub App` button is visible.
  - **DO NOT click this in the smoke run** — it signs the active account out. Just confirm it renders.
- `reset cached data` button:
  - Click it.
  - **[HUMAN]** Confirm the popup re-renders and shows fresh PR data after a brief loading state.
  - Verify activity log is empty for this account (the cached entries should be gone).
  - Verify auth is preserved (header chip still shows `@bradygrapentine`, no sign-in screen).
- Switch active account to `@bgrapentine` via the header chip.
- Re-open settings → confirm header now says `account (bgrapentine)`.
- Switch back to `@bradygrapentine` for the rest of the run.

## §3 — Enterprise section

- `github_host` input: type `github.acme.corp`, then clear it (don't apply — applying would sign the user out).
- Confirm `github_app_client_id` input is **disabled** when host is empty, **enabled** when host has content.
- Type an invalid host (`not a url`) and verify the alert/error renders.
- Clear both inputs.

## §4 — Merge method preference

- `merge-method-preference` radio group: switch between `merge`, `squash`, `rebase`.
- For each selection: in the popup PR list, find a PR with auto-merge available (PR #5 on `auto-rebaser-sandbox`). Hover its auto-merge button — confirm the tooltip / behavior reflects the selected method.
- Revert to the original choice.

> Note: Verifying the actual merge requires merging a real PR, which is out of scope for this smoke. The tooltip / UI affordance change is the observable signal.

## §5 — Ignored repos block (`ignored-repos-block`)

- `ignored-repos-master` toggle: flip OFF → confirm any "ignored" pill/badge disappears from PR rows; flip ON → confirm ignored repos return.
- Add a repo to the ignored list (use `bradygrapentine/auto-rebaser-sandbox`).
- Confirm PRs from that repo no longer appear in the active PR list.
- Remove the repo from the ignored list.
- Confirm PRs return.

## §6 — Stale block (`stale-block`)

- `stale-block` master toggle: flip OFF → confirm any "stale" badge disappears; flip ON → returns.
- Stale window dropdown: cycle through each option (e.g. `3 days`, `7 days`, `14 days`).
- Optional ping template input: type a custom template, save, re-open settings to confirm persistence, revert.

## §7 — Push-since-approval block (`push-since-approval-block`)

- `push-since-approval-master` toggle: flip OFF → confirm any "push since approval" indicator disappears in PR rows; flip ON → returns.
- `enable-request-rereview` sub-toggle: flip both states. Confirm visible UI affordance (button render / tooltip) on a relevant PR.

## §8 — Reviewer automations block (`reviewer-automations-block`)

- `reviewer-tab-master` toggle: flip ON → confirm a "reviewer" tab/section appears in the popup; flip OFF → it disappears.
- With master ON:
  - `enable-reviewer-auto-merge` sub-toggle: flip both states.
  - `reviewer-allowlist`: add a repo (`bradygrapentine/auto-rebaser-sandbox`), confirm it shows in the list, remove it.

## §9 — Notifications block (`notifications-block`)

- `notifications-master` toggle: flip ON.
  - **[HUMAN]** First time only: browser asks for notifications permission. Choose **Allow**. Confirm.
- With master ON, toggle each sub-setting and confirm it persists across a settings close-reopen:
  - `notify-rebased`
  - `notify-conflicted`
  - `notify-merged`
  - `notify-idle`
  - `notify-ping-confirmed`
- Trigger a poll (`r` from PR list) and watch for an OS notification if any of the conditions fired during the poll. (Optional — depends on fixture state.)
- Flip `notifications-master` OFF. Confirm sub-toggles become disabled / hidden.

## §10 — Keyboard shortcuts toggle (global)

> Note: This is a global toggle hoisted to GlobalSettings (per `multi-account.ts`). It applies to every account.

- `enable-keyboard-shortcuts` (or whatever the label is — find it in the settings tree): flip OFF.
- Press `?` / `r` / `s` / `Esc` from the PR list — none should fire.
- Flip back ON. All should fire again.

## §11 — Persistence sanity

After completing §1–§10, close the popup and reopen it. Open settings. Verify all toggles are in the state you last left them. Any drift = persistence bug.

Switch active account, open settings — verify per-account toggles reflect THIS account's values (not the previous account's).

## §12 — Firefox parity

Repeat the entire run against Firefox Developer Edition with the temporary add-on loaded from `dist-firefox/`. Note any divergence from Chrome behavior.

## §13 — Verification summary

Final report should answer:

1. Did every toggle do what its label promises? (count of working / total)
2. Did persistence hold across popup close/reopen and account switch? (Y/N)
3. Any SW DevTools console errors during the run? (paste excerpts)
4. Any divergence between Chrome and Firefox behavior? (list)
5. Any settings that ONLY toggle visually but don't actually change behavior? (list — these are the highest-priority bugs to surface)

```
## Summary

Chrome:  <PASS|FAIL|PARTIAL>  (X/Y toggles work)
Firefox: <PASS|FAIL|PARTIAL>  (X/Y toggles work)
Persistence: <PASS|FAIL>
Console errors: <count>
Divergence: <count>
Recommended next action: <ship / fix-then-retest / specific bug>
```

## Out of scope

- Actually applying the `enterprise` host (signs user out).
- Actually clicking `switch to <other method>` (signs user out).
- Merging real PRs.
- Modifying source code or pushing commits.
- Changes that require navigating to a third-party browser settings page beyond the notifications permission prompt.

Begin with §1. Pause at human-in-the-loop points.
