import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPRReviewDecision } from '../../../src/github/endpoints/pr-review-decision';
import * as http from '../../../src/github/http';

beforeEach(() => {
  vi.spyOn(http, 'request');
});

describe('getPRReviewDecision', () => {
  it('returns reviewDecision from the GraphQL node payload', async () => {
    vi.mocked(http.request).mockResolvedValue({
      data: { node: { reviewDecision: 'APPROVED' } },
    });
    await expect(getPRReviewDecision('PR_pr_123')).resolves.toBe('APPROVED');
  });

  it('returns null when node is null (PR not found / no access)', async () => {
    vi.mocked(http.request).mockResolvedValue({ data: { node: null } });
    await expect(getPRReviewDecision('PR_missing')).resolves.toBeNull();
  });

  it('returns null when reviewDecision is absent on the node', async () => {
    vi.mocked(http.request).mockResolvedValue({
      data: { node: {} },
    });
    await expect(getPRReviewDecision('PR_no_rd')).resolves.toBeNull();
  });

  it('forwards the prId variable to the GraphQL request', async () => {
    vi.mocked(http.request).mockResolvedValue({
      data: { node: { reviewDecision: 'REVIEW_REQUIRED' } },
    });
    await getPRReviewDecision('PR_abc');
    const [, opts] = vi.mocked(http.request).mock.calls[0]!;
    const body = JSON.parse(opts!.body as string) as { variables: { prId: string } };
    expect(body.variables.prId).toBe('PR_abc');
  });
});
