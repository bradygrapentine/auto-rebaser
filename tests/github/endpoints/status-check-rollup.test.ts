// CT-2 — getPRStatusRollup endpoint. Fixtures are REAL responses captured
// 2026-06-01 via `gh api graphql` against this repo's PRs (path/shape pinned as
// hard literals, NOT a same-codepath round-trip):
//   PR #237 → {"data":{"node":{"number":237,"commits":{"nodes":[{"commit":{"statusCheckRollup":{"state":"SUCCESS"}}}]}}}}
//   PR #195 → {"data":{"node":{"number":195,"commits":{"nodes":[{"commit":{"statusCheckRollup":{"state":"FAILURE"}}}]}}}}
// The no-checks (`statusCheckRollup: null`) shape is from GitHub's GraphQL schema
// (a commit with no checks/statuses configured) — structurally proven by the two
// live captures above, only the leaf differs.
//
// TRIAGE-2 — `statusCheckRollup.contexts` union shape captured 2026-06-01 via
// `gh api graphql` against PR #209 (rollup state FAILURE):
//   CheckRun → {"__typename":"CheckRun","name":"OSV Scanner","conclusion":"FAILURE",
//     "detailsUrl":"https://github.com/bradygrapentine/auto-rebaser/actions/runs/26649118437/job/78542568975"}
// This repo is all-GitHub-Actions, so live contexts are CheckRun-only; the
// StatusContext branch shape ({context,state,targetUrl}) is SCHEMA-SOURCED from
// GitHub's published GraphQL `StatusContext` type (same discipline as the
// no-checks leaf above) and annotated as such in the fixtures below.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPRStatusRollup,
  getPRStatusRollupDetail,
} from '../../../src/github/endpoints/status-check-rollup';
import * as http from '../../../src/github/http';

beforeEach(() => {
  vi.spyOn(http, 'request');
});

describe('getPRStatusRollup', () => {
  it('returns the rollup state from the GraphQL node payload (live SUCCESS fixture, PR #237)', async () => {
    vi.mocked(http.request).mockResolvedValue({
      data: { node: { commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] } } },
    });
    await expect(getPRStatusRollup('PR_kwDOSSwInM7hSgZw')).resolves.toBe('SUCCESS');
  });

  it('returns FAILURE from the live failing fixture (PR #195)', async () => {
    vi.mocked(http.request).mockResolvedValue({
      data: { node: { commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } }] } } },
    });
    await expect(getPRStatusRollup('PR_195')).resolves.toBe('FAILURE');
  });

  it('returns null when the last commit has no checks (statusCheckRollup null)', async () => {
    vi.mocked(http.request).mockResolvedValue({
      data: { node: { commits: { nodes: [{ commit: { statusCheckRollup: null } }] } } },
    });
    await expect(getPRStatusRollup('PR_no_checks')).resolves.toBeNull();
  });

  it('returns null when node is null (PR not found / no access)', async () => {
    vi.mocked(http.request).mockResolvedValue({ data: { node: null } });
    await expect(getPRStatusRollup('PR_missing')).resolves.toBeNull();
  });

  it('returns null when commits.nodes is empty (no commits)', async () => {
    vi.mocked(http.request).mockResolvedValue({
      data: { node: { commits: { nodes: [] } } },
    });
    await expect(getPRStatusRollup('PR_empty')).resolves.toBeNull();
  });

  it('forwards the prId variable to the GraphQL request', async () => {
    vi.mocked(http.request).mockResolvedValue({
      data: { node: { commits: { nodes: [{ commit: { statusCheckRollup: { state: 'PENDING' } } }] } } },
    });
    await getPRStatusRollup('PR_abc');
    const [, opts] = vi.mocked(http.request).mock.calls[0]!;
    const body = JSON.parse(opts!.body as string) as { variables: { prId: string } };
    expect(body.variables.prId).toBe('PR_abc');
  });
});

// Helper to wrap a contexts-nodes array into the full rollup response shape.
function rollupWith(state: string | null, nodes: unknown[]) {
  return {
    data: {
      node: {
        commits: { nodes: [{ commit: { statusCheckRollup: state === null ? null : { state, contexts: { nodes } } } }] },
      },
    },
  };
}

describe('getPRStatusRollupDetail', () => {
  it('extracts a failing CheckRun as { name, url } (real #209 OSV Scanner capture)', async () => {
    vi.mocked(http.request).mockResolvedValue(
      rollupWith('FAILURE', [
        { __typename: 'CheckRun', name: 'test', conclusion: 'SUCCESS', detailsUrl: 'https://github.com/o/r/runs/2' },
        {
          __typename: 'CheckRun',
          name: 'OSV Scanner',
          conclusion: 'FAILURE',
          detailsUrl: 'https://github.com/bradygrapentine/auto-rebaser/actions/runs/26649118437/job/78542568975',
        },
      ]),
    );
    const detail = await getPRStatusRollupDetail('PR_209');
    expect(detail.state).toBe('FAILURE');
    expect(detail.failures).toEqual([
      {
        name: 'OSV Scanner',
        url: 'https://github.com/bradygrapentine/auto-rebaser/actions/runs/26649118437/job/78542568975',
      },
    ]);
  });

  it('extracts a failing StatusContext as { name: context, url: targetUrl } (schema-sourced)', async () => {
    vi.mocked(http.request).mockResolvedValue(
      rollupWith('FAILURE', [
        { __typename: 'StatusContext', context: 'ci/legacy', state: 'FAILURE', targetUrl: 'https://github.com/o/r/status' },
      ]),
    );
    const detail = await getPRStatusRollupDetail('PR_sc');
    expect(detail.failures).toEqual([{ name: 'ci/legacy', url: 'https://github.com/o/r/status' }]);
  });

  it('fails OPEN: SUCCESS-only contexts → failures empty', async () => {
    vi.mocked(http.request).mockResolvedValue(
      rollupWith('SUCCESS', [{ __typename: 'CheckRun', name: 'test', conclusion: 'SUCCESS', detailsUrl: 'u' }]),
    );
    const detail = await getPRStatusRollupDetail('PR_ok');
    expect(detail.state).toBe('SUCCESS');
    expect(detail.failures).toEqual([]);
  });

  it('fails OPEN: null rollup / no contexts → state null, failures empty', async () => {
    vi.mocked(http.request).mockResolvedValue(rollupWith(null, []));
    await expect(getPRStatusRollupDetail('PR_none')).resolves.toEqual({ state: null, failures: [] });
  });

  it('bounds at 5 failing checks, each normalized to EXACTLY { name, url }', async () => {
    const nodes = Array.from({ length: 8 }, (_, i) => ({
      __typename: 'CheckRun',
      name: `check-${i}`,
      conclusion: 'FAILURE',
      detailsUrl: `https://github.com/o/r/runs/${i}`,
    }));
    const detail = await (async () => {
      vi.mocked(http.request).mockResolvedValue(rollupWith('FAILURE', nodes));
      return getPRStatusRollupDetail('PR_many');
    })();
    expect(detail.failures).toHaveLength(5);
    for (const f of detail.failures) {
      expect(Object.keys(f).sort()).toEqual(['name', 'url']); // no __typename / extra keys
    }
  });

  it('null conclusion (pending CheckRun) is NOT failing', async () => {
    vi.mocked(http.request).mockResolvedValue(
      rollupWith('PENDING', [{ __typename: 'CheckRun', name: 'test', conclusion: null, detailsUrl: 'u' }]),
    );
    const detail = await getPRStatusRollupDetail('PR_pending');
    expect(detail.failures).toEqual([]);
  });
});
