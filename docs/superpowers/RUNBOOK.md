# Auto-Rebaser — Runbook
_Last updated 2026-05-02 (Phase 2)_

End-to-end setup, manual test scripts, and troubleshooting for the Chrome extension.

---

## 1. One-time setup

### 1.1 Build and load

```bash
cd ~/projects/auto-rebaser
npm install
npm run build
```

Then in Chrome:
1. `chrome://extensions` → enable **Developer mode** (top-right).
2. **Load unpacked** → select the `dist/` folder.
3. The extension card shows an ID. The repo ships with a `manifest.json::key`, so this ID stays stable across reinstalls.

### 1.2 Generate a GitHub Personal Access Token

The extension uses a PAT for GitHub auth. Two flavors work:

**Classic PAT (simpler):** https://github.com/settings/tokens/new
- **Note**: Auto Rebaser
- **Expiration**: your call (90 days is fine for testing)
- **Scopes**:
  - `repo` *(required — for PR list, detail fetch, and update-branch)*
  - `notifications` *(optional — only if you plan to enable auto-dismiss-stale-notifications later)*
- **Generate token**, copy the `ghp_…` string immediately.

**Fine-grained PAT** (https://github.com/settings/personal-access-tokens/new) also works. Required permissions:
- *Pull requests*: Read and write
- *Contents*: Read and write
- *Metadata*: Read (auto)
- For Phase 2 automations, also: *Administration* (read+write to delete merged branches), *Notifications* (if 2.9 enabled)

### 1.3 Paste the PAT into the extension

Click the extension icon → paste the PAT into the input → **Save token**. The popup verifies it against `/user` and switches to the PR list view. The token is stored in `chrome.storage.sync` (encrypted at rest by Chrome).

If the PAT is invalid or the API is unreachable, you'll see an error message and the input stays open.

### 1.4 (Optional) Stable extension ID for distribution

The shipped key gives a deterministic ID. Private key is at `.key/extension.pem` (gitignored — back it up if you care about preserving the ID across machines).

To regenerate:
```bash
openssl genrsa -out .key/extension.pem 2048
openssl rsa -in .key/extension.pem -pubout -outform DER 2>/dev/null | base64 | tr -d '\n'
```
Paste the base64 output into `manifest.json::key`, rebuild, reload.

---

## 2. Daily development

```bash
npm run dev          # rebuild on file change → click Reload in chrome://extensions
npm test             # run all tests
npm run test:watch   # tests in watch mode
npm run test:coverage  # with coverage report (HTML at coverage/index.html)
npm run typecheck    # tsc --noEmit
```

---

## 3. Manual test scripts (Phase 1 — core)

Run after a fresh build to verify end-to-end behavior. Requires open authored PRs in your GitHub account.

### 3.1 Auth happy path
**Pre:** Extension loaded, signed out (popup shows the SignIn view).
1. Paste a valid PAT into the input.
2. Click **Save token**.
3. Popup switches to the PR list view; header shows your GitHub username.

**Verify:** `chrome.storage.sync.get('github_token')` in the SW console returns the token.

### 3.2 Invalid token
1. Sign out (Header → Sign out).
2. Paste a clearly-bad token (`ghp_invalid`).
3. Click **Save token**.

**Expected:** Error message "PAT_INVALID: HTTP_401". Popup stays on SignIn view, no token written.

### 3.3 Network failure
1. Disconnect from the network.
2. Try to save any PAT.

**Expected:** "PAT_NETWORK_ERROR" message. Token not stored.

### 3.4 PR discovery (Story 1.2)
**Pre:** Signed in. ≥1 open authored PR.
1. Click extension icon → PR list view.
2. List shows all open authored PRs across all repos within ~5s (initial poll).
3. Each row: status badge (left), `owner/repo#NNN — title` (link).

**Expected:** Clicking any PR title opens it in GitHub. >100 PRs paginate automatically (up to 1000 due to GitHub's hard cap).

### 3.5 Auto-rebase a behind PR (Story 1.3)
**Pre:** A PR you authored that is behind its base (push to `main` after creating the PR).
1. Open the popup; wait for next poll or click **Poll now**.
2. Status briefly shows **Behind** → **Updating** → **Updated**.
3. Extension icon badge shows a green count of rebased PRs.
4. Click the PR on GitHub — fresh rebase commit on top of latest base.

### 3.6 Conflicted PR (Story 1.10)
**Pre:** A PR with merge conflicts.
1. Wait for next poll.
2. Status: **Conflict** (red badge). Hover for error message.

**Expected:** No `update-branch` call attempted (verify in chrome://inspect → Service Worker → Network).

### 3.7 Poll Now (Story 1.7)
1. Note "Last poll" timestamp at the bottom of the PR list.
2. Click **Poll now**.
3. Timestamp updates within 2 seconds.

### 3.8 Settings — interval change (Story 1.5)
1. Click **Settings** in the header.
2. Change interval (1 / 5 / 15 / 30 min).
3. Click **Back**.
4. In SW console: `chrome.alarms.getAll(console.log)` → confirm `poll` alarm has the new `periodInMinutes`.

### 3.9 Sign out (Story 1.1)
1. Header → **Sign out**.
2. Popup returns to SignIn view immediately.
3. `chrome.storage.sync.get('github_token')` returns `{}`.

### 3.10 Token revocation (Story 1.10)
**Pre:** Signed in. Manually revoke the token at https://github.com/settings/tokens (Classic) or https://github.com/settings/personal-access-tokens (Fine-grained).
1. Click **Poll now**.
2. Popup returns to SignIn view automatically.

---

## 4. Manual test scripts (Phase 2 — automations)

Phase 2 adds four optional automations. **All are off by default** except `autoDeleteMergedBranch` (which is gated on the repo's setting too — won't act unless your repo has "Automatically delete head branches" off).

### 4.1 Toggle automation settings (Story 2.5–2.9)
1. Settings view → scroll to **Automations**.
2. Toggle each switch:
   - **Auto-delete merged branches** *(default ON)* — after a PR merges, deletes its head branch via the GitHub API.
   - **Auto-enable auto-merge** *(default OFF)* — flips GitHub's "Enable auto-merge" toggle on eligible PRs (rebased, no conflicts, all checks defined).
   - **Auto-resolve obsolete review threads** *(default OFF)* — uses GraphQL to mark threads resolved when their referenced line no longer exists in the diff.
   - **Auto-dismiss stale notifications** *(default OFF)* — marks PR-thread notifications read when the PR is closed/merged. **Requires `notifications` scope on the PAT.**
3. For (1) and (2), opt-out lists allow per-repo skip.
4. For (2), pick a merge method (Squash / Merge / Rebase).

**Expected:** Settings persist across popup close/open. Toggle changes apply on the next poll.

### 4.2 Last-cycle summary footer
**Pre:** Signed in, ≥1 automation enabled.
1. Watch the popup after a poll (or click **Poll now**).
2. Footer shows non-zero counters: `1 rebased`, `1 branch deleted`, etc.
3. Counters reset to zero when a poll cycle has nothing to report.

### 4.3 Notifications scope grant (Story 2.9)
**Pre:** PAT was generated **without** `notifications` scope.
1. Settings → toggle **Auto-dismiss stale notifications** ON.
2. The toggle persists, but the orchestrator will silently skip the step (gated on `notificationsScopeGranted`).
3. To enable: regenerate the PAT with `repo notifications` scopes, sign out, paste the new PAT.
4. After the next poll, `chrome.storage.sync.get('automation_settings')` shows `notificationsScopeGranted: true`.

### 4.4 Branch-delete retry (Codex H2 fix)
**Pre:** A PR you authored just merged. `autoDeleteMergedBranch` is ON.
1. Wait for the next poll. Branch deletion is attempted; on transient 5xx, the PR stays in `merged` state with `branchDeleted: false`.
2. Next poll re-attempts the deletion until it succeeds.

### 4.5 Open→merged transition (Codex H1 fix)
**Pre:** A PR is in your popup as `current`; you merge it on GitHub.
1. Wait for the next poll.
2. PR row shows `merged` state for one cycle (giving Phase-2 automations a chance to act).
3. Cycle after that, PR is pruned from the list (assuming `branchDeleted: true`).

---

## 5. Verifying the build

```bash
npm run build
```

Expected `dist/` layout:
```
dist/
  manifest.json
  service-worker.js
  popup.js
  src/popup/index.html
  chunks/endpoints.js
  icons/icon{16,48,128}.png
```

Manifest references:
- `default_popup: src/popup/index.html`
- `service_worker: service-worker.js`
- `host_permissions: api.github.com, github.com`

---

## 6. Troubleshooting

### Popup says PAT_INVALID immediately
- Verify the PAT is correct (`gh auth status` if you have `gh` CLI).
- Confirm scopes: GitHub now requires explicit `repo` for private PRs and search.
- For fine-grained PATs: confirm the resource scope includes the repos you want monitored.

### Popup shows SignIn view even though I'm signed in
- Token was cleared by a 401/403 from the GitHub API. Paste a fresh PAT.

### `update-branch` returns 422 every time on a particular PR
- The PR branch's history is non-fast-forwardable from base (e.g. force-pushes, merge commits in the PR). The PR is marked `needs-manual` and skipped — rebase manually.

### Rate-limited (HTTP 429)
- Authenticated GitHub API limit: 5000 req/hr. Each poll is ~1 req per PR + 1 search call. With 100 PRs and a 1-min interval that's 6100 req/hr — over limit. Increase the interval to 5 min or higher.

### Phase 2 automation appears not to run
- Check the toggle is ON in Settings.
- Open the SW console (`chrome://extensions` → Auto Rebaser → service worker → DevTools).
- Watch for `automations: ran` log line — it shows the summary each poll.
- For dismiss-stale-notifications: confirm `notificationsScopeGranted: true` in `chrome.storage.sync.get('automation_settings')`.

### Background service worker keeps "dying"
- Expected MV3 behavior. `chrome.alarms` wakes it on schedule. If polling stops entirely:
  ```js
  chrome.alarms.getAll(console.log)
  ```
  Should return an alarm named `poll` with `periodInMinutes` matching your settings.

### >1000 open PRs and missing some
- GitHub Search API hard-caps at 1000 results. PRs beyond that won't appear in the list. Workaround: close unused PRs.

---

## 7. Reset state

In SW console:
```js
chrome.storage.local.clear()
chrome.storage.sync.clear()
chrome.alarms.clearAll()
```
Then reload the extension card and paste your PAT again.

---

## 8. Codex review history

Phase 2 Part A landed clean after 5 Codex adversarial-review rounds (4 must-fix iterations + 1 approve). Findings and resolutions are in `.codex-runs/escalations.jsonl`.
