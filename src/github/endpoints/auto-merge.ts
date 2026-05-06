import { graphql, GraphQLError } from '../graphql';

export type MergeMethod = 'SQUASH' | 'MERGE' | 'REBASE';

export interface EnableAutoMergeResult {
  enabled: boolean;
  /** True when the repo doesn't allow the requested merge method. */
  unsupported: boolean;
  /** Original GraphQL error message, when unsupported is true. */
  reason?: string;
}

const MUTATION = `
  mutation EnableAutoMerge($prId: ID!, $method: PullRequestMergeMethod!) {
    enablePullRequestAutoMerge(input: { pullRequestId: $prId, mergeMethod: $method }) {
      pullRequest { id autoMergeRequest { enabledAt } }
    }
  }
`;

export async function enablePullRequestAutoMerge(
  prNodeId: string,
  mergeMethod: MergeMethod
): Promise<EnableAutoMergeResult> {
  try {
    await graphql<unknown>(MUTATION, { prId: prNodeId, method: mergeMethod });
    return { enabled: true, unsupported: false };
  } catch (err) {
    if (err instanceof GraphQLError) {
      const msg = err.errors[0]?.message ?? '';
      if (
        /not enabled/i.test(msg) ||
        /not allowed/i.test(msg) ||
        /does not support/i.test(msg) ||
        /clean status/i.test(msg)
      ) {
        return { enabled: false, unsupported: true, reason: msg };
      }
    }
    throw err;
  }
}
