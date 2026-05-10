// REVIEWER-AUTOMATIONS — pure 4-gate truth-table evaluator. Decides whether
// to fire enableAutoMerge on a reviewer PR. No I/O. Spec §4.

export type ReviewState =
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'DISMISSED'
  | 'COMMENTED'
  | 'PENDING';

export interface ReviewRecord {
  login: string;
  state: ReviewState;
  // ISO-8601 string (GraphQL `submittedAt` shape). Compared via Date.parse —
  // the gate doesn't care if it's epoch-ms or ISO.
  submittedAt: string;
}

export interface GateInput {
  currentUserLogin: string;
  prRepo: string;
  reviews: ReviewRecord[];
  requestedReviewers: string[];
  reviewDecision: 'APPROVED' | 'REVIEW_REQUIRED' | 'CHANGES_REQUESTED' | null;
  enableReviewerTab: boolean;
  enableReviewerAutoMerge: boolean;
  autoMergeReviewerOptInRepos: string[];
  alreadyArmed: boolean;
}

export type GateReason =
  | 'master-off'
  | 'submodule-off'
  | 'not-allowlisted'
  | 'not-approved'
  | 'not-last-gate'
  | 'already-armed';

export type GateResult = { fire: true } | { fire: false; reason: GateReason };

export function evaluateReviewerAutoMergeGate(input: GateInput): GateResult {
  if (!input.enableReviewerTab) return { fire: false, reason: 'master-off' };
  if (!input.enableReviewerAutoMerge) return { fire: false, reason: 'submodule-off' };
  if (!input.autoMergeReviewerOptInRepos.includes(input.prRepo)) return { fire: false, reason: 'not-allowlisted' };
  if (input.alreadyArmed) return { fire: false, reason: 'already-armed' };

  // My-approval gate: latest decisive review by currentUserLogin must be
  // APPROVED. COMMENTED/PENDING are non-decisive (5.2-A precedent).
  const myReviews = input.reviews
    .filter((r) => r.login === input.currentUserLogin && r.state !== 'COMMENTED' && r.state !== 'PENDING')
    .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
  if (myReviews[0]?.state !== 'APPROVED') return { fire: false, reason: 'not-approved' };

  // Last-gate gate: PR's overall review decision is APPROVED AND no pending
  // requested reviewers remain.
  if (input.reviewDecision !== 'APPROVED') return { fire: false, reason: 'not-last-gate' };
  if (input.requestedReviewers.length > 0) return { fire: false, reason: 'not-last-gate' };

  return { fire: true };
}
