// CT-2 — getPRStatusRollup endpoint. Fixtures are REAL responses captured
// 2026-06-01 via `gh api graphql` against this repo's PRs (path/shape pinned as
// hard literals, NOT a same-codepath round-trip):
//   PR #237 → {"data":{"node":{"number":237,"commits":{"nodes":[{"commit":{"statusCheckRollup":{"state":"SUCCESS"}}}]}}}}
//   PR #195 → {"data":{"node":{"number":195,"commits":{"nodes":[{"commit":{"statusCheckRollup":{"state":"FAILURE"}}}]}}}}
// The no-checks (`statusCheckRollup: null`) shape is from GitHub's GraphQL schema
// (a commit with no checks/statuses configured) — structurally proven by the two
// live captures above, only the leaf differs.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPRStatusRollup } from '../../../src/github/endpoints/status-check-rollup';
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
