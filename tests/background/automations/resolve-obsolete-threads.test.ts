import { describe, it, expect, vi } from 'vitest';
import {
  runResolveObsoleteThreads,
  type ResolveObsoleteThreadsSettings,
  type ResolveObsoleteThreadsDeps,
  type ReviewThread,
  type ResolvedThreadsStore,
} from '../../../src/background/automations/resolve-obsolete-threads';

const on: ResolveObsoleteThreadsSettings = { enabled: true, optOutRepos: [] };
const NOW = 1714680000000;
const now = () => NOW;

function makeDeps(threads: ReviewThread[]): ResolveObsoleteThreadsDeps {
  return {
    listThreads: vi.fn().mockResolvedValue(threads),
    resolveThread: vi.fn().mockResolvedValue(undefined),
  };
}

const t = (over: Partial<ReviewThread>): ReviewThread => ({
  id: 'thr_1',
  isResolved: false,
  isOutdated: true,
  line: null,
  ...over,
});

describe('runResolveObsoleteThreads', () => {
  it('resolves obsolete threads (outdated && line=null && unresolved)', async () => {
    const deps = makeDeps([t({})]);
    const r = await runResolveObsoleteThreads(
      [{ repo: 'o/r', number: 1 }],
      on,
      {},
      deps,
      now
    );
    expect(r.resolved).toBe(1);
    expect(r.resolvedStore).toEqual({ thr_1: NOW });
    expect(deps.resolveThread).toHaveBeenCalledWith('thr_1');
  });

  it('outdated but anchored (line != null) is not auto-resolved', async () => {
    const deps = makeDeps([t({ id: 'a', line: 42 })]);
    const r = await runResolveObsoleteThreads(
      [{ repo: 'o/r', number: 1 }],
      on,
      {},
      deps,
      now
    );
    expect(r.resolved).toBe(0);
    expect(r.skipped).toBe(1);
    expect(deps.resolveThread).not.toHaveBeenCalled();
  });

  it('already-resolved thread is skipped', async () => {
    const deps = makeDeps([t({ id: 'a', isResolved: true })]);
    const r = await runResolveObsoleteThreads(
      [{ repo: 'o/r', number: 1 }],
      on,
      {},
      deps,
      now
    );
    expect(r.resolved).toBe(0);
    expect(deps.resolveThread).not.toHaveBeenCalled();
  });

  it('threads in resolvedStore are not re-resolved (manual unresolve respected)', async () => {
    const deps = makeDeps([t({ id: 'thr_1' })]);
    const store: ResolvedThreadsStore = { thr_1: NOW - 1000 };
    const r = await runResolveObsoleteThreads(
      [{ repo: 'o/r', number: 1 }],
      on,
      store,
      deps,
      now
    );
    expect(r.resolved).toBe(0);
    expect(deps.resolveThread).not.toHaveBeenCalled();
  });

  it('kill-switch off: no calls', async () => {
    const deps = makeDeps([t({})]);
    const r = await runResolveObsoleteThreads(
      [{ repo: 'o/r', number: 1 }],
      { enabled: false, optOutRepos: [] },
      {},
      deps,
      now
    );
    expect(r.resolved).toBe(0);
    expect(deps.listThreads).not.toHaveBeenCalled();
  });

  it('individual mutation failure does not block siblings', async () => {
    const deps: ResolveObsoleteThreadsDeps = {
      listThreads: vi.fn().mockResolvedValue([t({ id: 'a' }), t({ id: 'b' })]),
      resolveThread: vi
        .fn()
        .mockRejectedValueOnce(new Error('RATE_LIMITED'))
        .mockResolvedValue(undefined),
    };
    const r = await runResolveObsoleteThreads(
      [{ repo: 'o/r', number: 1 }],
      on,
      {},
      deps,
      now
    );
    expect(r.resolved).toBe(1);
    expect(r.failed).toEqual([{ threadId: 'a', error: 'RATE_LIMITED' }]);
    expect(r.resolvedStore).toEqual({ b: NOW });
  });

  it('listThreads failure: PR-level error, other PRs still scanned', async () => {
    const deps: ResolveObsoleteThreadsDeps = {
      listThreads: vi
        .fn()
        .mockRejectedValueOnce(new Error('AUTH_ERROR'))
        .mockResolvedValue([t({ id: 'b' })]),
      resolveThread: vi.fn().mockResolvedValue(undefined),
    };
    const r = await runResolveObsoleteThreads(
      [
        { repo: 'a/x', number: 1 },
        { repo: 'a/y', number: 2 },
      ],
      on,
      {},
      deps,
      now
    );
    expect(r.resolved).toBe(1);
    expect(r.failed[0].error).toBe('AUTH_ERROR');
  });

  it('optOutRepos: matching repo is skipped entirely', async () => {
    const deps = makeDeps([t({})]);
    const r = await runResolveObsoleteThreads(
      [{ repo: 'o/r', number: 1 }],
      { enabled: true, optOutRepos: ['o/r'] },
      {},
      deps,
      now
    );
    expect(r.resolved).toBe(0);
    expect(deps.listThreads).not.toHaveBeenCalled();
  });

  it('listThreads throws non-Error: stringifies the value', async () => {
    const deps: ResolveObsoleteThreadsDeps = {
      listThreads: vi.fn().mockRejectedValue('boom-string'),
      resolveThread: vi.fn(),
    };
    const r = await runResolveObsoleteThreads(
      [{ repo: 'o/r', number: 1 }],
      on,
      {},
      deps,
      now
    );
    expect(r.failed[0].error).toBe('boom-string');
  });

  it('resolveThread throws non-Error: stringifies the value', async () => {
    const deps: ResolveObsoleteThreadsDeps = {
      listThreads: vi.fn().mockResolvedValue([t({ id: 'a' })]),
      resolveThread: vi.fn().mockRejectedValue({ code: 500 }),
    };
    const r = await runResolveObsoleteThreads(
      [{ repo: 'o/r', number: 1 }],
      on,
      {},
      deps,
      now
    );
    expect(r.failed[0].threadId).toBe('a');
    expect(r.failed[0].error).toBe('[object Object]');
  });

  it('empty thread list yields 0 / 0', async () => {
    const deps = makeDeps([]);
    const r = await runResolveObsoleteThreads(
      [{ repo: 'o/r', number: 1 }],
      on,
      {},
      deps,
      now
    );
    expect(r.resolved).toBe(0);
    expect(r.failed).toEqual([]);
  });
});
