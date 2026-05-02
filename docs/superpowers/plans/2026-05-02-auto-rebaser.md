# Auto-Rebaser Chrome Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome MV3 extension that polls GitHub for all open authored PRs and automatically rebases any that are behind their base branch.

**Architecture:** MV3 service worker handles OAuth, polling via `chrome.alarms`, and `update-branch` calls. Popup is a React UI that reads from `chrome.storage.local`. All GitHub API calls go through a single `github-client` module with ETag caching.

**Tech Stack:** TypeScript, React 18, Vite 5, Vitest 1, `@testing-library/react`, `@types/chrome`

---

## File Map

```
auto-rebaser/
  manifest.json                          ← MV3 manifest
  .env.example                           ← VITE_GITHUB_CLIENT_ID, VITE_GITHUB_CLIENT_SECRET
  package.json
  tsconfig.json
  vite.config.ts
  src/
    background/
      types.ts                           ← PRRecord, PRState, Settings, PRStore interfaces
      pr-store.ts                        ← chrome.storage.local read/write for PR state
      github-client.ts                   ← all GitHub REST calls + ETag caching
      auth.ts                            ← OAuth sign-in/sign-out via launchWebAuthFlow
      service-worker.ts                  ← alarm setup, poll loop, badge updates
    popup/
      index.html                         ← popup entry HTML
      main.tsx                           ← React root mount
      App.tsx                            ← list/settings view switcher
      hooks/
        usePRStore.ts                    ← reads + live-updates from chrome.storage.local
        useSettings.ts                   ← reads + writes settings to chrome.storage.sync
      components/
        StatusBadge.tsx                  ← color-coded state badge
        PRRow.tsx                        ← single PR row with badge + link
        PRList.tsx                       ← full PR list + poll-now button
        Settings.tsx                     ← interval picker + sign out
  tests/
    setup.ts                             ← chrome global mock, jsdom setup
    background/
      pr-store.test.ts
      github-client.test.ts
      service-worker.test.ts
    popup/
      StatusBadge.test.tsx
      PRList.test.tsx
  README.md
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1.1: Create package.json**

```json
{
  "name": "auto-rebaser",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite build --watch",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.6",
    "@testing-library/react": "^16.0.0",
    "@types/chrome": "^0.0.268",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^24.1.1",
    "typescript": "^5.5.3",
    "vite": "^5.4.1",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 1.2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 1.3: Create vite.config.ts**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
```

- [ ] **Step 1.4: Create .env.example**

```
VITE_GITHUB_CLIENT_ID=your_client_id_here
VITE_GITHUB_CLIENT_SECRET=your_client_secret_here
```

- [ ] **Step 1.5: Create .gitignore**

```
node_modules/
dist/
.env
*.local
```

- [ ] **Step 1.6: Create directory structure**

```bash
mkdir -p src/background src/popup/hooks src/popup/components tests/background tests/popup
```

- [ ] **Step 1.7: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 1.8: Verify typecheck runs (will fail — no src files yet)**

```bash
npm run typecheck
```

Expected: error about missing files (that's fine — just confirming the toolchain works).

- [ ] **Step 1.9: Commit**

```bash
git add package.json tsconfig.json vite.config.ts .env.example .gitignore
git commit -m "chore: scaffold project — vite + ts + react + vitest"
```

---

## Task 2: Manifest + Chrome Setup

**Files:**
- Create: `manifest.json`
- Create: `src/popup/index.html`

- [ ] **Step 2.1: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Auto Rebaser",
  "version": "0.1.0",
  "description": "Automatically rebases your open GitHub PRs when they fall behind",
  "permissions": [
    "alarms",
    "storage",
    "identity"
  ],
  "background": {
    "service_worker": "service-worker.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup/index.html",
    "default_title": "Auto Rebaser"
  },
  "key": ""
}
```

Note: `key` field left empty — fill in with your extension's public key after first load in Chrome to get a stable extension ID (needed to configure the OAuth redirect URI).

- [ ] **Step 2.2: Create src/popup/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Auto Rebaser</title>
  <style>body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }</style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```

- [ ] **Step 2.3: Commit**

```bash
git add manifest.json src/popup/index.html
git commit -m "chore: add MV3 manifest and popup HTML"
```

---

## Task 3: Types Module

**Files:**
- Create: `src/background/types.ts`
- Create: `tests/setup.ts`

- [ ] **Step 3.1: Create src/background/types.ts**

```ts
export type PRState =
  | 'current'
  | 'behind'
  | 'updating'
  | 'updated'
  | 'conflict'
  | 'needs-manual'
  | 'error';

export interface PRRecord {
  id: number;
  number: number;
  title: string;
  repo: string; // "owner/repo"
  url: string;
  state: PRState;
  lastUpdated: number; // epoch ms
  errorMessage?: string;
}

export interface Settings {
  intervalMinutes: 1 | 5 | 15 | 30;
}

export interface PRStore {
  prs: PRRecord[];
  lastPollAt: number | null;
}
```

- [ ] **Step 3.2: Create tests/setup.ts**

This file runs before every test and installs the `chrome` global mock.

```ts
import { vi } from 'vitest';

const chromeMock = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    sync: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: { addListener: vi.fn() },
  },
  identity: {
    launchWebAuthFlow: vi.fn(),
    getRedirectURL: vi.fn(() => 'https://abc123.chromiumapp.org/'),
  },
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
  },
  runtime: {
    onMessage: { addListener: vi.fn() },
    onInstalled: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
    sendMessage: vi.fn(),
  },
};

Object.defineProperty(global, 'chrome', { value: chromeMock, writable: true });
```

- [ ] **Step 3.3: Verify typecheck is clean**

```bash
npm run typecheck
```

Expected: no errors (only `types.ts` and `setup.ts` exist so far).

- [ ] **Step 3.4: Commit**

```bash
git add src/background/types.ts tests/setup.ts
git commit -m "feat: add PRRecord/PRState/Settings types and test chrome mock"
```

---

## Task 4: PR Store (TDD)

**Files:**
- Create: `src/background/pr-store.ts`
- Create: `tests/background/pr-store.test.ts`

- [ ] **Step 4.1: Write the failing tests**

Create `tests/background/pr-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadStore, saveStore, upsertPRs } from '../../src/background/pr-store';
import type { PRRecord } from '../../src/background/types';

const mockPR: PRRecord = {
  id: 1,
  number: 42,
  title: 'Add feature',
  repo: 'owner/repo',
  url: 'https://github.com/owner/repo/pull/42',
  state: 'current',
  lastUpdated: 1000,
};

describe('pr-store', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('loadStore', () => {
    it('returns empty store when nothing saved', async () => {
      (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
      const store = await loadStore();
      expect(store).toEqual({ prs: [], lastPollAt: null });
    });

    it('returns stored data when present', async () => {
      const stored = { prs: [mockPR], lastPollAt: 1234 };
      (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({ pr_store: stored });
      expect(await loadStore()).toEqual(stored);
    });
  });

  describe('saveStore', () => {
    it('writes to chrome.storage.local with correct key', async () => {
      (chrome.storage.local.set as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      const store = { prs: [mockPR], lastPollAt: 9999 };
      await saveStore(store);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ pr_store: store });
    });
  });

  describe('upsertPRs', () => {
    it('inserts new PRs', async () => {
      (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (chrome.storage.local.set as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await upsertPRs([mockPR]);

      const saved = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(saved.pr_store.prs).toHaveLength(1);
      expect(saved.pr_store.prs[0].id).toBe(1);
    });

    it('merges updated PRs by id', async () => {
      (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        pr_store: { prs: [mockPR], lastPollAt: 0 },
      });
      (chrome.storage.local.set as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const updated = { ...mockPR, state: 'updated' as const, lastUpdated: 2000 };
      await upsertPRs([updated]);

      const saved = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(saved.pr_store.prs).toHaveLength(1);
      expect(saved.pr_store.prs[0].state).toBe('updated');
    });

    it('preserves lastPollAt when upserting', async () => {
      (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        pr_store: { prs: [], lastPollAt: 5555 },
      });
      (chrome.storage.local.set as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await upsertPRs([mockPR]);

      const saved = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(saved.pr_store.lastPollAt).toBe(5555);
    });
  });
});
```

- [ ] **Step 4.2: Run tests to confirm they fail**

```bash
npm test -- tests/background/pr-store.test.ts
```

Expected: FAIL — `Cannot find module '../../src/background/pr-store'`

- [ ] **Step 4.3: Implement src/background/pr-store.ts**

```ts
import type { PRRecord, PRStore } from './types';

const STORE_KEY = 'pr_store';

export async function loadStore(): Promise<PRStore> {
  const result = await chrome.storage.local.get(STORE_KEY);
  return result[STORE_KEY] ?? { prs: [], lastPollAt: null };
}

export async function saveStore(store: PRStore): Promise<void> {
  await chrome.storage.local.set({ [STORE_KEY]: store });
}

export async function upsertPRs(records: PRRecord[]): Promise<void> {
  const store = await loadStore();
  const map = new Map(store.prs.map(p => [p.id, p]));
  for (const r of records) map.set(r.id, r);
  await saveStore({ prs: Array.from(map.values()), lastPollAt: store.lastPollAt });
}
```

- [ ] **Step 4.4: Run tests to confirm they pass**

```bash
npm test -- tests/background/pr-store.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 4.5: Commit**

```bash
git add src/background/pr-store.ts tests/background/pr-store.test.ts
git commit -m "feat: add pr-store with load/save/upsert and tests"
```

---

## Task 5: GitHub Client (TDD)

**Files:**
- Create: `src/background/github-client.ts`
- Create: `tests/background/github-client.test.ts`

- [ ] **Step 5.1: Write the failing tests**

Create `tests/background/github-client.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  searchAuthoredPRs,
  getPR,
  updateBranch,
  getAuthenticatedUser,
  getToken,
  setToken,
  clearToken,
} from '../../src/background/github-client';

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k] ?? null },
    json: async () => body,
  });
}

describe('github-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({ github_token: 'tok' });
    (chrome.storage.sync.set as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (chrome.storage.sync.remove as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (chrome.storage.local.set as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  describe('token helpers', () => {
    it('getToken reads from chrome.storage.sync', async () => {
      expect(await getToken()).toBe('tok');
    });

    it('setToken writes to chrome.storage.sync', async () => {
      await setToken('newtoken');
      expect(chrome.storage.sync.set).toHaveBeenCalledWith({ github_token: 'newtoken' });
    });

    it('clearToken removes from chrome.storage.sync', async () => {
      await clearToken();
      expect(chrome.storage.sync.remove).toHaveBeenCalledWith('github_token');
    });
  });

  describe('searchAuthoredPRs', () => {
    it('sends Authorization header', async () => {
      mockFetch(200, { items: [] });
      await searchAuthoredPRs();
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/search/issues'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
        })
      );
    });

    it('returns items array', async () => {
      mockFetch(200, { items: [{ id: 1, number: 1, title: 'pr', html_url: 'u', repository_url: 'https://api.github.com/repos/o/r' }] });
      const result = await searchAuthoredPRs();
      expect(result.items).toHaveLength(1);
    });

    it('returns empty items on 304 with cache hit', async () => {
      const cached = { items: [{ id: 99, number: 99, title: 'cached', html_url: 'u', repository_url: 'r' }] };
      const url = 'https://api.github.com/search/issues?q=is:pr+is:open+author:@me&per_page=100';
      (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        etags: { [url]: { etag: '"abc"', data: cached } },
      });
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 304, headers: { get: () => '"abc"' }, json: async () => ({}) });

      const result = await searchAuthoredPRs();
      expect(result).toEqual(cached);
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: expect.objectContaining({ 'If-None-Match': '"abc"' }) })
      );
    });
  });

  describe('getPR', () => {
    it('fetches the correct PR endpoint', async () => {
      mockFetch(200, { id: 1, number: 5, title: 'pr', html_url: 'u', mergeable_state: 'clean', base: { repo: { full_name: 'o/r' } } });
      await getPR('o', 'r', 5);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/repos/o/r/pulls/5'),
        expect.any(Object)
      );
    });

    it('throws AUTH_ERROR on 401 and clears token', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, headers: { get: () => null }, json: async () => ({}) });
      await expect(getPR('o', 'r', 1)).rejects.toThrow('AUTH_ERROR');
      expect(chrome.storage.sync.remove).toHaveBeenCalledWith('github_token');
    });

    it('throws AUTH_ERROR on 403 and clears token', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403, headers: { get: () => null }, json: async () => ({}) });
      await expect(getPR('o', 'r', 1)).rejects.toThrow('AUTH_ERROR');
    });

    it('throws RATE_LIMITED on 429', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, headers: { get: () => null }, json: async () => ({}) });
      await expect(getPR('o', 'r', 1)).rejects.toThrow('RATE_LIMITED');
    });
  });

  describe('updateBranch', () => {
    it('sends PUT with update_method rebase', async () => {
      mockFetch(202, {});
      await updateBranch('o', 'r', 1);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/repos/o/r/pulls/1/update-branch'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ update_method: 'rebase' }),
        })
      );
    });

    it('throws HTTP_422 on 422 response', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 422, headers: { get: () => null }, json: async () => ({}) });
      await expect(updateBranch('o', 'r', 1)).rejects.toThrow('HTTP_422');
    });
  });

  describe('getAuthenticatedUser', () => {
    it('fetches /user endpoint', async () => {
      mockFetch(200, { login: 'brady', avatar_url: 'https://avatar' });
      const user = await getAuthenticatedUser();
      expect(user.login).toBe('brady');
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/user'), expect.any(Object));
    });
  });
});
```

- [ ] **Step 5.2: Run tests to confirm they fail**

```bash
npm test -- tests/background/github-client.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 5.3: Implement src/background/github-client.ts**

```ts
const GITHUB_API = 'https://api.github.com';
const ETAG_STORE_KEY = 'etags';

interface ETagEntry { etag: string; data: unknown }
type ETagMap = Record<string, ETagEntry>;

async function getETagCache(): Promise<ETagMap> {
  const r = await chrome.storage.local.get(ETAG_STORE_KEY);
  return r[ETAG_STORE_KEY] ?? {};
}

async function setETagCache(cache: ETagMap): Promise<void> {
  await chrome.storage.local.set({ [ETAG_STORE_KEY]: cache });
}

export async function getToken(): Promise<string | null> {
  const r = await chrome.storage.sync.get('github_token');
  return r.github_token ?? null;
}

export async function setToken(token: string): Promise<void> {
  await chrome.storage.sync.set({ github_token: token });
}

export async function clearToken(): Promise<void> {
  await chrome.storage.sync.remove('github_token');
}

async function request<T>(path: string, options: RequestInit = {}, useETag = false): Promise<T | null> {
  const token = await getToken();
  if (!token) throw new Error('NOT_AUTHENTICATED');

  const url = `${GITHUB_API}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...((options.headers ?? {}) as Record<string, string>),
  };

  if (useETag) {
    const cache = await getETagCache();
    if (cache[url]) headers['If-None-Match'] = cache[url].etag;
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 304 && useETag) {
    const cache = await getETagCache();
    return cache[url].data as T;
  }
  if (res.status === 401 || res.status === 403) {
    await clearToken();
    throw new Error('AUTH_ERROR');
  }
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) throw new Error(`HTTP_${res.status}`);

  const data = (await res.json()) as T;

  if (useETag) {
    const etag = res.headers.get('etag');
    if (etag) {
      const cache = await getETagCache();
      await setETagCache({ ...cache, [url]: { etag, data } });
    }
  }

  return data;
}

export interface SearchResult {
  items: Array<{
    id: number;
    number: number;
    title: string;
    html_url: string;
    repository_url: string;
  }>;
}

export async function searchAuthoredPRs(): Promise<SearchResult> {
  const data = await request<SearchResult>(
    '/search/issues?q=is:pr+is:open+author:@me&per_page=100',
    {},
    true
  );
  return data ?? { items: [] };
}

export interface PullRequest {
  id: number;
  number: number;
  title: string;
  html_url: string;
  mergeable_state: string;
  base: { repo: { full_name: string } };
}

export async function getPR(owner: string, repo: string, number: number): Promise<PullRequest> {
  const data = await request<PullRequest>(`/repos/${owner}/${repo}/pulls/${number}`);
  if (!data) throw new Error('PR_NOT_FOUND');
  return data;
}

export async function updateBranch(owner: string, repo: string, number: number): Promise<void> {
  await request(`/repos/${owner}/${repo}/pulls/${number}/update-branch`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ update_method: 'rebase' }),
  });
}

export interface GitHubUser { login: string; avatar_url: string }

export async function getAuthenticatedUser(): Promise<GitHubUser> {
  const data = await request<GitHubUser>('/user');
  if (!data) throw new Error('USER_NOT_FOUND');
  return data;
}
```

- [ ] **Step 5.4: Run tests to confirm they pass**

```bash
npm test -- tests/background/github-client.test.ts
```

Expected: all 12 tests PASS.

- [ ] **Step 5.5: Commit**

```bash
git add src/background/github-client.ts tests/background/github-client.test.ts
git commit -m "feat: add github-client with ETag caching and tests"
```

---

## Task 6: OAuth Auth Flow

**Files:**
- Create: `src/background/auth.ts`

No unit tests for auth — `launchWebAuthFlow` requires a real browser. Covered by manual testing in Task 14.

- [ ] **Step 6.1: Create src/background/auth.ts**

```ts
import { setToken, clearToken } from './github-client';

const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID as string;
const CLIENT_SECRET = import.meta.env.VITE_GITHUB_CLIENT_SECRET as string;

export async function signIn(): Promise<void> {
  const redirectURL = chrome.identity.getRedirectURL();
  const state = crypto.randomUUID();

  const authorizeURL = new URL('https://github.com/login/oauth/authorize');
  authorizeURL.searchParams.set('client_id', CLIENT_ID);
  authorizeURL.searchParams.set('redirect_uri', redirectURL);
  authorizeURL.searchParams.set('scope', 'repo');
  authorizeURL.searchParams.set('state', state);

  const responseURL = await chrome.identity.launchWebAuthFlow({
    url: authorizeURL.toString(),
    interactive: true,
  });

  if (!responseURL) throw new Error('AUTH_CANCELLED');

  const url = new URL(responseURL);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');

  if (!code) throw new Error('AUTH_NO_CODE');
  if (returnedState !== state) throw new Error('AUTH_STATE_MISMATCH');

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: redirectURL,
    }),
  });

  const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (tokenData.error || !tokenData.access_token) {
    throw new Error(`AUTH_TOKEN_ERROR: ${tokenData.error ?? 'no token'}`);
  }

  await setToken(tokenData.access_token);
}

export async function signOut(): Promise<void> {
  await clearToken();
}
```

- [ ] **Step 6.2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6.3: Commit**

```bash
git add src/background/auth.ts
git commit -m "feat: add GitHub OAuth sign-in/sign-out flow"
```

---

## Task 7: Service Worker + Poll Loop (TDD)

**Files:**
- Create: `src/background/service-worker.ts`
- Create: `tests/background/service-worker.test.ts`

- [ ] **Step 7.1: Write the failing tests**

Create `tests/background/service-worker.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runPollCycle, setupAlarm } from '../../src/background/service-worker';
import * as githubClient from '../../src/background/github-client';
import * as prStore from '../../src/background/pr-store';
import type { PRStore } from '../../src/background/types';

vi.mock('../../src/background/github-client');
vi.mock('../../src/background/pr-store');

const emptyStore: PRStore = { prs: [], lastPollAt: null };

function makePRItem(id: number, num: number) {
  return {
    id,
    number: num,
    title: `PR ${num}`,
    html_url: `https://github.com/o/r/pull/${num}`,
    repository_url: 'https://api.github.com/repos/o/r',
  };
}

function makePR(id: number, num: number, mergeableState: string) {
  return {
    id,
    number: num,
    title: `PR ${num}`,
    html_url: `https://github.com/o/r/pull/${num}`,
    mergeable_state: mergeableState,
    base: { repo: { full_name: 'o/r' } },
  };
}

describe('service-worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prStore.loadStore).mockResolvedValue(emptyStore);
    vi.mocked(prStore.saveStore).mockResolvedValue(undefined);
  });

  describe('setupAlarm', () => {
    it('creates alarm with given interval', () => {
      setupAlarm(15);
      expect(chrome.alarms.create).toHaveBeenCalledWith('poll', {
        delayInMinutes: 15,
        periodInMinutes: 15,
      });
    });

    it('defaults to 5 minutes', () => {
      setupAlarm();
      expect(chrome.alarms.create).toHaveBeenCalledWith('poll', {
        delayInMinutes: 5,
        periodInMinutes: 5,
      });
    });
  });

  describe('runPollCycle', () => {
    it('marks PR as updated when behind and rebase succeeds', async () => {
      vi.mocked(githubClient.searchAuthoredPRs).mockResolvedValue({ items: [makePRItem(1, 1)] });
      vi.mocked(githubClient.getPR).mockResolvedValue(makePR(1, 1, 'behind'));
      vi.mocked(githubClient.updateBranch).mockResolvedValue(undefined);

      await runPollCycle();

      const saved = vi.mocked(prStore.saveStore).mock.calls[0][0];
      expect(saved.prs[0].state).toBe('updated');
    });

    it('marks PR as needs-manual on 422 from update-branch', async () => {
      vi.mocked(githubClient.searchAuthoredPRs).mockResolvedValue({ items: [makePRItem(2, 2)] });
      vi.mocked(githubClient.getPR).mockResolvedValue(makePR(2, 2, 'behind'));
      vi.mocked(githubClient.updateBranch).mockRejectedValue(new Error('HTTP_422'));

      await runPollCycle();

      const saved = vi.mocked(prStore.saveStore).mock.calls[0][0];
      expect(saved.prs[0].state).toBe('needs-manual');
    });

    it('marks PR as conflict when mergeable_state is dirty', async () => {
      vi.mocked(githubClient.searchAuthoredPRs).mockResolvedValue({ items: [makePRItem(3, 3)] });
      vi.mocked(githubClient.getPR).mockResolvedValue(makePR(3, 3, 'dirty'));

      await runPollCycle();

      const saved = vi.mocked(prStore.saveStore).mock.calls[0][0];
      expect(saved.prs[0].state).toBe('conflict');
      expect(githubClient.updateBranch).not.toHaveBeenCalled();
    });

    it('marks PR as current when mergeable_state is clean', async () => {
      vi.mocked(githubClient.searchAuthoredPRs).mockResolvedValue({ items: [makePRItem(4, 4)] });
      vi.mocked(githubClient.getPR).mockResolvedValue(makePR(4, 4, 'clean'));

      await runPollCycle();

      const saved = vi.mocked(prStore.saveStore).mock.calls[0][0];
      expect(saved.prs[0].state).toBe('current');
    });

    it('marks PR as error on generic HTTP failure', async () => {
      vi.mocked(githubClient.searchAuthoredPRs).mockResolvedValue({ items: [makePRItem(5, 5)] });
      vi.mocked(githubClient.getPR).mockRejectedValue(new Error('HTTP_500'));

      await runPollCycle();

      const saved = vi.mocked(prStore.saveStore).mock.calls[0][0];
      expect(saved.prs[0].state).toBe('error');
    });

    it('stops entire cycle early on AUTH_ERROR', async () => {
      vi.mocked(githubClient.searchAuthoredPRs).mockResolvedValue({ items: [makePRItem(6, 6)] });
      vi.mocked(githubClient.getPR).mockRejectedValue(new Error('AUTH_ERROR'));

      await runPollCycle();

      expect(prStore.saveStore).not.toHaveBeenCalled();
    });

    it('skips entire cycle on RATE_LIMITED from search', async () => {
      vi.mocked(githubClient.searchAuthoredPRs).mockRejectedValue(new Error('RATE_LIMITED'));

      await runPollCycle();

      expect(prStore.saveStore).not.toHaveBeenCalled();
    });

    it('sets badge to count of updated PRs', async () => {
      vi.mocked(githubClient.searchAuthoredPRs).mockResolvedValue({
        items: [makePRItem(7, 7), makePRItem(8, 8)],
      });
      vi.mocked(githubClient.getPR)
        .mockResolvedValueOnce(makePR(7, 7, 'behind'))
        .mockResolvedValueOnce(makePR(8, 8, 'behind'));
      vi.mocked(githubClient.updateBranch).mockResolvedValue(undefined);

      await runPollCycle();

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '2' });
    });

    it('clears badge when no PRs were updated', async () => {
      vi.mocked(githubClient.searchAuthoredPRs).mockResolvedValue({ items: [makePRItem(9, 9)] });
      vi.mocked(githubClient.getPR).mockResolvedValue(makePR(9, 9, 'clean'));

      await runPollCycle();

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '' });
    });

    it('stamps lastPollAt after successful cycle', async () => {
      vi.mocked(githubClient.searchAuthoredPRs).mockResolvedValue({ items: [] });

      await runPollCycle();

      const saved = vi.mocked(prStore.saveStore).mock.calls[0][0];
      expect(saved.lastPollAt).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 7.2: Run tests to confirm they fail**

```bash
npm test -- tests/background/service-worker.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 7.3: Implement src/background/service-worker.ts**

```ts
import { searchAuthoredPRs, getPR, updateBranch } from './github-client';
import { loadStore, saveStore } from './pr-store';
import type { PRState, PRStore } from './types';

const ALARM_NAME = 'poll';
const DEFAULT_INTERVAL_MINUTES = 5;

export function setupAlarm(intervalMinutes = DEFAULT_INTERVAL_MINUTES): void {
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: intervalMinutes,
    periodInMinutes: intervalMinutes,
  });
}

export async function runPollCycle(): Promise<void> {
  const store = await loadStore();
  let updatedCount = 0;

  try {
    const searchResult = await searchAuthoredPRs();
    const processedPRs: PRStore['prs'] = [];

    for (const item of searchResult.items) {
      const repoFullName = item.repository_url.replace('https://api.github.com/repos/', '');
      const [owner, repo] = repoFullName.split('/');

      let state: PRState = 'current';
      let errorMessage: string | undefined;

      try {
        const pr = await getPR(owner, repo, item.number);

        if (pr.mergeable_state === 'dirty') {
          state = 'conflict';
        } else if (pr.mergeable_state === 'behind') {
          try {
            await updateBranch(owner, repo, item.number);
            state = 'updated';
            updatedCount++;
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.startsWith('HTTP_422')) {
              state = 'needs-manual';
              errorMessage = 'Rebase rejected by GitHub';
            } else if (msg.startsWith('HTTP_409')) {
              state = 'conflict';
              errorMessage = 'Merge conflict';
            } else {
              state = 'error';
              errorMessage = msg;
            }
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'AUTH_ERROR') return;
        state = 'error';
        errorMessage = msg;
      }

      processedPRs.push({
        id: item.id,
        number: item.number,
        title: item.title,
        repo: repoFullName,
        url: item.html_url,
        state,
        lastUpdated: Date.now(),
        errorMessage,
      });
    }

    const map = new Map(store.prs.map(p => [p.id, p]));
    for (const r of processedPRs) map.set(r.id, r);

    await saveStore({ prs: Array.from(map.values()), lastPollAt: Date.now() });

    chrome.action.setBadgeText({ text: updatedCount > 0 ? String(updatedCount) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#2da44e' });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== 'RATE_LIMITED') console.error('Poll cycle error:', msg);
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) await runPollCycle();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'POLL_NOW') {
    runPollCycle().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'SET_INTERVAL') {
    setupAlarm(msg.intervalMinutes as number);
    sendResponse({ ok: true });
  }
});

chrome.runtime.onInstalled.addListener(() => setupAlarm());
chrome.runtime.onStartup.addListener(() => setupAlarm());
```

- [ ] **Step 7.4: Run tests to confirm they pass**

```bash
npm test -- tests/background/service-worker.test.ts
```

Expected: all 10 tests PASS.

- [ ] **Step 7.5: Run full test suite**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 7.6: Commit**

```bash
git add src/background/service-worker.ts tests/background/service-worker.test.ts
git commit -m "feat: add service worker with poll loop, alarm setup, and tests"
```

---

## Task 8: Popup Hooks

**Files:**
- Create: `src/popup/hooks/usePRStore.ts`
- Create: `src/popup/hooks/useSettings.ts`

- [ ] **Step 8.1: Create src/popup/hooks/usePRStore.ts**

```ts
import { useEffect, useState } from 'react';
import type { PRStore } from '../../background/types';

const EMPTY: PRStore = { prs: [], lastPollAt: null };

export function usePRStore(): PRStore {
  const [store, setStore] = useState<PRStore>(EMPTY);

  useEffect(() => {
    chrome.storage.local.get('pr_store', (r) => {
      if (r.pr_store) setStore(r.pr_store as PRStore);
    });

    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.pr_store?.newValue) setStore(changes.pr_store.newValue as PRStore);
    };

    chrome.storage.local.onChanged.addListener(listener);
    return () => chrome.storage.local.onChanged.removeListener(listener);
  }, []);

  return store;
}
```

- [ ] **Step 8.2: Create src/popup/hooks/useSettings.ts**

```ts
import { useEffect, useState } from 'react';
import type { Settings } from '../../background/types';

const DEFAULTS: Settings = { intervalMinutes: 5 };

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    chrome.storage.sync.get('settings', (r) => {
      if (r.settings) setSettings(r.settings as Settings);
    });
  }, []);

  const saveSettings = (next: Settings) => {
    chrome.storage.sync.set({ settings: next });
    chrome.runtime.sendMessage({ type: 'SET_INTERVAL', intervalMinutes: next.intervalMinutes });
    setSettings(next);
  };

  return { settings, saveSettings };
}
```

- [ ] **Step 8.3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 8.4: Commit**

```bash
git add src/popup/hooks/usePRStore.ts src/popup/hooks/useSettings.ts
git commit -m "feat: add usePRStore and useSettings popup hooks"
```

---

## Task 9: StatusBadge Component (TDD)

**Files:**
- Create: `src/popup/components/StatusBadge.tsx`
- Create: `tests/popup/StatusBadge.test.tsx`

- [ ] **Step 9.1: Write the failing tests**

Create `tests/popup/StatusBadge.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StatusBadge } from '../../src/popup/components/StatusBadge';
import type { PRState } from '../../src/background/types';

const cases: Array<[PRState, string]> = [
  ['current', 'Current'],
  ['behind', 'Behind'],
  ['updating', 'Updating…'],
  ['updated', 'Updated'],
  ['conflict', 'Conflict'],
  ['needs-manual', 'Manual'],
  ['error', 'Error'],
];

describe('StatusBadge', () => {
  it.each(cases)('renders correct label for state "%s"', (state, label) => {
    render(<StatusBadge state={state} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
```

- [ ] **Step 9.2: Run tests to confirm they fail**

```bash
npm test -- tests/popup/StatusBadge.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 9.3: Implement src/popup/components/StatusBadge.tsx**

```tsx
import type { PRState } from '../../background/types';

const STYLES: Record<PRState, { bg: string; label: string }> = {
  current:        { bg: '#6e7781', label: 'Current' },
  behind:         { bg: '#bf8700', label: 'Behind' },
  updating:       { bg: '#0969da', label: 'Updating…' },
  updated:        { bg: '#2da44e', label: 'Updated' },
  conflict:       { bg: '#cf222e', label: 'Conflict' },
  'needs-manual': { bg: '#cf222e', label: 'Manual' },
  error:          { bg: '#cf222e', label: 'Error' },
};

export function StatusBadge({ state }: { state: PRState }) {
  const { bg, label } = STYLES[state];
  return (
    <span style={{
      background: bg,
      color: '#fff',
      borderRadius: 4,
      padding: '2px 6px',
      fontSize: 11,
      fontWeight: 600,
      flexShrink: 0,
    }}>
      {label}
    </span>
  );
}
```

- [ ] **Step 9.4: Run tests to confirm they pass**

```bash
npm test -- tests/popup/StatusBadge.test.tsx
```

Expected: all 7 tests PASS.

- [ ] **Step 9.5: Commit**

```bash
git add src/popup/components/StatusBadge.tsx tests/popup/StatusBadge.test.tsx
git commit -m "feat: add StatusBadge component with tests for all states"
```

---

## Task 10: PRRow + PRList Components (TDD)

**Files:**
- Create: `src/popup/components/PRRow.tsx`
- Create: `src/popup/components/PRList.tsx`
- Create: `tests/popup/PRList.test.tsx`

- [ ] **Step 10.1: Create src/popup/components/PRRow.tsx**

```tsx
import type { PRRecord } from '../../background/types';
import { StatusBadge } from './StatusBadge';

export function PRRow({ pr }: { pr: PRRecord }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 0',
      borderBottom: '1px solid #eaeef2',
    }}>
      <StatusBadge state={pr.state} />
      <a
        href={pr.url}
        target="_blank"
        rel="noreferrer"
        title={pr.title}
        style={{
          flex: 1,
          fontSize: 12,
          color: '#0969da',
          textDecoration: 'none',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {pr.repo}#{pr.number} — {pr.title}
      </a>
    </div>
  );
}
```

- [ ] **Step 10.2: Write failing PRList tests**

Create `tests/popup/PRList.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { PRList } from '../../src/popup/components/PRList';
import type { PRStore } from '../../src/background/types';

vi.mock('../../src/popup/hooks/usePRStore');

const mockUsePRStore = vi.fn<[], PRStore>();

vi.mock('../../src/popup/hooks/usePRStore', () => ({
  usePRStore: () => mockUsePRStore(),
}));

describe('PRList', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders a PR row for each PR', () => {
    mockUsePRStore.mockReturnValue({
      prs: [
        { id: 1, number: 42, title: 'Add feature', repo: 'owner/repo', url: 'http://pr', state: 'updated', lastUpdated: 0 },
      ],
      lastPollAt: null,
    });
    render(<PRList />);
    expect(screen.getByText(/owner\/repo#42/)).toBeInTheDocument();
  });

  it('shows empty state when no PRs', () => {
    mockUsePRStore.mockReturnValue({ prs: [], lastPollAt: null });
    render(<PRList />);
    expect(screen.getByText('No open PRs found.')).toBeInTheDocument();
  });

  it('shows "Last poll: never" when lastPollAt is null', () => {
    mockUsePRStore.mockReturnValue({ prs: [], lastPollAt: null });
    render(<PRList />);
    expect(screen.getByText(/Last poll: never/)).toBeInTheDocument();
  });

  it('shows formatted time when lastPollAt is set', () => {
    mockUsePRStore.mockReturnValue({ prs: [], lastPollAt: new Date('2026-05-02T12:00:00').getTime() });
    render(<PRList />);
    expect(screen.getByText(/Last poll:/)).toBeInTheDocument();
    expect(screen.queryByText(/never/)).not.toBeInTheDocument();
  });

  it('sends POLL_NOW message when Poll now clicked', () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    mockUsePRStore.mockReturnValue({ prs: [], lastPollAt: null });
    render(<PRList />);
    fireEvent.click(screen.getByText('Poll now'));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'POLL_NOW' });
  });
});
```

- [ ] **Step 10.3: Run tests to confirm they fail**

```bash
npm test -- tests/popup/PRList.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 10.4: Create src/popup/components/PRList.tsx**

```tsx
import { usePRStore } from '../hooks/usePRStore';
import { PRRow } from './PRRow';

export function PRList() {
  const { prs, lastPollAt } = usePRStore();

  const pollNow = () => {
    chrome.runtime.sendMessage({ type: 'POLL_NOW' });
  };

  return (
    <div style={{ minWidth: 360, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: 14 }}>Auto Rebaser</strong>
        <button onClick={pollNow} style={{ fontSize: 12, cursor: 'pointer' }}>Poll now</button>
      </div>

      {prs.length === 0
        ? <p style={{ fontSize: 13, color: '#6e7781', margin: '8px 0' }}>No open PRs found.</p>
        : prs.map(pr => <PRRow key={pr.id} pr={pr} />)
      }

      <div style={{ marginTop: 8, fontSize: 11, color: '#6e7781' }}>
        Last poll: {lastPollAt ? new Date(lastPollAt).toLocaleTimeString() : 'never'}
      </div>
    </div>
  );
}
```

- [ ] **Step 10.5: Run tests to confirm they pass**

```bash
npm test -- tests/popup/PRList.test.tsx
```

Expected: all 5 tests PASS.

- [ ] **Step 10.6: Commit**

```bash
git add src/popup/components/PRRow.tsx src/popup/components/PRList.tsx tests/popup/PRList.test.tsx
git commit -m "feat: add PRRow and PRList components with tests"
```

---

## Task 11: Settings Component

**Files:**
- Create: `src/popup/components/Settings.tsx`

- [ ] **Step 11.1: Create src/popup/components/Settings.tsx**

```tsx
import { useSettings } from '../hooks/useSettings';
import type { Settings as SettingsType } from '../../background/types';

const INTERVALS: Array<{ label: string; value: SettingsType['intervalMinutes'] }> = [
  { label: '1 min', value: 1 },
  { label: '5 min', value: 5 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
];

export function Settings({ onBack }: { onBack: () => void }) {
  const { settings, saveSettings } = useSettings();

  return (
    <div style={{ minWidth: 360, padding: 12 }}>
      <button onClick={onBack} style={{ fontSize: 12, cursor: 'pointer', marginBottom: 12 }}>
        ← Back
      </button>
      <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Settings</h3>

      <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        Poll interval
        <select
          value={settings.intervalMinutes}
          onChange={e => saveSettings({ ...settings, intervalMinutes: Number(e.target.value) as SettingsType['intervalMinutes'] })}
          style={{ fontSize: 13 }}
        >
          {INTERVALS.map(i => (
            <option key={i.value} value={i.value}>{i.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
```

- [ ] **Step 11.2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 11.3: Commit**

```bash
git add src/popup/components/Settings.tsx
git commit -m "feat: add Settings component with interval picker"
```

---

## Task 12: App Entry Point + Popup Main

**Files:**
- Create: `src/popup/App.tsx`
- Create: `src/popup/main.tsx`

- [ ] **Step 12.1: Create src/popup/App.tsx**

```tsx
import { useState } from 'react';
import { PRList } from './components/PRList';
import { Settings } from './components/Settings';

type View = 'list' | 'settings';

export function App() {
  const [view, setView] = useState<View>('list');

  if (view === 'settings') {
    return <Settings onBack={() => setView('list')} />;
  }

  return (
    <div>
      <PRList />
      <div style={{ padding: '0 12px 12px' }}>
        <button
          onClick={() => setView('settings')}
          style={{ fontSize: 11, cursor: 'pointer', color: '#6e7781', background: 'none', border: 'none', padding: 0 }}
        >
          Settings
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 12.2: Create src/popup/main.tsx**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 12.3: Run full test suite**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 12.4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 12.5: Build**

```bash
npm run build
```

Expected: `dist/` contains `popup/index.html`, `popup.js`, `service-worker.js`.

- [ ] **Step 12.6: Commit**

```bash
git add src/popup/App.tsx src/popup/main.tsx
git commit -m "feat: add App and popup entry point — extension is buildable"
```

---

## Task 13: Copy Manifest to dist

The Vite build outputs JS/HTML but not `manifest.json`. Add a copy step.

- [ ] **Step 13.1: Update vite.config.ts to copy manifest**

Replace the existing `vite.config.ts` with:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync } from 'fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-manifest',
      closeBundle() {
        copyFileSync('manifest.json', 'dist/manifest.json');
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
```

- [ ] **Step 13.2: Build and verify manifest is in dist**

```bash
npm run build && ls dist/
```

Expected output includes: `manifest.json`, `service-worker.js`, `popup/` directory.

- [ ] **Step 13.3: Commit**

```bash
git add vite.config.ts
git commit -m "chore: copy manifest.json to dist on build"
```

---

## Task 14: README + Manual Test Checklist

**Files:**
- Create: `README.md`

- [ ] **Step 14.1: Create README.md**

```markdown
# Auto Rebaser

Chrome extension that automatically rebases your open GitHub PRs when they fall behind their base branch.

## Setup

1. **Create a GitHub OAuth App**
   - Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
   - Application name: Auto Rebaser
   - Homepage URL: `https://github.com`
   - Authorization callback URL: `https://<your-extension-id>.chromiumapp.org/`
   - Copy the Client ID and generate a Client Secret

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Fill in VITE_GITHUB_CLIENT_ID and VITE_GITHUB_CLIENT_SECRET
   ```

3. **Install dependencies and build**
   ```bash
   npm install
   npm run build
   ```

4. **Load in Chrome**
   - Open `chrome://extensions`
   - Enable Developer mode
   - Click "Load unpacked" → select the `dist/` folder
   - Note the extension ID shown on the extension card

5. **Set stable extension ID (optional but recommended)**
   - Copy the extension ID from `chrome://extensions`
   - Add it to `manifest.json` under the `key` field (follow Chrome's instructions for generating the key value)
   - Rebuild and reload
   - Update the GitHub OAuth App callback URL with the stable ID

## Development

```bash
npm run dev        # watch mode — rebuilds on file change
npm test           # run all tests
npm run typecheck  # TypeScript type check
```

## Manual Test Checklist

Run through this after each build to verify the extension works end-to-end.

### Auth
- [ ] Click extension icon → "Sign in with GitHub" button appears
- [ ] Click sign in → GitHub authorization page opens
- [ ] After authorizing → popup shows GitHub username
- [ ] Close and reopen popup → still signed in (token persisted)
- [ ] Click sign out → returns to sign-in screen

### PR Discovery
- [ ] After sign in → popup lists your open authored PRs
- [ ] PRs from multiple repos appear correctly
- [ ] A PR you just opened appears within the next poll cycle
- [ ] A merged PR disappears within the next poll cycle

### Auto Rebase
- [ ] Open a PR → update the base branch manually → extension rebases it within the poll interval
- [ ] After rebase → PR status shows "Updated" in popup
- [ ] Badge count increments for each rebased PR
- [ ] A conflicted PR shows "Conflict" and is not rebased

### Poll Now
- [ ] Click "Poll now" → PR list updates immediately
- [ ] "Last poll" timestamp updates after clicking "Poll now"

### Settings
- [ ] Click Settings → interval dropdown shows current value
- [ ] Change interval → alarm reschedules (verify with `chrome.alarms` in DevTools)
- [ ] Reload Chrome → interval setting persists

## Architecture

See `docs/superpowers/specs/2026-05-02-auto-rebaser-design.md` for full design spec.
```

- [ ] **Step 14.2: Run full test suite one final time**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 14.3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 14.4: Build**

```bash
npm run build
```

Expected: no errors, `dist/` is complete.

- [ ] **Step 14.5: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup guide and manual test checklist"
```

---

## Spec Coverage Self-Review

| Spec Requirement | Task |
|---|---|
| GitHub OAuth App sign-in | Task 6 |
| Token in `chrome.storage.sync` | Task 5 (setToken/getToken) |
| CSRF state check | Task 6 |
| Search API for authored PRs | Task 5 (searchAuthoredPRs) |
| ETag caching | Task 5 |
| `mergeable_state` check per PR | Task 7 |
| `update-branch` with `update_method: rebase` | Task 5 (updateBranch) |
| 422 → `needs-manual` | Task 7 |
| dirty → `conflict`, no rebase | Task 7 |
| `chrome.alarms` polling | Task 7 (setupAlarm) |
| User-configurable interval | Task 8 (useSettings), Task 11 |
| Popup PR list with badges | Tasks 9, 10 |
| Poll now button | Task 10 |
| Badge count | Task 7 |
| 401/403 → clear token | Task 5 |
| 429 → skip cycle | Task 7 |
| Network error → `error` state | Task 7 |
| `PRStore` persistence | Task 4 |
| Settings | Task 11 |
| README + manual tests | Task 14 |
