# v2 Firefox smoke checklist

Cross-browser parity is *assumed*, not verified, in this repo's CI — every E2E spec runs against Chromium only. Before tagging any v2.x release and before each AMO submission, run this checklist manually in Firefox to catch Firefox-specific divergence (MV3 polyfill quirks, `chrome.alarms` vs `browser.alarms`, identity flow, runtime-permission UI, etc.).

Time: ~10 minutes once you have a test account configured.

## 0. Build + load

```bash
npm run build:firefox
```

Confirm `dist-firefox/manifest.json` has `browser_specific_settings.gecko.id` and `version` matches `package.json`.

In Firefox (115+):

1. Open `about:debugging#/runtime/this-firefox`.
2. **Load Temporary Add-on…** → select `dist-firefox/manifest.json`.
3. Confirm Auto Rebaser appears with the icon. Note the **Internal UUID** — useful when grepping the service-worker console for storage operations.
4. Click **Inspect** to open the SW DevTools. Leave it open during the smoke run; it surfaces uncaught errors that the popup hides.

Temporary add-ons disappear on browser restart. To persist, use Developer Edition or Nightly with `xpinstall.signatures.required=false`, or install the AMO-signed build.

## 1. Auth + first sign-in

- [ ] Popup opens with no console errors
- [ ] **PAT path:** paste a `repo`-scope PAT → popup transitions to PR list within 5s
- [ ] **GitHub App path:** click "Sign in with GitHub" → identity flow completes, browser doesn't get stuck on the OAuth redirect, popup shows installations
- [ ] Footer shows `via @<login>` (PAT) or `via app · <count> installations` (App)
- [ ] Header chip shows `@<login>` (the v2 single-account indicator we just added)

**Firefox-specific watch:** Firefox's identity API behavior diverges from Chrome's — confirm the redirect lands in the same tab and the popup updates without a manual reopen.

## 2. Multi-account

- [ ] From the (single-account) header, open Settings → "Add account" → second PAT or App auth
- [ ] AccountSwitcher dropdown replaces the single `@<login>` chip
- [ ] Switching active account: popup PR list updates within 2s; badge re-counts; activity log filters to the new active account
- [ ] Sign-out-one-account leaves the other intact; sign-out-all returns to first-run state

**Firefox-specific watch:** confirm both accounts' `chrome.storage.local` rows persist across browser restart (close Firefox, reopen, popup should still show both accounts without re-auth — only relevant if you used the AMO build; temporary add-ons reset).

## 3. Poll cycle + state chips

- [ ] Open a feature branch in a test repo, push a commit so base/HEAD diverge → PR shows `[ behind ]` chip within one poll cycle (~5min default; force via Settings → "Poll now")
- [ ] After auto-rebase fires: chip flips to `[ updated ]`, badge increments by 1, activity log entry appears
- [ ] Failing required check → chip stays `[ pending ]` (not `[ updated ]`, the masking-bug regression)
- [ ] Conflict scenario (modify base + HEAD on the same line, force re-poll) → `[ conflict ]` chip + activity log entry

## 4. Settings split

- [ ] Open Settings. Confirm two sections: `global` (ignored repos, keyboard shortcuts, GHES host) and `this account (<login>)` (per-account toggles)
- [ ] Change a global setting → switch accounts → setting persists
- [ ] Change a per-account setting → switch accounts → it's reset to default on the other account
- [ ] Toggling **Auto-enable auto-merge** master toggle → "Skip repos" sub-input appears directly under it (no separate `mergeClean` toggle layer)

## 5. Repo filter chip (Story 2.5)

- [ ] In a popup with 5+ repos, click the `[ filter ▾ ]` chip in the header
- [ ] Multi-select 2 repos → PR list narrows to those repos only
- [ ] Clear filter → all repos restored
- [ ] Filter persists across popup close/reopen (per-account)

## 6. Reviewer tab (opt-in)

- [ ] Enable `enableReviewerTab` in settings → Reviewer tab appears below the migration banner (compact one-line variant)
- [ ] Have a teammate request your review on a PR (or assign to you) → it appears under Reviewer with one of the chips: `awaiting review` / `i approved` / `i requested changes` / `auto-merge armed`
- [ ] Push to a reviewed PR (resetting the approval) → chip on Authored tab flips to `! re-review`
- [ ] Toggle the actionable-mode sub-toggle → clicking the `! re-review` chip opens the confirm modal → re-request fires (verify on GitHub)

## 7. Push-since-approval

- [ ] PR with a stale approval (push after approve) → `! re-review` chip visible
- [ ] Disable `enablePushSinceApproval` → chip disappears

## 8. Desktop notifications

- [ ] Toggle `notificationsEnabled` ON → Firefox prompts for the runtime `notifications` permission → accept
- [ ] Force a rebase (or wait for one) → system notification fires (macOS Notification Center / equivalent)
- [ ] Toggle OFF → confirm no further notifications fire on next rebase

**Firefox-specific watch:** Firefox's notification permission prompt UI differs from Chrome's; confirm the request fires *once* (not on every poll).

## 9. Activity log

- [ ] Open the Activity log view
- [ ] Recent entries show `Nm ago` / `Nh ago` / `Nd ago` / short calendar date (not absolute `MM/DD/YYYY HH:MM:SS`)
- [ ] Filter dropdown narrows by action; sort order toggles; "this account / all accounts" filter works

## 10. Storage migration (only if testing over an existing v1 install)

- [ ] Install over a v1.0.2 build (or seed v1-shape `automation_settings` directly in storage)
- [ ] Confirm `_migration_backup_v1` key exists in storage after first poll
- [ ] All v1 settings preserved on the (now active) account

## 11. Build / package sanity

- [ ] `dist-firefox/manifest.json` does NOT contain `manifest.key` (the `npm run build:store` script strips it)
- [ ] No `console.error` in the SW DevTools during a full poll cycle
- [ ] `dist-firefox/` zip size < 500KB (anything larger means `node_modules` leaked in)

## Out of scope (run separately if relevant)

- AMO submission flow (covered in `docs/runbooks/v2-release-firefox.md`)
- Chrome parity (covered in `docs/runbooks/v2-release.md`)
- Long-running stability (poll cycle for >24h) — not part of pre-release smoke

## When to skip

If a change is genuinely Chromium-only (e.g. devtools-MCP integration, Chromium-specific manifest fields), this checklist isn't required. Anything touching the popup, service worker, storage, polling, or auth must run through it.
