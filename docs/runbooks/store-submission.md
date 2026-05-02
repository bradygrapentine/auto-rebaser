# Runbook — Store submission

_Goal: Auto Rebaser published on Chrome Web Store and addons.mozilla.org._

## Prerequisites — do not start without these

- [ ] Track 1 (styling) complete: 423/423 tests, both builds clean.
- [ ] Track 2 (icons) complete: real `icons/icon{16,48,128}.png`; `marketing/` populated.
- [ ] Track 4 smoke tests done: dated rows in `phase2-validation.md` for both browsers against the same SHA.
- [ ] `PRIVACY.md` `<REPO_URL>` placeholder replaced.
- [ ] Privacy policy hosted at a public URL (set up via GitHub Pages — see step 0 below).
- [ ] Listing copy drafted (see "Listing copy" section below).
- [ ] Version in `manifest.json`, `manifest.firefox.json`, `package.json` all match.

## Step 0 — Host the privacy policy

Easiest: GitHub Pages on the public repo.

1. Push the repo to GitHub if not already.
2. Repo settings → Pages → enable, source = `main` branch, `/` (root) directory.
3. Wait ~1 minute. Verify https://<username>.github.io/auto-rebaser/PRIVACY renders the doc.
4. That URL is what you paste into both stores.

## Listing copy (drafts — refine before submission)

**Name:** Auto Rebaser

**Short description (≤132 chars):**
> Automatically rebases your open GitHub pull requests when they fall behind their base branch. Saves you from "Update branch" clicks all day.

**Long description (≤16,000 chars; aim for ~400 words):**

> Auto Rebaser watches every pull request you've authored across every repo you can see, and automatically rebases each one when its base branch advances.
>
> ### Why
>
> If you work on a busy repo, you spend a lot of time clicking "Update branch" and waiting for CI. Auto Rebaser does it for you in the background.
>
> ### What it does
>
> - Polls GitHub every 1/5/15/30 minutes (configurable) for your open PRs.
> - When a PR falls behind its base, calls GitHub's "update branch" API to rebase it.
> - Optionally: auto-merges PRs that have passing checks and approvals; resolves review threads; deletes head branches after merge; dismisses stale notifications.
> - Per-repo opt-out for cases you want to handle by hand.
>
> ### What it does not do
>
> - No telemetry. No analytics. No data sent anywhere except GitHub.
> - No backend server. Everything runs in your browser.
> - No content scripts. The extension never reads page content from any site.
>
> ### Authentication
>
> A GitHub Personal Access Token (classic, scope `repo`) is stored in browser sync storage. You can revoke it at any time at github.com/settings/tokens.
>
> ### Open source
>
> Source: <REPO_URL>
> Privacy policy: <PRIVACY_URL>

**Category:** Productivity / Developer Tools.

**Support email:** grapentineb@gmail.com

**Support website:** repo URL.

## A. Chrome Web Store

### A.1 Developer account

1. Go to https://chrome.google.com/webstore/devconsole/.
2. Pay the one-time $5 registration fee. Accept the developer agreement.
3. Verify the contact email Google sends.

### A.2 Package the extension

```bash
npm run build
cd dist && zip -r ../auto-rebaser-chrome-0.1.0.zip . && cd ..
```

Verify the zip at the repo root contains `manifest.json` at the **top level** of the zip (not nested under `dist/`).

### A.3 Upload

1. Console → **New item** → upload the zip.
2. Listing tab:
   - Name, short description, long description, category, language.
   - Upload icon128.png as the store icon.
   - Upload all `marketing/chrome/screenshot-*.png`.
   - Optional: small promo tile, marquee.
3. Privacy tab:
   - **Single purpose:** "Automate keeping your GitHub PRs up-to-date with their base branches."
   - **Permission justifications:**
     - `storage` — "Store your Personal Access Token and PR cache locally."
     - `alarms` — "Schedule the periodic poll of the GitHub API."
     - `host_permissions: api.github.com, github.com` — "Required to call the GitHub REST and GraphQL APIs."
     - `identity` — "Reserved for an optional future OAuth flow; not invoked at runtime in this version."
   - **Data handling:** declare that you handle authentication info (PAT) and that it's not sold or shared.
   - **Privacy policy URL:** the Pages URL.
4. Distribution: public; all regions; no paid features.
5. Click **Submit for review**.

### A.4 Wait

Reviews typically take 1–3 business days. Some take longer if a reviewer flags `host_permissions`. Watch the dashboard for "In review" → "Published" or "Rejected".

If rejected: the rejection email tells you which policy was triggered. Most common: insufficient permission justifications, or screenshots that show another vendor's logo. Fix and resubmit.

## B. addons.mozilla.org (AMO)

### B.1 Developer account

1. Go to https://addons.mozilla.org/developers/.
2. Sign in with a Firefox account (free, no fee).
3. Accept the developer agreement.

### B.2 Package the extension

```bash
npm run build:firefox
cd dist-firefox && zip -r ../auto-rebaser-firefox-0.1.0.zip . && cd ..
```

### B.3 Package the source

AMO requires source if your code is minified (it is). Produce a separate source zip:

```bash
git archive --format=zip --output=auto-rebaser-source-0.1.0.zip HEAD
```

Include in the listing a brief build instruction:

> Build with: `npm install && npm run build:firefox`. Output is `dist-firefox/`.

### B.4 Upload

1. Developer hub → **Submit a new add-on** → "On this site" (default).
2. Upload `auto-rebaser-firefox-0.1.0.zip` → AMO validates it (a few seconds).
3. If validation fails, read the error and fix. Most common: missing `gecko.id`, `service_worker` instead of `scripts` in background.
4. Upload source zip when prompted.
5. Listing tab: name, summary, description, category, support email, privacy policy URL, license.
6. Add screenshots from `marketing/firefox/`.
7. Submit.

### B.5 Wait

Auto-review for non-content-script extensions usually completes within a few hours. A human reviewer may follow up.

## C. Post-publish

1. Capture the public install URLs from each store.
2. Add them to `docs/LAUNCH_PLAN.md` "Launch history".
3. Add install badges to `README.md`.
4. Tag the commit: `git tag v0.1.0 && git push --tags`.
5. Optional: announce on whatever channel makes sense.

## Red flags

- "I'll skip the source zip on AMO; it's open source on GitHub anyway." AMO's policy is explicit — you must submit source matching the upload. They'll reject without it.
- "I'll claim no permissions matter and ship." Web Store reviewers will read your manifest. Underclaim and they reject; overclaim with no justification and they reject.
- "I'll set the privacy URL to the GitHub blob URL of `PRIVACY.md`." Works, but AMO sometimes prefers a stable rendered URL — Pages is safer.
- "Ship without screenshots." Both stores require at least one.
- Submitting without local-green tests + smoke-test runs first. The forty-minute fix you skip becomes a one-week store-review cycle.
