import { graphql } from '../graphql';

export interface ReviewThread {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  /** Null when GitHub can no longer locate the anchor in the current diff. */
  line: number | null;
  path: string;
}

const LIST_QUERY = `
  query ListReviewThreads($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: 100) {
          nodes { id isResolved isOutdated line path }
        }
      }
    }
  }
`;

interface ListResponse {
  repository: {
    pullRequest: {
      reviewThreads: { nodes: ReviewThread[] };
    } | null;
  } | null;
}

export async function listReviewThreads(
  owner: string,
  repo: string,
  number: number,
  accountId?: string,
): Promise<ReviewThread[]> {
  const data = await graphql<ListResponse>(LIST_QUERY, { owner, repo, number }, accountId);
  return data.repository?.pullRequest?.reviewThreads.nodes ?? [];
}

const RESOLVE_MUTATION = `
  mutation ResolveThread($threadId: ID!) {
    resolveReviewThread(input: { threadId: $threadId }) {
      thread { id isResolved }
    }
  }
`;

export async function resolveReviewThread(threadId: string, accountId?: string): Promise<void> {
  await graphql<unknown>(RESOLVE_MUTATION, { threadId }, accountId);
}
