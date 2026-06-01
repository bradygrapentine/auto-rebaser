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

// ── TRIAGE-2 — rollup DETAIL: state + the failing checks (name + URL) ──────
// A sibling of getPRStatusRollup that ALSO returns the failing contexts, so the
// poll cycle can surface WHICH check is red on a CI-red PR. getPRStatusRollup
// above is left untouched (the CT-2 gate keeps its exact call/return); the poll
// cycle's rebase-path read switches to this variant to get state + failures in
// ONE round-trip.

/** One failing check, normalized across the CheckRun/StatusContext union. */
export interface CIFailure {
  name: string;
  /** Raw GitHub detailsUrl/targetUrl — UNVALIDATED; the renderer MUST pass it
   *  through isSafeExternalUrl before using it as an href. */
  url: string | null;
}

export interface StatusRollupDetail {
  state: StatusRollupState;
  failures: CIFailure[];
}

// Complete failing-conclusion/state sets (GitHub GraphQL enums).
const FAILING_CHECKRUN_CONCLUSIONS = new Set([
  'FAILURE',
  'ERROR',
  'TIMED_OUT',
  'CANCELLED',
  'STARTUP_FAILURE',
]);
const FAILING_STATUS_STATES = new Set(['FAILURE', 'ERROR']);
const MAX_CI_CONTEXTS = 20; // GraphQL window bound (payload)
const MAX_CI_FAILURES = 5; // per-record storage bound

interface ContextNode {
  __typename?: string;
  // CheckRun fields
  name?: string;
  conclusion?: string | null;
  detailsUrl?: string | null;
  // StatusContext fields
  context?: string;
  state?: string | null;
  targetUrl?: string | null;
}

interface DetailResponse {
  node: {
    commits?: {
      nodes?: Array<{
        commit?: {
          statusCheckRollup?: {
            state?: StatusRollupState;
            contexts?: { nodes?: ContextNode[] } | null;
          } | null;
        };
      }>;
    };
  } | null;
}

const DETAIL_QUERY = `
  query PRStatusRollupDetail($prId: ID!) {
    node(id: $prId) {
      ... on PullRequest {
        commits(last: 1) {
          nodes { commit { statusCheckRollup {
            state
            contexts(last: ${MAX_CI_CONTEXTS}) {
              nodes {
                __typename
                ... on CheckRun { name conclusion detailsUrl }
                ... on StatusContext { context state targetUrl }
              }
            }
          } } }
        }
      }
    }
  }
`;

export async function getPRStatusRollupDetail(
  prNodeId: string,
  accountId?: string,
): Promise<StatusRollupDetail> {
  const data = await graphql<DetailResponse>(DETAIL_QUERY, { prId: prNodeId }, accountId);
  const rollup = data.node?.commits?.nodes?.[0]?.commit?.statusCheckRollup ?? null;
  const state = rollup?.state ?? null;
  const nodes = rollup?.contexts?.nodes ?? [];

  const failures: CIFailure[] = [];
  for (const n of nodes) {
    // Emit a fresh { name, url } literal — never spread the raw node, so
    // __typename and the union's other fields never leak into the output.
    if (n.__typename === 'CheckRun') {
      if (n.conclusion && FAILING_CHECKRUN_CONCLUSIONS.has(n.conclusion)) {
        failures.push({ name: n.name ?? '(unknown check)', url: n.detailsUrl ?? null });
      }
    } else if (n.__typename === 'StatusContext') {
      if (n.state && FAILING_STATUS_STATES.has(n.state)) {
        failures.push({ name: n.context ?? '(unknown check)', url: n.targetUrl ?? null });
      }
    }
    if (failures.length >= MAX_CI_FAILURES) break;
  }
  return { state, failures };
}
