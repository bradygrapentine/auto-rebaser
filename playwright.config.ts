import { defineConfig } from '@playwright/test';

// E2E tests for the unpacked Chrome MV3 extension. Tests load the built
// `dist/` directory as an unpacked extension via Playwright's persistent
// context. Service worker + popup page are driven directly; GitHub API
// calls are intercepted with context.route() so tests are deterministic
// and don't hit real GitHub.
//
// Requires `npm run build` to have produced `dist/` first. The e2e script
// in package.json chains the build automatically; CI does the same.

export default defineConfig({
  testDir: './e2e',
  // 60s per-test budget — also bounds fixture teardown. #204 raised this from
  // 30s but it was the wrong lever: settings-persistence still timed out at
  // 60s on the self-hosted Mac, the failure landing in teardown ("Tearing down
  // popupPage exceeded the test timeout"). Root cause was VIDEO recording, not
  // the budget: measured locally, `video` adds ~2-4s/spec even on a passing
  // run (recorded then discarded), and finalizing it during a failing test's
  // teardown is the hang. Dropping video (below) is the real fix; the 60s
  // budget stays as headroom for runner contention.
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Extension state is shared — keep tests serial.
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    // Trace on failure is the primary debugging artifact (DOM snapshots,
    // network, console) — richer than video and cheap to finalize. Video is
    // intentionally OFF: its per-run recording cost and failure-path
    // finalization were hanging teardown on the self-hosted runner.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
});
