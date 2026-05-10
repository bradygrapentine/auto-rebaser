// E2E fixtures — Chrome MV3 extension loader for Playwright.
//
// Each test gets a fresh persistent context with the unpacked extension
// from `dist/` loaded. The extension's service worker is resolved so tests
// can seed chrome.storage and dispatch messages. The popup page is opened
// at the extension URL directly (popup actions aren't reachable via UI in
// the headless context, so we navigate to the popup HTML and drive it
// like any other web page).
//
// GitHub API calls are intercepted at the network layer via context.route
// so tests are deterministic — no real network, no PAT required in CI.

import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = join(__dirname, '..', 'dist');

export interface ExtensionFixtures {
  context: BrowserContext;
  extensionId: string;
  serviceWorker: Worker;
  popupPage: Page;
}

export const test = base.extend<ExtensionFixtures>({
  context: async ({}, use) => {
    // Persistent context is required for extensions. Use a fresh temp dir
    // per test so chrome.storage doesn't bleed between tests.
    //
    // MV3 + Playwright headless requirements:
    // - `--headless=new` (the default in `headless: true` for Playwright
    //   1.39+) supports extensions, but the service worker only registers
    //   after the context has at least one page open.
    // - We open an about:blank page AND keep it open for the rest of the
    //   test — closing it can tear down the SW context. The page sits
    //   idle; tests open additional pages for the popup.
    const userDataDir = mkdtempSync(join(tmpdir(), 'auto-rebaser-e2e-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--headless=new',
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });
    const initPage = await context.newPage();
    await initPage.goto('about:blank');
    await use(context);
    await initPage.close().catch(() => {});
    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
  },

  serviceWorker: async ({ context }, use) => {
    // Wait for the extension's service worker to register. With the
    // context-init nudge above, this is usually immediate but allow a
    // generous timeout for slower CI runners.
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 30_000 });
    }
    await use(sw);
  },

  extensionId: async ({ serviceWorker }, use) => {
    // Service worker URL: chrome-extension://<id>/service-worker.js
    const url = new URL(serviceWorker.url());
    await use(url.host);
  },

  popupPage: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
    await use(page);
    await page.close();
  },
});

export const expect = test.expect;

/**
 * Seed chrome.storage from a test. Runs in the popup page's context (which
 * has chrome.* APIs available since it's an extension page).
 */
export async function seedStorage(
  page: Page,
  data: { local?: Record<string, unknown>; sync?: Record<string, unknown> },
): Promise<void> {
  await page.evaluate(async (payload) => {
    if (payload.local) await chrome.storage.local.set(payload.local);
    if (payload.sync) await chrome.storage.sync.set(payload.sync);
  }, data);
}

/**
 * Wait for the popup to re-render after seeded storage. The popup hooks
 * (usePRStore, useAuth) load on mount via async chrome.storage.get; this
 * helper waits a frame so React reflects them.
 */
export async function reloadPopup(page: Page): Promise<void> {
  await page.reload();
  // Wait for the React tree to mount — body content stabilizes quickly.
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Intercept api.github.com calls so tests don't hit real GitHub and don't
 * need a real PAT. Returns minimal valid responses for the endpoints the
 * popup hits on mount (auth check). Tests that exercise more endpoints
 * can extend the route() handler.
 */
export async function mockGitHubApi(context: BrowserContext): Promise<void> {
  await context.route('**/api.github.com/**', async (route) => {
    const url = route.request().url();

    // /user — useAuth hits this on mount to surface login + avatar.
    if (url.endsWith('/user')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          login: 'e2e-user',
          id: 99999,
          avatar_url: 'https://example.invalid/avatar.png',
        }),
      });
      return;
    }

    // /search/issues — searchAuthoredPRs. Return empty so the poll cycle
    // is a no-op. Tests seed pr_store directly to drive the popup.
    if (url.includes('/search/issues')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total_count: 0 }),
      });
      return;
    }

    // Default: 200 empty object so unexpected paths don't break tests.
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    });
  });
}
