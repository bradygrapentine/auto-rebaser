# v2 Screenshots Checklist

Operator-driven hand-off. Each row below is one screenshot to capture for the v2 Chrome Web Store + AMO listing update. Total time: ~30 minutes once both fixture accounts are signed in.

For dimensions, file paths, and naming convention see `docs/runbooks/icons-and-screenshots.md`. This file is the v2-specific *what to shoot*; that one is the *how to file it*.

## Setup

- Load `dist/` as an unpacked extension in Chrome (see `docs/runbooks/v2-smoke.md` §3 for pre-reqs).
- Sign in with both fixture accounts (`bradygrapentine` + `bgrapentine`) so the account switcher and multi-account scenarios are reproducible.
- Resize the popup window to ~400×600 for consistent framing. The capture canvas (Chrome Web Store wants 1280×800) leaves margin around the popup for context.
- Use a clean browser profile or hide unrelated tabs in the background. If a github.com tab is visible as backdrop, pick a public-facing repo (the public `bradygrapentine/auto-rebaser` repo works) — never anything with private code or PII visible.

## Shot list

Each shot replaces or augments the v1 marketing screenshots in `marketing/chrome/` and `marketing/firefox/`.

| # | Filename suggestion | What's in frame | Why it's in the v2 listing |
|---|---|---|---|
| 1 | `screenshot-01-multi-account-switcher.png` | Popup open, account switcher dropdown expanded, both `@bradygrapentine` and `@bgrapentine` visible, **+ Add account** row at bottom | Multi-account is the headline v2 feature |
| 2 | `screenshot-02-pr-list-with-state-chips.png` | Popup PR list with 3–5 PRs grouped by repo, mix of `[updated]`, `[behind]`, `[pending]` state chips; one row with `idle Nd` pill | Core v1 surface still present + the state-machine fix from #103 visible |
| 3 | `screenshot-03-reviewer-tab.png` | Reviewer tab selected (the tab bar at the top of the PR list), 2–3 rows showing the four chip variants: `awaiting review`, `I approved`, `changes requested`, `auto-merge armed` | Reviewer dashboard is the second headline v2 feature |
| 4 | `screenshot-04-push-since-approval.png` | PR row with an `! re-review` chip rendered (need a PR you've approved that then got new commits) — alternatively reviewer-tab variant with `↻ pushed since approval` chip | Push-since-approval — one of the most-requested v2 additions |
| 5 | `screenshot-05-settings-split.png` | Settings page scrolled to show the `global` section header AND the `this account (<login>)` section header in the same frame | Settings split — explains why per-account settings don't fight global ones |
| 6 | `screenshot-06-activity-log-with-filter.png` | Activity log open, filter chip set to `all accounts`, entries from both accounts visible with `[<login>]` tag — should include a mix of `rebased`, `auto-merge-armed`, `reviewer-pinged`, `rerequest-review` actions | Audit trail surface; reinforces "every action is logged" |

## Optional extras (use only if you have remaining screenshot slots)

| # | Filename suggestion | What's in frame |
|---|---|---|
| 7 | `screenshot-07-repo-filter-chip.png` | Popup with the header `[ filter ▾ ]` chip expanded showing a multi-select repo picker |
| 8 | `screenshot-08-notifications-settings.png` | Settings page scrolled to the notifications section, master toggle ON, per-event sub-toggles visible |
| 9 | `screenshot-09-ping-confirm.png` | The ping reviewers confirm view (pre-POST) showing the rendered comment template with `@alice @bob` mentions |

## Capture procedure (Chrome)

1. Open the popup in the size you want.
2. Open Chrome DevTools (right-click → Inspect) — DevTools opens, but more importantly the popup stays open while DevTools is focused (otherwise it closes on focus-loss).
3. Use macOS `Shift+Cmd+4` then space → click the popup window → save as `screenshot-NN-<slug>.png`.
4. Drop into a 1280×800 canvas (Preview, Photopea, or `sips` from CLI) on a neutral background (`#0d1117` matches GitHub dark, `#ffffff` matches GitHub light) with the popup centered or offset to give the eye a focal point.

## Capture procedure (Firefox)

Mostly identical — same dimensions, same shots. Only difference: the popup opens slightly differently (Firefox doesn't have the Chrome popup-chrome rounding). The Firefox AMO listing can reuse Chrome screenshots if the rendering is visually identical; only re-shoot if there's an actual visual difference worth flagging.

## After capture

- Move final 1280×800 PNGs into `marketing/chrome/` and `marketing/firefox/`.
- Run `optipng -o5 marketing/chrome/*.png marketing/firefox/*.png` (or equivalent) to keep listing weight down.
- Update `docs/runbooks/icons-and-screenshots.md` if the filename convention drifted.
- Tick the "Screenshots refreshed" gate in `docs/runbooks/v2-release.md`'s pre-release verification.

## Don't shoot

- Anything showing private repo names, PR titles with internal content, or coworkers' avatars / usernames.
- Anything showing a real PAT or OAuth token in the popup (the auth screens are fine, but they shouldn't display the token value).
- The error toast / `[error]` state for an account — could mislead store reviewers into thinking the extension is broken on install.
