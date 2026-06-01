// CT-2 — fetch a PR's GraphQL `statusCheckRollup.state` (the unified CI rollup
// GitHub's merge box uses — combines legacy commit-statuses AND check-runs into
// one state). Not exposed by the REST API. Used by the poll cycle's CI-green
// gate to skip auto-rebasing a PR whose CI is definitively red. Sibling of
// `pr-review-decision.ts` (the other half of the mergebox); mirrors its shape.

import { graphql } from '../graphql';

/** GitHub GraphQL `StatusState`, or null when the PR's last commit has no
 *  checks/statuses configured (or the PR/node is not accessible). */
export type StatusRollupState =
  | 'SUCCESS'
  | 'FAILURE'
  | 'ERROR'
  | 'PENDING'
  | 'EXPECTED'
  | null;

interface Response {
  node: {
    commits?: {
      nodes?: Array<{
        commit?: { statusCheckRollup?: { state?: StatusRollupState } | null };
      }>;
    };
  } | null;
}

const QUERY = `
  query PRStatusRollup($prId: ID!) {
    node(id: $prId) {
      ... on PullRequest {
        commits(last: 1) {
          nodes { commit { statusCheckRollup { state } } }
        }
      }
    }
  }
`;

export async function getPRStatusRollup(
  prNodeId: string,
  accountId?: string,
): Promise<StatusRollupState> {
  const data = await graphql<Response>(QUERY, { prId: prNodeId }, accountId);
  return data.node?.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null;
}
