# v2 Smoke Test — Chrome + Firefox

End-to-end manual validation before every v2.x release: builds, loads, signs in, polls, rebases, and walks the popup-polish acceptance from PRs #156 / #157 / #158. Cross-browser parity is *assumed* not verified in CI (E2E is Chromium-only), so this checklist exists to catch divergence (MV3 polyfill quirks, identity flow, `browser.alarms`, runtime-permission UI).

Time budget: ~15 minutes once you have a test account configured.

## 1. Prerequisites

- [ ] Repo at `~/projects/auto-rebaser`, main current, working tree clean

```bash
git status -s && git log --oneline -3
```

> Ask: "in ~/projects/auto-rebaser, run `git fetch origin && git status -s && git log --oneline -3` and confirm main is at origin/main and working tree is clean"

- [ ] Node + npm available; `node --version` ≥ 20
- [ ] Firefox 115+ installed; Chrome stable installed

**Test fixtures (this repo's standing setup):**

| Account | Owns | Collaborator on |
|---|---|---|
| `bradygrapentine` | [`bradygrapentine/auto-rebaser-sandbox`](https://github.com/bradygrapentine/auto-rebaser-sandbox) | — |
| `bgrapentine` | [`bgrapentine/test-repo`](https://github.com/bgrapentine/test-repo) | `bradygrapentine/auto-rebaser-sandbox` |

Expected scope under each account:

- **Signed in as `bradygrapentine`:** sees PRs they author in `bradygrapentine/auto-rebaser-sandbox`. Does **not** see anything in `bgrapentine/test-repo` (no access).
- **Signed in as `bgrapentine`:** sees PRs they author in `bgrapentine/test-repo` (their own repo) and any they author in `bradygrapentine/auto-rebaser-sandbox` (via collaborator access).

- [ ] At least one open PR on `auto-rebaser-sandbox` authored by `bradygrapentine` (ideally one `behind` main so rebase auto-fires)
- [ ] At least one open PR on `test-repo` authored by `bgrapentine`
- [ ] Optional: one PR on `auto-rebaser-sandbox` authored by `bgrapentine` (collaborator path — proves the same PR can appear under `bgrapentine`'s feed but NOT under `bradygrapentine`'s since `bradygrapentine` isn't the author)

> Tip: If any of the above PRs are missing, create lightweight ones now — a single-file edit on a new branch is enough. The cross-account isolation test in §5 depends on having at least one PR scoped to each account.

> Note: The v2 popup polish (PRs #156-#158) is **CSS-only** — if local tests pass and both builds succeed you're 99% of the way to a clean smoke. Use this checklist to catch the last 1% (Chrome popup window sizing quirks, Firefox runtime divergence).

## 2. Build + repack

- [ ] Local test suite green

```bash
npm run typecheck && npm test
```

> Ask: "in ~/projects/auto-rebaser, run `npm run typecheck && npm test` and report any failures; expect 952/952 passing with 2 pre-existing unhandled-rejection warnings"

- [ ] Both targets build

```bash
npm run build:all
```

- [ ] Fresh zips for the unpacked-load step below

```bash
cd dist && zip -rq ../auto-rebaser-chrome.zip . && cd ../dist-firefox && zip -rq ../auto-rebaser-firefox.zip . && cd ..
ls -lh auto-rebaser-{chrome,firefox}.zip
```

> Ask: "in ~/projects/auto-rebaser run `npm run build:all`, then rezip dist/ → auto-rebaser-chrome.zip and dist-firefox/ → auto-rebaser-firefox.zip, and report the resulting file sizes"

- [ ] `dist-firefox/manifest.json` carries `browser_specific_settings.gecko.id` and the `version` matches `package.json`

## 3. Chrome — load + sign in

- [ ] Open `chrome://extensions/`, enable **Developer mode**, click **Load unpacked**, select `dist/`
- [ ] Pin the extension to the toolbar
- [ ] Open the popup — no console errors in the SW console ([chrome://serviceworker-internals/](chrome://serviceworker-internals/) or the extension's "service worker" inspect link)

**Sign-in layout acceptance (post #156 / #158):**

- [ ] **Sign-in choice view** title + lede + two buttons are **vertically centered** in the popup (not glued to the top)
- [ ] Side margins are comfortable (~30px from popup edge to button edge); buttons are **narrower than the popup width** (capped ~340px) — not stretching edge-to-edge
- [ ] Vertical spacing between title / lede / buttons looks roomy (28px lede→button gap, 14px button→button gap)
- [ ] **Sign in with GitHub App (recommended)** path: device-flow code appears centered with the same column treatment; clicking **open verification page** opens github.com/login/device in a new tab

> Watch: Chrome popup window can stay at the previously-rendered size when navigating between routes mid-session — that's expected. The centering exists to make that case look correct, not to shrink the popup.

- [ ] Sign in as **`bradygrapentine`** — authorize the GitHub App install on `auto-rebaser-sandbox`; popup transitions to the PR list within ~10s
- [ ] Header chip shows `@bradygrapentine`; footer reports installation count = 1 (or whatever's actually installed on the account)

> Cowork: "in the open Chrome popup at chrome-extension://<id>/popup.html, sign in as bradygrapentine via the GitHub App device flow — paste the code at github.com/login/device, authorize the install on auto-rebaser-sandbox, and confirm the popup transitions to the PR list within 10 seconds without manual reload. Capture a screenshot of each state."

## 4. Chrome — PR list + automations

- [ ] PR list renders the **`bradygrapentine/auto-rebaser-sandbox`** repo group, expanded by default if there's an attention-worthy PR (`behind`, `dirty`, etc.)
- [ ] `bgrapentine/test-repo` does **NOT** appear (correct — `bradygrapentine` has no access)
- [ ] **Shortcuts page** (`?`): rows are comfortably spaced (10px gap, 6px row padding), content centered below the header — no jammed-together rows, no big empty band at the bottom
- [ ] Press `r` → poll fires; activity log records a new entry per PR action (rebased / merged / skipped / etc.)
- [ ] If a PR on `auto-rebaser-sandbox` is `behind`: poll → confirm `[behind]` chip flips to `[updated]` (or `[pending]` if required checks are red, per STATE-2)
- [ ] Press `s` → settings opens; press `Esc` → returns to list

```bash
# Inspect the SW poll cycle log if anything looks off
```

> Ask: "open the auto-rebaser SW DevTools console in Chrome and report any `[poll-cycle]` warnings from the last 60 seconds"

## 5. Chrome — multi-account (cross-account isolation)

This is the regression-cover section for #148-#150 (multi-account stability) and #152-#154 (OOP-MSA AccountScope refactor). The two accounts have **disjoint repo access**, which makes leaks immediately obvious.

- [ ] AccountSwitcher header chip currently shows `@bradygrapentine`
- [ ] Click chip → **+ Add account** → sign in as **`bgrapentine`** via device flow
- [ ] First account is **NOT** logged out (regression check for #147 / #150 closure)
- [ ] Switcher dropdown now lists both: `@bradygrapentine` and `@bgrapentine`

**Per-account scope sanity:**

- [ ] Switch to `@bgrapentine` → PR list re-renders within 2s; activity log filter chip resets to `this account`
- [ ] Under `@bgrapentine` the list shows `bgrapentine/test-repo` and (if you created the optional collaborator-authored PR) `bradygrapentine/auto-rebaser-sandbox` for PRs `bgrapentine` authored there
- [ ] Switch back to `@bradygrapentine` → list re-renders to `bradygrapentine/auto-rebaser-sandbox` only; `bgrapentine/test-repo` is **not visible**

**Cross-account isolation under repeated polling (the #149 regression target):**

- [ ] Press `r` to force-poll under `@bradygrapentine`. Repeat 3 times.
- [ ] Switch to `@bgrapentine`. Press `r` 3 times.
- [ ] Switch back to `@bradygrapentine`. Press `r` 1 time.
- [ ] **Acceptance:** `bradygrapentine`'s view never shows `bgrapentine/test-repo`; `bgrapentine`'s view never shows a PR `bradygrapentine` authored on the sandbox repo (even though both accounts can technically see the sandbox repo, the polling scope is "authored by me", so authorship-by-the-other-account must not leak across the switch).

> Watch: A leak surfaces as a PR appearing under the wrong account's repo group after switching back+polling. If you see one, capture the SW DevTools console for `[poll-cycle]` lines from both polls — that timing trace shows whether the accountId got crossed mid-cycle. PRs #148-#150 + #152-#154 closed every known path here, so any leak is genuinely new.

**Activity log isolation:**

- [ ] In the activity log under `@bradygrapentine`, the `this account` filter shows only rebases / actions on `auto-rebaser-sandbox`
- [ ] Toggle to `all accounts` → entries from `bgrapentine/test-repo` rebases appear, tagged `[bgrapentine]`
- [ ] Switch to `@bgrapentine`; activity log under `this account` shows only `test-repo` entries

## 6. Firefox — load + parity

- [ ] Open `about:debugging#/runtime/this-firefox`
- [ ] **Load Temporary Add-on…** → select `dist-firefox/manifest.json`
- [ ] Note the **Internal UUID** (useful for grep)
- [ ] Click **Inspect** to open SW DevTools; leave it open

> Tip: Temporary add-ons disappear on browser restart. To persist across reloads use Developer Edition / Nightly with `xpinstall.signatures.required=false`, or install the AMO-signed build.

- [ ] Re-run **Section 3** (sign-in layout + auth) — popup should look identical to Chrome
- [ ] Re-run **Section 4** (PR list + shortcuts + poll) — confirm same state transitions

**Firefox-specific:**

- [ ] OAuth redirect lands in the same tab; popup updates without manual reopen
- [ ] `browser.alarms` fires the poll on schedule (watch SW console for the periodic `[poll-cycle]` log)
- [ ] If using GitHub App auth: installation list renders correctly; `Request access` opens the right install URL

> Cowork: "in Firefox with the auto-rebaser temporary add-on loaded, walk through the full sign-in → multi-account add → cross-account poll flow. Capture screenshots of each step and report any console errors. Watch for any divergence from the Chrome behavior captured earlier."

## 7. Verification

- [ ] Both browsers reach a populated PR list from a clean sign-in within 30s
- [ ] No `[poll-cycle]` errors in either SW console during a manual poll
- [ ] Sign-in / shortcuts views look polished in both browsers (centered, comfortable spacing, no edge-to-edge buttons)
- [ ] Multi-account isolation holds across at least 5 alternating polls
- [ ] Activity log entries land under the correct account namespace (filter chip toggles `this account` ↔ `all accounts`)

> Watch: The most common smoke-blocker right now is a **stale unpacked load** — Chrome / Firefox can cache the previous build even after you click "Reload". If anything looks off, remove the extension entirely and re-add it from the fresh zip before assuming there's a real bug.

## 8. Sign-off

- [ ] Smoke passed in Chrome
- [ ] Smoke passed in Firefox
- [ ] Tagged build is ready for store submission (or AMO upload)

> Ask: "in ~/projects/auto-rebaser, print the current `package.json` version and the SHA of HEAD on main, so I can record what was smoke-tested"
