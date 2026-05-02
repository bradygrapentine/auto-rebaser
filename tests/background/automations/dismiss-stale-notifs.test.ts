import { describe, it, expect, vi } from 'vitest';
import {
  runDismissStaleNotifs,
  type DismissStaleNotifsSettings,
  type DismissStaleNotifsDeps,
  type NotificationInput,
  type PRStateMap,
} from '../../../src/background/automations/dismiss-stale-notifs';

const on: DismissStaleNotifsSettings = {
  enabled: true,
  unsubscribe: false,
  scopeGranted: true,
  optOutRepos: [],
};

function makeDeps(over: Partial<DismissStaleNotifsDeps> = {}): DismissStaleNotifsDeps {
  return {
    markRead: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

const notif = (over: Partial<NotificationInput> = {}): NotificationInput => ({
  threadId: 'thr_1',
  prApiUrl: 'https://api.github.com/repos/octo/r/pulls/10',
  subjectType: 'PullRequest',
  ...over,
});

describe('runDismissStaleNotifs', () => {
  it('marks closed-PR notification as read', async () => {
    const deps = makeDeps();
    const states: PRStateMap = { 'octo/r#10': 'closed' };
    const r = await runDismissStaleNotifs([notif()], on, states, deps);
    expect(r.dismissed).toBe(1);
    expect(deps.markRead).toHaveBeenCalledWith('thr_1');
    expect(deps.unsubscribe).not.toHaveBeenCalled();
  });

  it('marks merged-PR notification as read', async () => {
    const deps = makeDeps();
    const r = await runDismissStaleNotifs([notif()], on, { 'octo/r#10': 'merged' }, deps);
    expect(r.dismissed).toBe(1);
  });

  it('open PR is left untouched', async () => {
    const deps = makeDeps();
    const r = await runDismissStaleNotifs([notif()], on, { 'octo/r#10': 'open' }, deps);
    expect(r.dismissed).toBe(0);
    expect(r.skipped).toBe(1);
    expect(deps.markRead).not.toHaveBeenCalled();
  });

  it('non-PullRequest subject is skipped', async () => {
    const deps = makeDeps();
    const r = await runDismissStaleNotifs(
      [notif({ subjectType: 'Issue' })],
      on,
      {},
      deps
    );
    expect(r.skipped).toBe(1);
    expect(deps.markRead).not.toHaveBeenCalled();
  });

  it('foreign PR not in user state map is skipped', async () => {
    const deps = makeDeps();
    const r = await runDismissStaleNotifs(
      [notif({ prApiUrl: 'https://api.github.com/repos/other/repo/pulls/1' })],
      on,
      {},
      deps
    );
    expect(r.skipped).toBe(1);
    expect(deps.markRead).not.toHaveBeenCalled();
  });

  it('null prApiUrl skipped', async () => {
    const deps = makeDeps();
    const r = await runDismissStaleNotifs([notif({ prApiUrl: null })], on, {}, deps);
    expect(r.skipped).toBe(1);
  });

  it('non-PR-shaped url skipped', async () => {
    const deps = makeDeps();
    const r = await runDismissStaleNotifs(
      [notif({ prApiUrl: 'https://api.github.com/repos/o/r/issues/1' })],
      on,
      {},
      deps
    );
    expect(r.skipped).toBe(1);
  });

  it('kill-switch off: nothing happens', async () => {
    const deps = makeDeps();
    const r = await runDismissStaleNotifs(
      [notif()],
      { ...on, enabled: false },
      { 'octo/r#10': 'closed' },
      deps
    );
    expect(r.dismissed).toBe(0);
    expect(deps.markRead).not.toHaveBeenCalled();
  });

  it('scope missing: returns scopeMissing flag, no calls', async () => {
    const deps = makeDeps();
    const r = await runDismissStaleNotifs(
      [notif()],
      { ...on, scopeGranted: false },
      { 'octo/r#10': 'closed' },
      deps
    );
    expect(r.scopeMissing).toBe(true);
    expect(deps.markRead).not.toHaveBeenCalled();
  });

  it('unsubscribe sub-setting also unsubscribes', async () => {
    const deps = makeDeps();
    const r = await runDismissStaleNotifs(
      [notif()],
      { ...on, unsubscribe: true },
      { 'octo/r#10': 'merged' },
      deps
    );
    expect(r.dismissed).toBe(1);
    expect(r.unsubscribed).toBe(1);
    expect(deps.unsubscribe).toHaveBeenCalledWith('thr_1');
  });

  it('mark-read failure recorded; sibling still processed', async () => {
    const deps = makeDeps({
      markRead: vi
        .fn()
        .mockRejectedValueOnce(new Error('HTTP_500'))
        .mockResolvedValue(undefined),
    });
    const r = await runDismissStaleNotifs(
      [
        notif({ threadId: 'a' }),
        notif({ threadId: 'b', prApiUrl: 'https://api.github.com/repos/octo/r/pulls/11' }),
      ],
      on,
      { 'octo/r#10': 'closed', 'octo/r#11': 'closed' },
      deps
    );
    expect(r.dismissed).toBe(1);
    expect(r.failed).toEqual([{ threadId: 'a', error: 'HTTP_500' }]);
  });

  it('unsubscribe failure recorded but markRead success still counts', async () => {
    const deps = makeDeps({
      unsubscribe: vi.fn().mockRejectedValue(new Error('HTTP_500')),
    });
    const r = await runDismissStaleNotifs(
      [notif()],
      { ...on, unsubscribe: true },
      { 'octo/r#10': 'merged' },
      deps
    );
    expect(r.dismissed).toBe(1);
    expect(r.unsubscribed).toBe(0);
    expect(r.failed[0].error).toMatch(/^unsubscribe: HTTP_500/);
  });

  it('non-Error markRead rejection is stringified', async () => {
    const deps = makeDeps({
      markRead: vi.fn().mockRejectedValue('boom'),
    });
    const r = await runDismissStaleNotifs(
      [notif()],
      on,
      { 'octo/r#10': 'merged' },
      deps
    );
    expect(r.failed).toEqual([{ threadId: 'thr_1', error: 'boom' }]);
  });

  it('non-Error unsubscribe rejection is stringified', async () => {
    const deps = makeDeps({
      unsubscribe: vi.fn().mockRejectedValue(123),
    });
    const r = await runDismissStaleNotifs(
      [notif()],
      { ...on, unsubscribe: true },
      { 'octo/r#10': 'merged' },
      deps
    );
    expect(r.failed[0].error).toBe('unsubscribe: 123');
  });
});
