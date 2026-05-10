// Story 5.2-A — PR review listing + reviewer re-request.

import { request } from '../http';
import type { ReviewState } from '../../core/stale-approval';

interface RawReview {
  user?: { login?: string } | null;
  state?: string;
  submitted_at?: string | null;
}

export interface ReviewSummary {
  login: string;
  state: ReviewState;
  submittedAt: number;
}

/**
 * GET /repos/:owner/:repo/pulls/:number/reviews?per_page=100
 *
 * Single page only. PRs with >100 decisive reviews are extreme outliers; the
 * latest-per-login collapse downstream means even a partial fetch produces
 * a defensible answer for the badge.
 */
export async function listReviews(
  owner: string,
  repo: string,
  num: number,
): Promise<ReviewSummary[]> {
  const raw = await request<RawReview[]>(
    `/repos/${owner}/${repo}/pulls/${num}/reviews?per_page=100`,
    { method: 'GET' },
  );
  if (!Array.isArray(raw)) return [];
  const out: ReviewSummary[] = [];
  for (const r of raw) {
    const login = r.user?.login;
    if (!login) continue;
    if (!r.submitted_at) continue;
    const ts = Date.parse(r.submitted_at);
    if (Number.isNaN(ts)) continue;
    const state = r.state as ReviewState | undefined;
    if (!state) continue;
    out.push({ login, state, submittedAt: ts });
  }
  return out;
}

export interface RequestReviewersResult {
  ok: true;
  /** True when no reviewers were provided — short-circuits before the network. */
  skipped?: true;
  /** True when GitHub returned 422 with field=reviewers code=invalid (login already requested). */
  alreadyRequested?: true;
}

interface HttpErrorWith422Body extends Error {
  status?: number;
  body?: { errors?: Array<{ field?: string; code?: string }> };
}

/**
 * POST /repos/:owner/:repo/pulls/:number/requested_reviewers
 *
 * GitHub returns 422 with errors[].field='reviewers' code='invalid' when one
 * of the requested logins is already pending review. We surface that as
 * `alreadyRequested: true` so callers don't show a fake error to the user;
 * the throttle store stays the source of truth for "did we already do this".
 *
 * The PR-author-as-reviewer 422 has the same shape, but the upstream guarantee
 * (PR authors cannot appear in `approvers`) means we should never POST one.
 */
export async function requestReviewers(
  owner: string,
  repo: string,
  num: number,
  logins: string[],
): Promise<RequestReviewersResult> {
  if (logins.length === 0) return { ok: true, skipped: true };
  try {
    await request<unknown>(
      `/repos/${owner}/${repo}/pulls/${num}/requested_reviewers`,
      {
        method: 'POST',
        body: JSON.stringify({ reviewers: logins }),
        headers: { 'Content-Type': 'application/json' },
      },
    );
    return { ok: true };
  } catch (err) {
    const e = err as HttpErrorWith422Body;
    if (
      e?.status === 422 &&
      Array.isArray(e.body?.errors) &&
      e.body!.errors!.some((x) => x?.field === 'reviewers' && x?.code === 'invalid')
    ) {
      return { ok: true, alreadyRequested: true };
    }
    throw err;
  }
}
