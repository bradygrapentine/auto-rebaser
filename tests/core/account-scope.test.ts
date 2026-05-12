// T1 acceptance — AccountScope methods delegate 1-line to the matching
// `*For(accountId, ...)` helper. The brand on AccountId is type-only; runtime
// asserts focus on the call shape.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks. Each method on AccountScope must dispatch to one of these.
vi.mock('../../src/core/pr-store', () => ({
  loadStoreFor: vi.fn().mockResolvedValue({ prs: [], lastPollAt: null }),
  saveStoreFor: vi.fn().mockResolvedValue(undefined),
  upsertPRsFor: vi.fn().mockResolvedValue({ prs: [], lastPollAt: null }),
  pruneStaleFor: vi.fn().mockResolvedValue({ prs: [], lastPollAt: null }),
  stampPollTimeFor: vi.fn().mockResolvedValue({ prs: [], lastPollAt: null }),
  loadReviewerStoreFor: vi.fn().mockResolvedValue({ prs: [], lastPollAt: null }),
  saveReviewerStoreFor: vi.fn().mockResolvedValue(undefined),
  upsertReviewerPRsFor: vi.fn().mockResolvedValue({ prs: [], lastPollAt: null }),
}));

vi.mock('../../src/core/activity-log', () => ({
  appendActivityFor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/automations-store', () => ({
  getAutomationSettingsFor: vi.fn().mockResolvedValue({}),
  getResolvedThreadsFor: vi.fn().mockResolvedValue({}),
  saveResolvedThreadsFor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/auth-store', () => ({
  getAuthFor: vi.fn().mockResolvedValue(null),
  setAuthGitHubAppFor: vi.fn().mockResolvedValue(undefined),
  setInstallationsFor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/ping-throttle', () => ({
  getPingedStoreFor: vi.fn().mockResolvedValue({}),
  recordPingFor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/rerequest-throttle', () => ({
  getRerequestStoreFor: vi.fn().mockResolvedValue({}),
  recordRerequestFor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/known-repos-store', () => ({
  recordKnownReposFor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/storage/multi-account', async (orig) => {
  const real = await orig<typeof import('../../src/core/storage/multi-account')>();
  return {
    ...real,
    setAccountState: vi.fn().mockResolvedValue(undefined),
  };
});

import { AccountScope } from '../../src/core/account-scope';
import { asAccountId, setAccountState } from '../../src/core/storage/multi-account';
import * as prStore from '../../src/core/pr-store';
import * as activity from '../../src/core/activity-log';
import * as autos from '../../src/core/automations-store';
import * as auth from '../../src/core/auth-store';
import * as ping from '../../src/core/ping-throttle';
import * as rer from '../../src/core/rerequest-throttle';
import * as known from '../../src/core/known-repos-store';

const ID = asAccountId('gh_test');

beforeEach(() => { vi.clearAllMocks(); });

describe('AccountScope — 1-line delegation contract', () => {
  it('PRStore methods route through *For with this.id', async () => {
    const s = new AccountScope(ID);
    await s.loadStore();
    await s.saveStore({ prs: [], lastPollAt: 1 });
    await s.upsertPRs([]);
    await s.pruneStale([1, 2]);
    await s.stampPollTime(42);
    expect(prStore.loadStoreFor).toHaveBeenCalledWith(ID);
    expect(prStore.saveStoreFor).toHaveBeenCalledWith(ID, { prs: [], lastPollAt: 1 });
    expect(prStore.upsertPRsFor).toHaveBeenCalledWith(ID, []);
    expect(prStore.pruneStaleFor).toHaveBeenCalledWith(ID, [1, 2]);
    expect(prStore.stampPollTimeFor).toHaveBeenCalledWith(ID, 42);
  });

  it('Reviewer-PRStore methods route through *For with this.id', async () => {
    const s = new AccountScope(ID);
    await s.loadReviewerStore();
    await s.saveReviewerStore({ prs: [], lastPollAt: null });
    await s.upsertReviewerPRs([]);
    expect(prStore.loadReviewerStoreFor).toHaveBeenCalledWith(ID);
    expect(prStore.saveReviewerStoreFor).toHaveBeenCalledWith(ID, { prs: [], lastPollAt: null });
    expect(prStore.upsertReviewerPRsFor).toHaveBeenCalledWith(ID, []);
  });

  it('auth methods route through *For with this.id', async () => {
    const s = new AccountScope(ID);
    await s.getAuth();
    await s.setInstallations([]);
    expect(auth.getAuthFor).toHaveBeenCalledWith(ID);
    expect(auth.setInstallationsFor).toHaveBeenCalledWith(ID, []);
  });

  it('automations methods route through *For with this.id', async () => {
    const s = new AccountScope(ID);
    await s.getAutomationSettings();
    await s.getResolvedThreads();
    await s.saveResolvedThreads({});
    expect(autos.getAutomationSettingsFor).toHaveBeenCalledWith(ID);
    expect(autos.getResolvedThreadsFor).toHaveBeenCalledWith(ID);
    expect(autos.saveResolvedThreadsFor).toHaveBeenCalledWith(ID, {});
  });

  it('throttle methods route through *For with this.id', async () => {
    const s = new AccountScope(ID);
    await s.getPingedStore();
    await s.recordPing(7);
    await s.getRerequestStore();
    await s.recordRerequest(7);
    expect(ping.getPingedStoreFor).toHaveBeenCalledWith(ID);
    expect(ping.recordPingFor).toHaveBeenCalledWith(ID, 7, undefined);
    expect(rer.getRerequestStoreFor).toHaveBeenCalledWith(ID);
    expect(rer.recordRerequestFor).toHaveBeenCalledWith(ID, 7, undefined);
  });

  it('misc methods route through *For with this.id', async () => {
    const s = new AccountScope(ID);
    await s.appendActivity([]);
    await s.recordKnownRepos(['octo/cat']);
    await s.setActionableCount(3);
    expect(activity.appendActivityFor).toHaveBeenCalledWith(ID, []);
    expect(known.recordKnownReposFor).toHaveBeenCalledWith(ID, ['octo/cat']);
    expect(setAccountState).toHaveBeenCalledWith(ID, 'actionable_count', 3);
  });

  it('id field is exposed for callers that need to pass it onwards', () => {
    const s = new AccountScope(ID);
    expect(s.id).toBe(ID);
  });
});

describe('AccountId brand', () => {
  it('asAccountId is the only chokepoint for unbranded string → AccountId', () => {
    const raw = 'gh_test';
    const branded = asAccountId(raw);
    // Runtime value unchanged; brand is type-only.
    expect(branded).toBe(raw);
  });
});
