# Repo-name Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an autocomplete datalist of `owner/repo` strings to the skip/ignore inputs in the popup settings, sourced from a service-worker-maintained cache of repos seen during PR scans.

**Architecture:** The poll cycle already enumerates `owner/repo` for each scanned PR. After each scan, union those into a new `chrome.storage.local` key `knownRepos` (LRU-capped at 200 by `lastSeenAt`). The existing `RepoOptOutList` component subscribes to that store and renders a `<datalist>` for native browser autocomplete. Free-text entry remains valid; suggestions are advisory.

**Tech Stack:** TypeScript, React (popup), Vitest, `chrome.storage.local`, existing `pr-store` / `settings-store` patterns.

**Spec:** `docs/superpowers/specs/2026-05-08-repo-autocomplete-design.md`

---

## File Structure

- **Create** `src/core/known-repos-store.ts` — pure store module: read, upsert, LRU cap, subscribe. Mirrors the pattern in `src/core/pr-store.ts` / `settings-store.ts`.
- **Create** `tests/core/known-repos-store.test.ts` — unit tests for upsert/LRU/validation.
- **Modify** `src/background/poll-cycle.ts` — after the scan, call `recordKnownRepos(fullNames)`. Best-effort, must not throw out.
- **Modify** `tests/background/poll-cycle.test.ts` (or add `tests/background/poll-cycle.known-repos.test.ts` if the existing file is unwieldy) — assert recorded repos after a scan.
- **Modify** `src/popup/components/RepoOptOutList.tsx` — accept optional `suggestions` prop, render a `<datalist>` and wire `list=` on the input.
- **Modify** `tests/popup/RepoOptOutList.test.tsx` (or create if absent) — datalist rendered, free-text-not-in-suggestions still saves.
- **Modify** the parent that renders `RepoOptOutList` (locate via grep in Task 5) — subscribe to `knownRepos` and pass as `suggestions`.

---

## Task 1: Known-repos store module

**Files:**
- Create: `src/core/known-repos-store.ts`
- Test: `tests/core/known-repos-store.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/core/known-repos-store.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  KNOWN_REPOS_KEY,
  KNOWN_REPOS_CAP,
  recordKnownRepos,
  getKnownRepos,
  isValidFullName,
} from '../../src/core/known-repos-store';

type Storage = Record<string, unknown>;
let storage: Storage;

beforeEach(() => {
  storage = {};
  // @ts-expect-error - test global
  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
        set: vi.fn(async (patch: Storage) => {
          Object.assign(storage, patch);
        }),
      },
    },
  };
});

describe('isValidFullName', () => {
  it('accepts owner/repo shapes', () => {
    expect(isValidFullName('a/b')).toBe(true);
    expect(isValidFullName('Org-Name/repo.name')).toBe(true);
    expect(isValidFullName('user/repo_1')).toBe(true);
  });

  it('rejects malformed strings', () => {
    expect(isValidFullName('bare')).toBe(false);
    expect(isValidFullName('a/')).toBe(false);
    expect(isValidFullName('/b')).toBe(false);
    expect(isValidFullName('a b/c')).toBe(false);
    expect(isValidFullName('')).toBe(false);
  });
});

describe('recordKnownRepos', () => {
  it('inserts new repos with lastSeenAt', async () => {
    vi.setSystemTime(new Date(1_000));
    await recordKnownRepos(['octo/cat', 'mona/lisa']);
    const got = await getKnownRepos();
    expect(got).toEqual([
      { fullName: 'octo/cat', lastSeenAt: 1000 },
      { fullName: 'mona/lisa', lastSeenAt: 1000 },
    ]);
  });

  it('upserts existing repo and updates lastSeenAt', async () => {
    vi.setSystemTime(new Date(1_000));
    await recordKnownRepos(['octo/cat']);
    vi.setSystemTime(new Date(2_000));
    await recordKnownRepos(['octo/cat']);
    const got = await getKnownRepos();
    expect(got).toHaveLength(1);
    expect(got[0]).toEqual({ fullName: 'octo/cat', lastSeenAt: 2000 });
  });

  it('drops malformed entries silently', async () => {
    await recordKnownRepos(['ok/repo', 'bad', '', '/x']);
    const got = await getKnownRepos();
    expect(got.map((r) => r.fullName)).toEqual(['ok/repo']);
  });

  it('caps at KNOWN_REPOS_CAP, evicting oldest first', async () => {
    for (let i = 0; i < KNOWN_REPOS_CAP + 5; i++) {
      vi.setSystemTime(new Date(1000 + i));
      await recordKnownRepos([`org/repo-${i}`]);
    }
    const got = await getKnownRepos();
    expect(got).toHaveLength(KNOWN_REPOS_CAP);
    expect(got.find((r) => r.fullName === 'org/repo-0')).toBeUndefined();
    expect(got.find((r) => r.fullName === `org/repo-${KNOWN_REPOS_CAP + 4}`)).toBeDefined();
  });
});

describe('getKnownRepos', () => {
  it('returns [] when storage is empty', async () => {
    expect(await getKnownRepos()).toEqual([]);
  });

  it('filters malformed entries already in storage', async () => {
    storage[KNOWN_REPOS_KEY] = [
      { fullName: 'good/repo', lastSeenAt: 1 },
      { fullName: 'bad', lastSeenAt: 2 },
      { fullName: '', lastSeenAt: 3 },
    ];
    const got = await getKnownRepos();
    expect(got.map((r) => r.fullName)).toEqual(['good/repo']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/known-repos-store.test.ts`
Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Implement the store**

```ts
// src/core/known-repos-store.ts
export const KNOWN_REPOS_KEY = 'knownRepos';
export const KNOWN_REPOS_CAP = 200;

const FULL_NAME_RE = /^[\w.-]+\/[\w.-]+$/;

export interface KnownRepo {
  fullName: string;
  lastSeenAt: number;
}

export function isValidFullName(s: string): boolean {
  return FULL_NAME_RE.test(s);
}

function sanitize(entries: unknown): KnownRepo[] {
  if (!Array.isArray(entries)) return [];
  const out: KnownRepo[] = [];
  for (const e of entries) {
    if (
      e &&
      typeof e === 'object' &&
      typeof (e as KnownRepo).fullName === 'string' &&
      typeof (e as KnownRepo).lastSeenAt === 'number' &&
      isValidFullName((e as KnownRepo).fullName)
    ) {
      out.push({
        fullName: (e as KnownRepo).fullName,
        lastSeenAt: (e as KnownRepo).lastSeenAt,
      });
    }
  }
  return out;
}

export async function getKnownRepos(): Promise<KnownRepo[]> {
  const raw = await chrome.storage.local.get(KNOWN_REPOS_KEY);
  return sanitize(raw[KNOWN_REPOS_KEY]);
}

export async function recordKnownRepos(fullNames: readonly string[]): Promise<void> {
  const valid = fullNames.filter(isValidFullName);
  if (valid.length === 0) return;
  const now = Date.now();
  const current = await getKnownRepos();
  const byName = new Map<string, KnownRepo>();
  for (const r of current) byName.set(r.fullName, r);
  for (const fullName of valid) byName.set(fullName, { fullName, lastSeenAt: now });

  let next = Array.from(byName.values()).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  if (next.length > KNOWN_REPOS_CAP) next = next.slice(0, KNOWN_REPOS_CAP);

  await chrome.storage.local.set({ [KNOWN_REPOS_KEY]: next });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/known-repos-store.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/known-repos-store.ts tests/core/known-repos-store.test.ts
git commit -m "feat(core): add known-repos store with LRU cap"
```

---

## Task 2: Record repos after each poll cycle

**Files:**
- Modify: `src/background/poll-cycle.ts`
- Test: `tests/background/poll-cycle.known-repos.test.ts` (new file to keep diff isolated)

- [ ] **Step 1: Locate the scan completion point**

Open `src/background/poll-cycle.ts` and find the function that iterates `items` and parses `fullName` (around line 130 — the loop that calls `parseRepoUrl(item.repository_url)`). The cache update should happen **after** that loop completes for the cycle, not per-item, so a single write per cycle.

- [ ] **Step 2: Write the failing test**

```ts
// tests/background/poll-cycle.known-repos.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getKnownRepos, KNOWN_REPOS_KEY } from '../../src/core/known-repos-store';

// Adjust the import to match poll-cycle's exported entrypoint and test harness used
// by the existing tests/background/poll-cycle.test.ts. Mirror its mock setup.
import { runPollCycleForTest } from '../../src/background/poll-cycle';

let storage: Record<string, unknown>;

beforeEach(() => {
  storage = {};
  // @ts-expect-error - test global
  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn(async (k: string) => ({ [k]: storage[k] })),
        set: vi.fn(async (p: Record<string, unknown>) => Object.assign(storage, p)),
      },
    },
  };
});

describe('poll cycle records known repos', () => {
  it('persists fullNames seen during a cycle', async () => {
    await runPollCycleForTest({
      items: [
        { repository_url: 'https://api.github.com/repos/octo/cat', number: 1 },
        { repository_url: 'https://api.github.com/repos/mona/lisa', number: 2 },
      ],
      // ...other fixtures the existing harness expects
    });
    const repos = (await getKnownRepos()).map((r) => r.fullName).sort();
    expect(repos).toEqual(['mona/lisa', 'octo/cat']);
  });

  it('does not throw if recordKnownRepos fails', async () => {
    const setSpy = vi.spyOn(chrome.storage.local, 'set').mockRejectedValueOnce(new Error('boom'));
    await expect(
      runPollCycleForTest({
        items: [{ repository_url: 'https://api.github.com/repos/octo/cat', number: 1 }],
      }),
    ).resolves.not.toThrow();
    setSpy.mockRestore();
  });
});
```

If `runPollCycleForTest` doesn't exist, examine `tests/background/poll-cycle.test.ts` and use the same entry/harness it uses; rename test imports accordingly. Do NOT introduce a new test entrypoint to production code — reuse what existing tests already drive.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/background/poll-cycle.known-repos.test.ts`
Expected: FAIL — `knownRepos` not present in storage / function not yet wired.

- [ ] **Step 4: Wire `recordKnownRepos` into the poll cycle**

In `src/background/poll-cycle.ts`:

1. Add at the top: `import { recordKnownRepos } from '../core/known-repos-store';`
2. In the function that runs one cycle, accumulate seen names: `const seenFullNames = new Set<string>();`
3. Inside the existing loop after `({ owner, repo, fullName } = parseRepoUrl(item.repository_url));` add: `seenFullNames.add(fullName);`
4. After the loop completes (before the function returns), call:

```ts
try {
  await recordKnownRepos([...seenFullNames]);
} catch (err) {
  console.warn('[auto-rebaser] failed to record known repos', err);
}
```

The try/catch ensures the cache update is best-effort and never breaks the rebase flow.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/background/poll-cycle.known-repos.test.ts tests/background/poll-cycle.test.ts`
Expected: both files PASS. The pre-existing poll-cycle test must remain green.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/background/poll-cycle.ts tests/background/poll-cycle.known-repos.test.ts
git commit -m "feat(background): record scanned repos into known-repos cache"
```

---

## Task 3: Datalist suggestions in `RepoOptOutList`

**Files:**
- Modify: `src/popup/components/RepoOptOutList.tsx`
- Test: `tests/popup/RepoOptOutList.test.tsx` (create if absent)

- [ ] **Step 1: Write the failing test**

```tsx
// tests/popup/RepoOptOutList.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RepoOptOutList } from '../../src/popup/components/RepoOptOutList';

describe('RepoOptOutList autocomplete', () => {
  it('renders a datalist with suggestions sorted by recency', () => {
    render(
      <RepoOptOutList
        label="Skip"
        repos={[]}
        onChange={() => {}}
        suggestions={['octo/cat', 'mona/lisa']}
      />,
    );
    const list = document.querySelector('datalist');
    expect(list).not.toBeNull();
    const opts = Array.from(list!.querySelectorAll('option')).map((o) => o.value);
    expect(opts).toEqual(['octo/cat', 'mona/lisa']);
  });

  it('wires input list= to the datalist id', () => {
    render(
      <RepoOptOutList label="Skip" repos={[]} onChange={() => {}} suggestions={['octo/cat']} />,
    );
    const input = screen.getByLabelText('Skip input') as HTMLInputElement;
    const listId = input.getAttribute('list');
    expect(listId).toBeTruthy();
    expect(document.getElementById(listId!)?.tagName.toLowerCase()).toBe('datalist');
  });

  it('still saves a free-text repo not in suggestions', () => {
    const onChange = vi.fn();
    render(
      <RepoOptOutList label="Skip" repos={[]} onChange={onChange} suggestions={['octo/cat']} />,
    );
    const input = screen.getByLabelText('Skip input');
    fireEvent.change(input, { target: { value: 'brand/new' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onChange).toHaveBeenCalledWith(['brand/new']);
  });

  it('shows inline error for malformed input', () => {
    render(<RepoOptOutList label="Skip" repos={[]} onChange={() => {}} suggestions={[]} />);
    const input = screen.getByLabelText('Skip input');
    fireEvent.change(input, { target: { value: 'bad-name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Use owner/repo format');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/popup/RepoOptOutList.test.tsx`
Expected: FAIL — `suggestions` prop unrecognized; no datalist rendered.

- [ ] **Step 3: Update the component**

Replace the contents of `src/popup/components/RepoOptOutList.tsx` with:

```tsx
import { useId, useState } from 'react';

interface Props {
  label: string;
  repos: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  suggestions?: string[];
}

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

export function RepoOptOutList({
  label,
  repos,
  onChange,
  disabled,
  suggestions = [],
}: Props) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listId = useId();

  const add = () => {
    const trimmed = input.trim();
    if (!REPO_RE.test(trimmed)) {
      setError('Use owner/repo format');
      return;
    }
    if (repos.includes(trimmed)) {
      setError('Already in list');
      return;
    }
    onChange([...repos, trimmed]);
    setInput('');
    setError(null);
  };

  const remove = (repo: string) => {
    onChange(repos.filter((r) => r !== repo));
  };

  const filteredSuggestions = suggestions.filter((s) => !repos.includes(s));

  return (
    <div data-testid="repo-opt-out-list" className="chip-list-wrap">
      <div className="chip-list-wrap__label">{label}</div>
      <div className="chip-list-wrap__row">
        <input
          type="text"
          value={input}
          aria-label={`${label} input`}
          placeholder="owner/repo"
          disabled={disabled}
          list={listId}
          onChange={(e) => {
            setInput(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          className="input input--small"
          style={{ flex: 1 }}
        />
        <datalist id={listId}>
          {filteredSuggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button
          type="button"
          disabled={disabled}
          onClick={add}
          className="btn"
          style={{ marginLeft: 4 }}
        >
          Add
        </button>
      </div>
      {error && (
        <div role="alert" className="alert alert--inline">
          {error}
        </div>
      )}
      {repos.length > 0 && (
        <ul className="chip-list">
          {repos.map((repo) => (
            <li key={repo} className="chip">
              <span>{repo}</span>
              <button
                type="button"
                aria-label={`Remove ${repo}`}
                disabled={disabled}
                onClick={() => remove(repo)}
                className="chip__remove"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/popup/RepoOptOutList.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/popup/components/RepoOptOutList.tsx tests/popup/RepoOptOutList.test.tsx
git commit -m "feat(popup): datalist autocomplete for RepoOptOutList"
```

---

## Task 4: Wire suggestions from the known-repos store into the popup

**Files:**
- Modify: the parent component(s) that render `<RepoOptOutList ... />`. Locate via `grep -rn 'RepoOptOutList' src/popup`. Likely a settings panel inside `src/popup/views/` or `src/popup/components/AutomationsSettings.tsx` based on naming.
- Test: extend the parent's existing test (or add a thin one if none) to assert `suggestions` flows in.

- [ ] **Step 1: Locate parent**

Run: `grep -rn 'RepoOptOutList' src/popup`
Note the file path(s) and line numbers. There may be more than one usage — handle them all.

- [ ] **Step 2: Add a hook that subscribes to known-repos**

Create `src/popup/hooks/useKnownRepos.ts`:

```ts
import { useEffect, useState } from 'react';
import {
  KNOWN_REPOS_KEY,
  type KnownRepo,
  getKnownRepos,
} from '../../core/known-repos-store';

export function useKnownRepos(): string[] {
  const [repos, setRepos] = useState<KnownRepo[]>([]);

  useEffect(() => {
    let cancelled = false;
    getKnownRepos().then((r) => {
      if (!cancelled) setRepos(r);
    });

    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'local' || !(KNOWN_REPOS_KEY in changes)) return;
      const next = changes[KNOWN_REPOS_KEY].newValue as KnownRepo[] | undefined;
      setRepos(Array.isArray(next) ? next : []);
    };

    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  return repos
    .slice()
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .map((r) => r.fullName);
}
```

- [ ] **Step 3: Pass `suggestions` from the parent**

In each file found in Step 1, import and call the hook, then pass its result to every `<RepoOptOutList ... />` render:

```tsx
import { useKnownRepos } from '../hooks/useKnownRepos';
// ...
const knownRepos = useKnownRepos();
// ...
<RepoOptOutList label="Skip" repos={skipRepos} onChange={setSkipRepos} suggestions={knownRepos} />
<RepoOptOutList label="Ignore" repos={ignoreRepos} onChange={setIgnoreRepos} suggestions={knownRepos} />
```

(Adjust the destructured props/state to match what the parent already uses — do not rename existing variables.)

- [ ] **Step 4: Run typecheck and full popup tests**

Run: `npm run typecheck && npx vitest run tests/popup`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/popup/hooks/useKnownRepos.ts <parent-file(s)-from-step-1>
git commit -m "feat(popup): pipe known-repos suggestions into RepoOptOutList"
```

---

## Task 5: First-run scan trigger when cache is empty

**Files:**
- Modify: `src/background/messages.ts` (add a `requestPollNow` message handler if one doesn't already exist — check first).
- Modify: `src/popup/hooks/useKnownRepos.ts`
- Test: extend `tests/popup/useKnownRepos` (create) to assert message is sent when cache empty.

- [ ] **Step 1: Check for an existing one-shot scan message**

Run: `grep -n 'pollNow\|forcePoll\|runScan\|requestScan' src/background/messages.ts src/background/service-worker.ts`

If a one-shot trigger already exists, **reuse it** in Step 3 below — do not add a new one.

- [ ] **Step 2: Write the failing test**

```ts
// tests/popup/useKnownRepos.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useKnownRepos } from '../../src/popup/hooks/useKnownRepos';

beforeEach(() => {
  // @ts-expect-error - test global
  globalThis.chrome = {
    storage: {
      local: { get: vi.fn(async () => ({})) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { sendMessage: vi.fn(async () => undefined) },
  };
});

describe('useKnownRepos first-run scan', () => {
  it('sends a one-shot scan request when cache is empty', async () => {
    renderHook(() => useKnownRepos());
    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: expect.stringMatching(/poll|scan/i) }),
      );
    });
  });

  it('does not request a scan when cache is non-empty', async () => {
    // @ts-expect-error - test override
    chrome.storage.local.get = vi.fn(async () => ({
      knownRepos: [{ fullName: 'octo/cat', lastSeenAt: 1 }],
    }));
    renderHook(() => useKnownRepos());
    await new Promise((r) => setTimeout(r, 10));
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Update the hook**

Edit `src/popup/hooks/useKnownRepos.ts` so that the `getKnownRepos()` resolution branch also fires a one-shot scan when the result is empty:

```ts
getKnownRepos().then((r) => {
  if (cancelled) return;
  setRepos(r);
  if (r.length === 0) {
    // Use the existing message type discovered in Step 1, e.g. { type: 'pollNow' }.
    chrome.runtime.sendMessage({ type: 'pollNow' }).catch(() => {
      // best-effort
    });
  }
});
```

If Step 1 found no existing one-shot scan trigger, add one in `src/background/messages.ts` and `src/background/service-worker.ts`:

```ts
// messages.ts — alongside existing message types
export type PollNowMessage = { type: 'pollNow' };
```

```ts
// service-worker.ts — inside the existing onMessage handler
if (msg.type === 'pollNow') {
  // call the same entrypoint the alarm uses; do not block the sendResponse
  void runPollCycle();
  return;
}
```

(Use whatever the existing alarm-driven entrypoint is named. Do not introduce a new function.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/popup/useKnownRepos.test.tsx tests/background`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/popup/hooks/useKnownRepos.ts src/background/messages.ts src/background/service-worker.ts tests/popup/useKnownRepos.test.tsx
git commit -m "feat(popup): trigger one-shot scan when known-repos cache is empty"
```

---

## Task 6: Suggestion caption & final checks

**Files:**
- Modify: `src/popup/components/RepoOptOutList.tsx`
- Test: extend `tests/popup/RepoOptOutList.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('renders a caption when suggestions are present', () => {
  render(
    <RepoOptOutList label="Skip" repos={[]} onChange={() => {}} suggestions={['octo/cat']} />,
  );
  expect(screen.getByText(/Suggestions come from your open PRs/i)).toBeInTheDocument();
});

it('does not render the caption when suggestions are empty', () => {
  render(<RepoOptOutList label="Skip" repos={[]} onChange={() => {}} suggestions={[]} />);
  expect(screen.queryByText(/Suggestions come from your open PRs/i)).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/popup/RepoOptOutList.test.tsx`
Expected: the two new cases FAIL.

- [ ] **Step 3: Add the caption**

In `src/popup/components/RepoOptOutList.tsx`, immediately under the `<datalist>` (or directly after the row `</div>` containing the input), add:

```tsx
{filteredSuggestions.length > 0 && (
  <div className="chip-list-wrap__hint">Suggestions come from your open PRs.</div>
)}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/popup/RepoOptOutList.test.tsx`
Expected: all PASS.

- [ ] **Step 5: Run the full verify chain**

Run: `npm run typecheck && npm test && npm run lint`
Expected: all green. Fix any failures before committing.

- [ ] **Step 6: Manual smoke (load unpacked extension)**

1. `npm run build` (or the project's dev/build command — see `package.json`).
2. Load `dist/` as an unpacked extension in Chrome.
3. Open the popup → settings → skip-repos input. Confirm the datalist shows repos from your open PRs as you type.
4. Type a deliberately-wrong repo (e.g. `octcat/wrong-name`) — confirm it does NOT appear in suggestions but still saves.
5. Type something invalid (e.g. `notarepo`) — confirm the inline error appears and the entry is rejected.

- [ ] **Step 7: Commit**

```bash
git add src/popup/components/RepoOptOutList.tsx tests/popup/RepoOptOutList.test.tsx
git commit -m "feat(popup): show provenance caption under autocomplete"
```
