// Story 5.2-A — pure detector. Given the reviews on a PR plus the timestamp at
// which the head SHA was last observed to change (the "push moment" from the
// poll cycle's perspective), decide whether all current approvers approved
// before the push. If so, the PR is "stale-approved" and the popup surfaces a
// `! re-review` badge.

export type ReviewState =
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'DISMISSED'
  | 'COMMENTED'
  | 'PENDING';

export interface StaleApprovalInput {
  /** Wall-clock at which the cached head SHA last changed. */
  lastPushedAt: number | null;
  /** ALL reviews for the PR (including DISMISSED / CHANGES_REQUESTED / COMMENTED). The detector filters them. */
  reviews: Array<{ login: string; state: ReviewState; submittedAt: number }>;
}

export interface StaleApprovalResult {
  stale: true;
  approvers: string[];
  lastApprovedAt: number;
  lastPushedAt: number;
}

export function detectStaleApproval(input: StaleApprovalInput): StaleApprovalResult | null {
  if (!input.lastPushedAt) return null;
  if (input.reviews.length === 0) return null;

  // Latest decisive review per reviewer. COMMENTED / PENDING are non-decisive
  // and are ignored: someone who approved then commented "nice" is still an
  // approver.
  const latestByLogin = new Map<string, { state: ReviewState; submittedAt: number }>();
  for (const r of input.reviews) {
    if (r.state === 'COMMENTED' || r.state === 'PENDING') continue;
    const cur = latestByLogin.get(r.login);
    if (!cur || r.submittedAt > cur.submittedAt) {
      latestByLogin.set(r.login, { state: r.state, submittedAt: r.submittedAt });
    }
  }

  // Keep only those whose latest decisive state is APPROVED. DISMISSED and
  // CHANGES_REQUESTED reviewers are not current approvers.
  const currentApprovers: Array<[string, number]> = [];
  for (const [login, latest] of latestByLogin) {
    if (latest.state === 'APPROVED') currentApprovers.push([login, latest.submittedAt]);
  }
  if (currentApprovers.length === 0) return null;

  // Stale iff every current approver approved BEFORE the push.
  const allStale = currentApprovers.every(([, ts]) => ts < input.lastPushedAt!);
  if (!allStale) return null;

  return {
    stale: true,
    approvers: currentApprovers.map(([login]) => login),
    lastApprovedAt: Math.max(...currentApprovers.map(([, ts]) => ts)),
    lastPushedAt: input.lastPushedAt,
  };
}
