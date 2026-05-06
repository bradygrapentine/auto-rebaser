# Runbook — Store submission (v0.3.0)

_Goal: Auto Rebaser published on Chrome Web Store and addons.mozilla.org._

## Prerequisites — do not start without these

- [ ] All tests green: `npm run typecheck && npm test && npm run build && npm run build:firefox`. Latest baseline: 634/634.
- [ ] Versions match across `package.json`, `manifest.json`, `manifest.firefox.json`. Latest: `0.3.0`.
- [ ] Manual smoke test of v0.3.0 walked at least once — see `docs/runbooks/v0.3.0-smoke-test.md`.
- [ ] Privacy policy URL hosted publicly (see Step 0).
- [ ] Screenshots captured (see `docs/runbooks/icons-and-screenshots.md`).
- [ ] Listing copy below sanity-checked against the current UI.

## Step 0 — Host the privacy policy

Easiest: GitHub Pages on the public repo.

1. Push the repo to GitHub if not already. (Done — origin is `bradygrapentine/auto-rebaser`.)
2. Repo settings → Pages → Source = `main` branch, `/` (root) directory.
3. Wait ~1 minute. Verify https://bradygrapentine.github.io/auto-rebaser/PRIVACY renders the file.
4. That URL goes into both stores. Test it actually loads before submitting.

## Listing copy (v0.3.0 — refine before submission)

**Name:** Auto Rebaser

**Short description (≤132 chars):**
> Automatically rebases your open GitHub pull requests when they fall behind their base branch. Saves "Update branch" clicks all day.

**Long description (~400 words):**

> Auto Rebaser watches every pull request you've authored across every repo you can see, and automatically rebases each one when its base branch advances.
>
> ### Why
>
> If you work on a busy repo, you spend a lot of time clicking "Update branch" and waiting for CI to start. Auto Rebaser does it for you in the background, every few minutes, without taking over your browser tab.
>
> ### What it does
>
> - Polls GitHub at your chosen interval (1m / 5m / 15m / 30m / 1h / 2h / 4h) for your open authored PRs.
> - When a PR falls behind its base branch, calls GitHub's "update branch" endpoint to rebase it server-side. No local git operations; no force-push risk.
> - Optional automations (all opt-in or with per-repo opt-out): auto-enable auto-merge with smart method selection, auto-resolve outdated review threads, auto-delete merged head branches, dismiss stale PR notifications.
> - Stale-PR badge with optional one-click reviewer ping.
> - Persistent activity log of every automated action (capped at 200 entries / 30 days, never sent off-device).
> - Keyboard shortcuts for power users: `r` poll · `s` settings · `j`/`k` navigate · `Enter` open · `?` help.
> - GitHub Enterprise Server support via a per-host setting.
>
> ### Authentication
>
> Sign in with the **Auto Rebaser GitHub App** (recommended) or with a Personal Access Token. The GitHub App path uses OAuth Device Flow — no token to paste — and works at companies that block Personal Access Tokens.
>
> ### What it does NOT do
>
> - No telemetry. No analytics. No data sent anywhere except GitHub.
> - No backend server. Everything runs locally in your browser.
> - No content scripts. The extension never reads page content from github.com or any other site.
> - No force-push. The rebase is performed server-side by GitHub via the official "update branch" API.
>
> ### Open source
>
> Source: https://github.com/bradygrapentine/auto-rebaser
> Privacy policy: https://bradygrapentine.github.io/auto-rebaser/PRIVACY

**Category:** Productivity / Developer Tools.

**Support email:** grapentineb@gmail.com

**Support website:** https://github.com/bradygrapentine/auto-rebaser

## A. Chrome Web Store

### A.1 Developer account

1. Go to https://chrome.google.com/webstore/devconsole/.
2. Pay the one-time $5 registration fee. Accept the developer agreement.
3. Verify the contact email.

### A.2 Package the extension

```bash
npm run build
cd dist && zip -r ../auto-rebaser-chrome-0.3.0.zip . && cd ..
```

Verify the zip's `manifest.json` is at the top level (not nested under `dist/`).

### A.3 Upload

1. Console → **New item** → upload the zip.
2. **Listing** tab:
   - Name, short description, long description, category, language.
   - Upload `icons/icon128.png` as the store icon.
   - Upload all `marketing/chrome/screenshot-*.png` (need at least one; 1280×800 or 640×400).
   - Optional: small promo tile, marquee.
3. **Privacy** tab:
   - **Single purpose:** "Automate keeping your GitHub PRs up to date with their base branches."
   - **Permission justifications**:
     - `storage` — "Store the user's GitHub credentials (encrypted by the browser), the list of open PRs, settings, and an activity log of automated actions. All data is local; nothing is sent off-device."
     - `alarms` — "Schedule the periodic poll of the GitHub API at the user's configured interval."
     - `identity` — "Reserved for browser-level identity APIs (e.g. `chrome.identity.getProfileUserInfo`). Currently declared but not invoked at runtime; intended for a future passive 'are you signed into Chrome' check. Will be removed in a follow-up release if it stays unused."
     - **Host permission `https://api.github.com/*`** — "Required to call the GitHub REST API for listing PRs, fetching PR details, triggering rebases, and other automation actions."
     - **Host permission `https://github.com/*`** — "Required to complete the OAuth Device Flow against `github.com/login/device/code` and `/login/oauth/access_token`."
     - **Optional host permissions `https://*/*`** — "Requested at runtime only when the user configures a GitHub Enterprise Server host in settings. The browser prompts the user before any request is made to that host. Default install never invokes this."
   - **Data handling**: declare you handle authentication info; not sold; not shared.
   - **Privacy policy URL**: the GitHub Pages URL from Step 0.
4. **Distribution**: public; all regions; no paid features.
5. Click **Submit for review**.

### A.4 Wait

Reviews typically take 1–3 business days. Watch the dashboard for "In review" → "Published" or "Rejected".

If rejected: the email tells you which policy was triggered. The most likely flags for this build are around **`identity` permission** (consider removing if you don't end up needing it) and **broad `optional_host_permissions`** — both have justifications above; have those ready when responding.

## B. addons.mozilla.org (AMO)

### B.1 Developer account

1. Go to https://addons.mozilla.org/developers/.
2. Sign in with a Firefox account (free).
3. Accept the developer agreement.

### B.2 Package the extension

```bash
npm run build:firefox
cd dist-firefox && zip -r ../auto-rebaser-firefox-0.3.0.zip . && cd ..
```

### B.3 Package the source

AMO requires source if your code is bundled (it is). Produce a separate source zip:

```bash
git archive --format=zip --output=auto-rebaser-source-0.3.0.zip HEAD
```

In the listing's "build instructions" field:

```
1. Install Node 20 or later.
2. npm install
3. npm run build:firefox
Output: dist-firefox/ — bundle matches the uploaded extension zip.
```

### B.4 Upload

1. Developer hub → **Submit a new add-on** → "On this site".
2. Upload `auto-rebaser-firefox-0.3.0.zip`. AMO validates in seconds.
3. If validation fails, read the error and fix. Most common: missing `gecko.id`, `service_worker` instead of `scripts` in `background`, or undeclared optional permissions.
4. Upload the source zip when prompted.
5. Listing tab: name, summary, description, category, support email, privacy policy URL, license (`MIT` or whatever's in `LICENSE` — verify before submitting).
6. Add screenshots from `marketing/firefox/`.
7. Submit.

### B.5 Wait

Auto-review for non-content-script extensions usually completes within a few hours. A human reviewer may follow up with questions.

## C. Post-publish

1. Capture the public install URLs from each store.
2. Add them to `docs/LAUNCH_PLAN.md` under "Launch history".
3. Add install badges to `README.md`.
4. Tag if not already: `git tag v0.3.0` (already done).
5. Announce on whatever channel makes sense.

## Red flags

- **`identity` permission with no runtime use**: web-store reviewers consistently flag overclaimed permissions. Either remove it from `manifest.json` before submission OR justify it the same way both times. Pre-decide.
- "I'll skip the source zip on AMO; it's open source on GitHub anyway." AMO's policy is explicit — you must submit source matching the upload. Reject without it.
- "I'll set the privacy URL to the GitHub raw `PRIVACY.md` URL." Works, but AMO sometimes prefers a stable rendered URL — Pages is safer.
- "Ship without screenshots." Both stores require at least one.
- Submitting without local-green tests + smoke-test runs. The forty-minute fix you skip becomes a one-week store-review cycle.
- **Optional host permissions `https://*/*`**: very broad, will draw scrutiny. Have the GHES justification ready. If you don't expect users to need GHES soon, consider dropping `optional_host_permissions` and shipping a follow-up release that adds it back when an actual GHES user appears.
