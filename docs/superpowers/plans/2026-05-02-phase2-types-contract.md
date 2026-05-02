# Phase 2 — Type Contract
_The shared interface both Part A and Part B compile against._

This document defines the exact shapes that bridge Part A's storage layer and Part B's UI. It is the single source of truth — neither part may unilaterally change a name or shape here without re-syncing the other.

---

## 1. Settings extension

Phase 2 adds these fields. Stored in `chrome.storage.sync` under a **separate key** (`automation_settings`) to avoid touching v1's `settings-store.ts`.

```ts
// src/core/automations-types.ts (Part A creates)

export type MergeMethod = 'SQUASH' | 'MERGE' | 'REBASE';

export interface AutomationSettings {
  autoDeleteMergedBranch: boolean;
  autoDeleteOptOutRepos: string[];

  autoEnableAutoMerge: boolean;
  autoMergeMethod: MergeMethod;
  autoMergeOptOutRepos: string[];

  autoResolveOutdatedThreads: boolean;

  autoDismissStaleNotifications: boolean;
  unsubscribeStalePRNotifications: boolean;
  /** True when the OAuth token was minted with the `notifications` scope. */
  notificationsScopeGranted: boolean;
}

export const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
  autoDeleteMergedBranch: true,           // safe default per backlog 2.6
  autoDeleteOptOutRepos: [],
  autoEnableAutoMerge: false,             // opt-in per backlog 2.7
  autoMergeMethod: 'SQUASH',
  autoMergeOptOutRepos: [],
  autoResolveOutdatedThreads: false,      // opt-in per backlog 2.8
  autoDismissStaleNotifications: false,   // opt-in per backlog 2.9
  unsubscribeStalePRNotifications: false,
  notificationsScopeGranted: false,
};
```

## 2. PRRecord extension

Phase 2 adds these optional fields. Existing v1 `PRRecord` shape unchanged.

```ts
// src/core/automations-types.ts

export type PhaseTwoPRState =
  | 'branch-deleted'
  | 'delete-failed'
  | 'automerge-unsupported';

export interface PRRecordPhaseTwo {
  /** GraphQL node_id for GraphQL mutations. Populated when poll fetches PR detail. */
  nodeId?: string;
  /** True after Story 2.6 successfully deletes the head branch. */
  branchDeleted?: boolean;
  /** True after Story 2.7 successfully enables auto-merge on this PR. */
  autoMergeEnabled?: boolean;
  /** True after Story 2.7 records that the repo rejected the merge method. */
  autoMergeUnsupported?: boolean;
  /** PR head branch name — needed for Story 2.6. */
  headRef?: string;
  /** True when head and base repos are identical (not a fork). */
  sameRepo?: boolean;
  /** Most recent merged_at from GitHub. Used to detect open→merged transitions. */
  mergedAt?: number;
  /** PR draft status, needed for Story 2.7. */
  isDraft?: boolean;
}
```

The runtime `PRRecord` stored in `pr_store` will have `state: PRState | PhaseTwoPRState` once Part A extends the union. Until then, narrowed casts work.

## 3. ResolvedThreadsStore

```ts
// src/core/automations-types.ts

/** threadId → epoch ms when we auto-resolved it. Skip if already in this map. */
export type ResolvedThreadsStore = Record<string, number>;
```

## 4. Storage keys

Add to `src/core/automations-constants.ts` (NEW — does not modify v1's `constants.ts`):

```ts
export const AUTOMATION_STORAGE_KEYS = {
  /** chrome.storage.sync — AutomationSettings. */
  settings: 'automation_settings',
  /** chrome.storage.local — ResolvedThreadsStore. */
  resolvedThreads: 'resolved_threads',
} as const;
```

## 5. PollSummary

The shape persisted in `pr_store.lastPollSummary` after each poll cycle. Part A produces it; Part B reads it.

```ts
// src/core/automations-types.ts

export interface PollSummary {
  /** Epoch ms of the cycle that produced this summary. */
  ranAt: number;
  rebased: number;
  branchesDeleted: number;
  autoMergeEnabled: number;
  threadsResolved: number;
  notificationsDismissed: number;
  errors: number;
}
```

## 6. automations-store.ts contract

Part A creates `src/core/automations-store.ts` with these exact signatures. Part B calls them.

```ts
// src/core/automations-store.ts

import type { AutomationSettings, ResolvedThreadsStore } from './automations-types';

export function getAutomationSettings(): Promise<AutomationSettings>;
export function saveAutomationSettings(s: AutomationSettings): Promise<void>;

export function getResolvedThreads(): Promise<ResolvedThreadsStore>;
export function saveResolvedThreads(s: ResolvedThreadsStore): Promise<void>;
```

Behavior:
- `getAutomationSettings` returns `DEFAULT_AUTOMATION_SETTINGS` merged with whatever is stored (forward-compatible).
- `saveAutomationSettings` overwrites the stored object.
- `getResolvedThreads` returns `{}` if nothing stored.
- `saveResolvedThreads` overwrites.

## 7. Mock module path (for Part B isolation)

When Part B's tests need to stub Part A's storage layer:

```ts
import { vi } from 'vitest';
vi.mock('../../src/core/automations-store', () => ({
  getAutomationSettings: vi.fn().mockResolvedValue(DEFAULT_AUTOMATION_SETTINGS),
  saveAutomationSettings: vi.fn().mockResolvedValue(undefined),
  getResolvedThreads: vi.fn().mockResolvedValue({}),
  saveResolvedThreads: vi.fn().mockResolvedValue(undefined),
}));
```

This means Part B tests pass even if Part A hasn't merged yet — the file just needs to exist as an empty stub on Part B's branch:

```ts
// src/core/automations-store.ts (Part B's temporary stub if Part A is delayed)
export const getAutomationSettings = () => Promise.reject(new Error('not yet implemented'));
// ...other stubs
```

At integration time, Part A's real implementation replaces the stub in a clean diff.
