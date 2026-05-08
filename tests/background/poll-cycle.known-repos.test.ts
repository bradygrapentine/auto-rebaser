import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/github/endpoints', () => ({
  searchAuthoredPRs: vi.fn(),
  getPR: vi.fn(),
  updateBranch: vi.fn(),
}));

vi.mock('../../src/core/pr-store', () => ({
  loadStore: vi.fn(),
  saveStore: vi.fn().mockResolvedValue(undefined),
  upsertPRs: vi.fn().mockResolvedValue(undefined),
  pruneStale: vi.fn().mockResolvedValue(undefined),
  stampPollTime: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/background/badge', () => ({
  setBadgeCount: vi.fn(),
  clearBadge: vi.fn(),
}));

vi.mock('../../src/core/automations-store', () => ({
  getAutomationSettings: vi.fn(),
  getResolvedThreads: vi.fn(),
  saveResolvedThreads: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/background/automations/orchestrator', () => ({
  runAllAutomations: vi.fn(),
}));

vi.mock('../../src/core/activity-log', () => ({
  appendActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/known-repos-store', () => ({
  recordKnownRepos: vi.fn().mockResolvedValue(undefined),
}));

import { runPollCycle } from '../../src/background/poll-cycle';
import { searchAuthoredPRs, getPR } from '../../src/github/endpoints';
import { loadStore, upsertPRs, pruneStale, stampPollTime } from '../../src/core/pr-store';
import { getAutomationSettings, getResolvedThreads } from '../../src/core/automations-store';
import { runAllAutomations } from '../../src/background/automations/orchestrator';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../src/core/automations-types';
import type { PRStore, PullRequest } from '../../src/core/types';
import { recordKnownRepos } from '../../src/core/known-repos-store';

const EMPTY_STORE: PRStore = { prs: [], lastPollAt: null };

function makePR(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: 100,
    number: 1,
    title: 'Test PR',
    html_url: 'https://github.com/org/repo/pull/1',
    mergeable_state: 'clean',
    base: { repo: { full_name: 'org/repo' } },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue({ ...EMPTY_STORE });
  (upsertPRs as ReturnType<typeof vi.fn>).mockResolvedValue(EMPTY_STORE);
  (pruneStale as ReturnType<typeof vi.fn>).mockResolvedValue(EMPTY_STORE);
  (stampPollTime as ReturnType<typeof vi.fn>).mockResolvedValue(EMPTY_STORE);
  (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({ ...DEFAULT_AUTOMATION_SETTINGS });
  (getResolvedThreads as ReturnType<typeof vi.fn>).mockResolvedValue({});
  (runAllAutomations as ReturnType<typeof vi.fn>).mockResolvedValue({
    summary: { ranAt: 1000, rebased: 0, branchesDeleted: 0, autoMergeEnabled: 0, threadsResolved: 0, errors: 0 },
    prUpdates: [],
    resolvedThreads: {},
  });
  (recordKnownRepos as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

describe('known-repos recording', () => {
  it('records seen repos after a successful scan', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [
        { id: 1, number: 1, title: 'PR 1', html_url: 'https://github.com/octo/cat/pull/1',
          repository_url: 'https://api.github.com/repos/octo/cat' },
        { id: 2, number: 2, title: 'PR 2', html_url: 'https://github.com/mona/lisa/pull/2',
          repository_url: 'https://api.github.com/repos/mona/lisa' },
      ],
    });
    (getPR as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makePR({ id: 1, number: 1, mergeable_state: 'clean' }))
      .mockResolvedValueOnce(makePR({ id: 2, number: 2, mergeable_state: 'clean' }));

    await runPollCycle();

    expect(recordKnownRepos).toHaveBeenCalledTimes(1);
    const arg: readonly string[] = (recordKnownRepos as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg).toContain('octo/cat');
    expect(arg).toContain('mona/lisa');
  });

  it('does not throw if recordKnownRepos fails', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [
        { id: 1, number: 1, title: 'PR 1', html_url: 'https://github.com/octo/cat/pull/1',
          repository_url: 'https://api.github.com/repos/octo/cat' },
      ],
    });
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR({ id: 1, number: 1, mergeable_state: 'clean' })
    );
    (recordKnownRepos as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));

    await expect(runPollCycle()).resolves.toBeUndefined();
  });
});
