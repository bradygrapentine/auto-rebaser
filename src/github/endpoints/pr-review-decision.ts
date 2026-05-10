// REVIEWER-AUTOMATIONS — fetch a PR's GraphQL `reviewDecision`. Not exposed
// by the REST API. Used by the reviewer phase's last-gate check.

import { graphql } from '../graphql';

export type ReviewDecision = 'APPROVED' | 'REVIEW_REQUIRED' | 'CHANGES_REQUESTED' | null;

interface Response {
  node: { reviewDecision?: ReviewDecision } | null;
}

const QUERY = `
  query PRReviewDecision($prId: ID!) {
    node(id: $prId) {
      ... on PullRequest { reviewDecision }
    }
  }
`;

export async function getPRReviewDecision(prNodeId: string): Promise<ReviewDecision> {
  const data = await graphql<Response>(QUERY, { prId: prNodeId });
  return data.node?.reviewDecision ?? null;
}
