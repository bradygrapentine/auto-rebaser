import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listReviewThreads,
  resolveReviewThread,
} from '../../../src/github/endpoints/review-threads';
import * as gql from '../../../src/github/graphql';

beforeEach(() => {
  vi.spyOn(gql, 'graphql');
});

describe('listReviewThreads', () => {
  it('returns thread nodes from GraphQL response', async () => {
    const nodes = [
      { id: 't1', isResolved: false, isOutdated: true, line: null, path: 'a.ts' },
      { id: 't2', isResolved: false, isOutdated: false, line: 10, path: 'b.ts' },
    ];
    vi.mocked(gql.graphql).mockResolvedValue({
      repository: { pullRequest: { reviewThreads: { nodes } } },
    });
    expect(await listReviewThreads('o', 'r', 1)).toEqual(nodes);
  });

  it('passes owner / repo / number as variables', async () => {
    vi.mocked(gql.graphql).mockResolvedValue({
      repository: { pullRequest: { reviewThreads: { nodes: [] } } },
    });
    await listReviewThreads('octo', 'hello', 42);
    const [, vars] = vi.mocked(gql.graphql).mock.calls[0];
    expect(vars).toEqual({ owner: 'octo', repo: 'hello', number: 42 });
  });

  it('returns [] when repository is null (private/missing)', async () => {
    vi.mocked(gql.graphql).mockResolvedValue({ repository: null });
    expect(await listReviewThreads('o', 'r', 1)).toEqual([]);
  });

  it('returns [] when pullRequest is null (number not found)', async () => {
    vi.mocked(gql.graphql).mockResolvedValue({
      repository: { pullRequest: null },
    });
    expect(await listReviewThreads('o', 'r', 999)).toEqual([]);
  });

  it('propagates GraphQL errors', async () => {
    vi.mocked(gql.graphql).mockRejectedValue(new Error('AUTH_ERROR'));
    await expect(listReviewThreads('o', 'r', 1)).rejects.toThrow('AUTH_ERROR');
  });
});

describe('resolveReviewThread', () => {
  it('calls graphql with the threadId variable', async () => {
    vi.mocked(gql.graphql).mockResolvedValue({});
    await resolveReviewThread('thread_xyz');
    const [, vars] = vi.mocked(gql.graphql).mock.calls[0];
    expect(vars).toEqual({ threadId: 'thread_xyz' });
  });

  it('resolves to undefined on success', async () => {
    vi.mocked(gql.graphql).mockResolvedValue({});
    expect(await resolveReviewThread('t1')).toBeUndefined();
  });

  it('propagates errors', async () => {
    vi.mocked(gql.graphql).mockRejectedValue(new Error('boom'));
    await expect(resolveReviewThread('t1')).rejects.toThrow('boom');
  });
});
