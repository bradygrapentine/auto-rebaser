import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enablePullRequestAutoMerge } from '../../../src/github/endpoints/auto-merge';
import * as gql from '../../../src/github/graphql';

beforeEach(() => {
  vi.spyOn(gql, 'graphql');
});

describe('enablePullRequestAutoMerge', () => {
  it('returns enabled:true on success', async () => {
    vi.mocked(gql.graphql).mockResolvedValue({});
    expect(await enablePullRequestAutoMerge('PR_node_1', 'SQUASH')).toEqual({
      enabled: true,
      unsupported: false,
    });
  });

  it('passes prId + method as variables', async () => {
    vi.mocked(gql.graphql).mockResolvedValue({});
    await enablePullRequestAutoMerge('PR_node_1', 'REBASE');
    const [, vars] = vi.mocked(gql.graphql).mock.calls[0];
    expect(vars).toEqual({ prId: 'PR_node_1', method: 'REBASE' });
  });

  it('returns unsupported:true when repo does not allow merge method', async () => {
    vi.mocked(gql.graphql).mockRejectedValue(
      new gql.GraphQLError('Squash merging is not allowed in this repository', [
        { message: 'Squash merging is not allowed in this repository' },
      ])
    );
    expect(await enablePullRequestAutoMerge('PR_x', 'SQUASH')).toEqual({
      enabled: false,
      unsupported: true,
      reason: 'Squash merging is not allowed in this repository',
    });
  });

  it('returns unsupported:true when auto-merge is not enabled on the repo', async () => {
    vi.mocked(gql.graphql).mockRejectedValue(
      new gql.GraphQLError('Pull request auto-merge is not enabled', [
        { message: 'Pull request auto-merge is not enabled' },
      ])
    );
    const result = await enablePullRequestAutoMerge('PR_x', 'SQUASH');
    expect(result.unsupported).toBe(true);
  });

  it('returns unsupported:true when repo does not support auto-merge', async () => {
    vi.mocked(gql.graphql).mockRejectedValue(
      new gql.GraphQLError('Repository does not support this', [
        { message: 'Repository does not support this' },
      ])
    );
    expect(
      (await enablePullRequestAutoMerge('PR_x', 'SQUASH')).unsupported
    ).toBe(true);
  });

  it('returns unsupported:true when checks not in clean status (no-op state)', async () => {
    vi.mocked(gql.graphql).mockRejectedValue(
      new gql.GraphQLError('Pull request is in clean status', [
        { message: 'Pull request is in clean status' },
      ])
    );
    expect(
      (await enablePullRequestAutoMerge('PR_x', 'SQUASH')).unsupported
    ).toBe(true);
  });

  it('rethrows GraphQLError with unrelated message', async () => {
    vi.mocked(gql.graphql).mockRejectedValue(
      new gql.GraphQLError('Some other failure', [
        { message: 'Some other failure' },
      ])
    );
    await expect(enablePullRequestAutoMerge('PR_x', 'SQUASH')).rejects.toThrow(
      'Some other failure'
    );
  });

  it('rethrows non-GraphQL errors (e.g. network)', async () => {
    vi.mocked(gql.graphql).mockRejectedValue(new Error('RATE_LIMITED'));
    await expect(enablePullRequestAutoMerge('PR_x', 'SQUASH')).rejects.toThrow(
      'RATE_LIMITED'
    );
  });
});
