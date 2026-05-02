# Runbook — Icons and screenshots

_Goal: real artwork replaces placeholder icons; store assets ready to upload._

## Required deliverables

### Extension icons (used in browser chrome)

| File | Size | Used by |
|---|---|---|
| `icons/icon16.png` | 16×16 | Toolbar |
| `icons/icon48.png` | 48×48 | Extensions page |
| `icons/icon128.png` | 128×128 | Web Store + Chrome install |

Both `manifest.json` and `manifest.firefox.json` reference these paths. The build copies them into `dist/icons/` and `dist-firefox/icons/`.

### Store assets (NOT in the extension package)

Store these under a new `marketing/` directory at repo root.

**Chrome Web Store:**
- `marketing/chrome/store-icon-128.png` — 128×128 PNG, transparent background.
- `marketing/chrome/screenshot-{1..N}.png` — 1280×800 *or* 640×400 PNG. 1–5 screenshots. Most listings use 1280×800.
- `marketing/chrome/promo-small-440x280.png` — optional but boosts visibility.
- `marketing/chrome/promo-marquee-1400x560.png` — optional, only used if Google features the extension.

**AMO (Firefox):**
- `marketing/firefox/store-icon-64.png` — 64×64 PNG.
- `marketing/firefox/screenshot-{1..N}.png` — 1280×800 PNG, up to 10 screenshots.

## Steps

### 1. Design or commission the icon

Concept: a circular arrow pair (rebase symbol) over a PR-merge silhouette. Or just clean text mark. Avoid GitHub's Octocat (trademarked). Single color works best at 16×16.

Tools:
- Figma (free) → export at 16, 48, 64, 128, 1280×800.
- Or commission on Fiverr / 99designs (~$30–$150).

### 2. Save icon at all required sizes

```
icons/icon16.png
icons/icon48.png
icons/icon128.png
marketing/chrome/store-icon-128.png   # same as icon128.png
marketing/firefox/store-icon-64.png
```

PNG, transparent background, no inner padding (browsers add their own).

### 3. Capture screenshots

Load the extension (see `docs/runbooks/chrome-smoke-test.md`) against a real GitHub account that has a few open PRs. Capture:

1. **Popup with grouped PR list** (folder view, 2–3 repos expanded).
2. **Popup mid-poll** with the spinning refresh icon.
3. **Settings view** showing automation toggles.
4. **Footer state** showing "rebased N" and "deleted owner/repo:branch".
5. **Sign-in view** with the PAT input.

Capture at the popup's natural size, then composite into a 1280×800 frame with a soft background. (Tools: macOS screenshot then drop into a Figma frame, or use https://screenshots.pro / similar.)

### 4. Verify the extension still builds with new icons

```bash
npm run build:all
ls -la dist/icons dist-firefox/icons
```

File sizes should be > 0 and look like real artwork at `open dist/icons/icon128.png`.

### 5. Commit

```
git add icons/ marketing/
git commit -m "feat(branding): real icons + store assets"
```

## Exit

- All three `icons/icon*.png` are real artwork.
- `marketing/chrome/` and `marketing/firefox/` populated with the correct sizes.
- Builds still pass.

## Red flags

- Using GitHub's logo or Octocat — trademark violation, store will reject.
- Screenshots that show another user's private PR titles — redact or use a test account.
- Screenshots with the placeholder green square visible — re-shoot after icons land.
