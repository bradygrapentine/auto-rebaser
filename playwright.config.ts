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
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Extension state is shared — keep tests serial.
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    // Trace + screenshot on first retry — keeps the artifact bundle small
    // while preserving everything you need to diagnose a failing CI run.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
