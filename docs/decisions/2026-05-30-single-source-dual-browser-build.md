# Single-source dual-browser build (Chrome + Firefox)

**Date:** 2026-05-30
**Status:** Accepted
**Backlog:** DOC-1 (retrospective — v2 packaging)

## Context

The extension ships to both the Chrome Web Store and Firefox Add-ons. The two
targets need different manifests (MV3 specifics, browser-specific keys) but
should not require a forked codebase.

## Decision

Build both targets from one source tree, switching on a `TARGET` env var in
`vite.config.ts`. `TARGET=firefox` selects `dist-firefox/` and
`manifest.firefox.json`; the default builds Chrome into `dist/` from
`manifest.json` (`vite.config.ts:6-8`). The npm scripts wrap this:
`build:firefox`, `build:all` (both), and `build:store` (production builds of
both).

The manifest's `key` field — which pins a stable dev-mode extension id for OAuth
redirect URIs — is **stripped only on production builds**, gated on `STORE=1`
(`vite.config.ts:12,21`), because the Chrome Web Store rejects a manifest
containing `key`. This is orthogonal to the browser target: `build:store` runs
`STORE=1` for *both* Chrome and Firefox.

## Consequences

- **Benefit:** one codebase, two store artifacts; no fork to keep in sync.
- **Benefit:** browser- and store-specific quirks (separate manifest, the
  `key`-strip) live in the build pipeline, not scattered through source.
- **Cost:** two manifests (`manifest.json`, `manifest.firefox.json`) must be kept
  in step when permissions or MV3 fields change.
- **Note:** dev builds keep `key` for a stable extension id (stable OAuth
  redirect); only the `STORE=1` production path removes it. e2e runs against the
  built Chrome artifact.
