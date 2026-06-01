// CHARACTERIZATION WALL (PREVIEW-1 T0) — resolve-obsolete-threads.
//
// Pins the EXACT obsolete-detection truth table + bookkeeping of
// `runResolveObsoleteThreads` against the current logic, as hard literals, BEFORE
// T1 factors the decision into `decideResolveObsoleteThreads`. Uses the module's
// injectable `now()` (default Date.now) to pin store-stamp timestamps
// deterministically. Drives the REAL module; only `listThreads`/`resolveThread`
// are spies.
import { describe, it, expect, vi } from 'vitest';
import {
  runResolveObsoleteThreads,
  type ReviewThread,
  type PRRef,
  type ResolveObsoleteThreadsDeps,
} from '../../../../src/background/automations/resolve-obsolete-threads';

const NOW = 1_700_000_000_000;
const now = () => NOW;

function thread(over: Partial<ReviewThread> = {}): ReviewThread {
  // The obsolete predicate: !isResolved && isOutdated && line === null && !store[id]
  return { id: 't1', isResolved: false, isOutdated: true, line: null, ...over };
}

const ref: PRRef = { repo: 'owner/repo', number: 7 };

describe('CHAR resolve-obsolete-threads — obsolete truth table + bookkeeping literals', () => {
  it('obsolete thread (all four conditions) → resolved++, store stamped at now(), resolvedEntries', async () => {
    const resolveThread = vi.fn().mockResolvedValue(undefined);
    const listThreads = vi.fn().mockResolvedValue([thread({ id: 'OBS' })]);
    const deps: ResolveObsoleteThreadsDeps = { listThreads, resolveThread };

    const result = await runResolveObsoleteThreads([ref], { enabled: true, optOutRepos: [] }, {}, deps, now);

    expect(result).toEqual({
      resolved: 1,
      skipped: 0,
      failed: [],
      resolvedStore: { OBS: NOW },
      resolvedEntries: [{ threadId: 'OBS', repo: 'owner/repo', prNumber: 7 }],
      failedEntries: [],
    });
    expect(resolveThread).toHaveBeenCalledWith('OBS');
  });

  it('NON-obsolete variants each skip (isResolved / !isOutdated / line!=null / already-in-store)', async () => {
    const resolveThread = vi.fn();
    const listThreads = vi.fn().mockResolvedValue([
      thread({ id: 'a', isResolved: true }), // already resolved
      thread({ id: 'b', isOutdated: false }), // not outdated
      thread({ id: 'c', line: 5 }), // anchor line still exists
    ]);
    const result = await runResolveObsoleteThreads(
      [ref],
      { enabled: true, optOutRepos: [] },
      { d: 123 }, // pre-seeded store entry 'd' (not in this thread list)
      { listThreads, resolveThread },
      now,
    );

    expect(result).toEqual({
      resolved: 0,
      skipped: 3,
      failed: [],
      resolvedStore: { d: 123 },
      resolvedEntries: [],
      failedEntries: [],
    });
    expect(resolveThread).not.toHaveBeenCalled();
  });

  it('store-already-seen → skipped (no re-resolve), store unchanged', async () => {
    const resolveThread = vi.fn();
    const listThreads = vi.fn().mockResolvedValue([thread({ id: 'SEEN' })]);
    const result = await runResolveObsoleteThreads(
      [ref],
      { enabled: true, optOutRepos: [] },
      { SEEN: 999 },
      { listThreads, resolveThread },
      now,
    );

    expect(result).toEqual({
      resolved: 0,
      skipped: 1,
      failed: [],
      resolvedStore: { SEEN: 999 },
      resolvedEntries: [],
      failedEntries: [],
    });
    expect(resolveThread).not.toHaveBeenCalled();
  });

  it('opt-out repo → PR skipped entirely, listThreads never called (no skipped++ — continue before loop)', async () => {
    const resolveThread = vi.fn();
    const listThreads = vi.fn();
    const result = await runResolveObsoleteThreads(
      [{ repo: 'owner/optout', number: 1 }],
      { enabled: true, optOutRepos: ['owner/optout'] },
      {},
      { listThreads, resolveThread },
      now,
    );

    expect(result).toEqual({
      resolved: 0,
      skipped: 0, // opt-out `continue` happens BEFORE the per-thread loop — no skipped tally
      failed: [],
      resolvedStore: {},
      resolvedEntries: [],
      failedEntries: [],
    });
    expect(listThreads).not.toHaveBeenCalled();
  });

  it('listThreads throws → failed entry keyed `${repo}#${number}`, PR skipped, NO failedEntries', async () => {
    const resolveThread = vi.fn();
    const listThreads = vi.fn().mockRejectedValue(new Error('list-fail'));
    const result = await runResolveObsoleteThreads(
      [ref],
      { enabled: true, optOutRepos: [] },
      {},
      { listThreads, resolveThread },
      now,
    );

    expect(result).toEqual({
      resolved: 0,
      skipped: 0,
      failed: [{ threadId: 'owner/repo#7', error: 'list-fail' }],
      resolvedStore: {},
      resolvedEntries: [],
      failedEntries: [],
    });
  });

  it('resolveThread throws → failed + failedEntries, store NOT stamped (stamp only on success)', async () => {
    const resolveThread = vi.fn().mockRejectedValue(new Error('resolve-fail'));
    const listThreads = vi.fn().mockResolvedValue([thread({ id: 'OBS' })]);
    const result = await runResolveObsoleteThreads([ref], { enabled: true, optOutRepos: [] }, {}, { listThreads, resolveThread }, now);

    expect(result).toEqual({
      resolved: 0,
      skipped: 0,
      failed: [{ threadId: 'OBS', error: 'resolve-fail' }],
      resolvedStore: {}, // NOT stamped — the store update is after the await that threw
      resolvedEntries: [],
      failedEntries: [{ threadId: 'OBS', repo: 'owner/repo', prNumber: 7, error: 'resolve-fail' }],
    });
  });

  it('disabled → no-op empty result, deps untouched', async () => {
    const resolveThread = vi.fn();
    const listThreads = vi.fn();
    const result = await runResolveObsoleteThreads([ref], { enabled: false, optOutRepos: [] }, { x: 1 }, { listThreads, resolveThread }, now);

    expect(result).toEqual({
      resolved: 0,
      skipped: 0,
      failed: [],
      resolvedStore: { x: 1 },
      resolvedEntries: [],
      failedEntries: [],
    });
    expect(listThreads).not.toHaveBeenCalled();
  });
});
