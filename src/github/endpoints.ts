import type { SearchResult, PullRequest, GitHubUser } from '../core/types';
import { request } from './http';

const SEARCH_PAGE_SIZE = 100;
/** GitHub Search API hard cap: max 1000 results = 10 pages of 100. */
const SEARCH_MAX_PAGES = 10;

// CT-7 — account-wide failures: retrying other pages can't help and the caller
// must abort the whole cycle, so these always re-throw (page 1 or later). A
// failure NOT in this set on a later page is transient (5xx/network) and is
// isolated to a `partial` result instead of blanking the account.
const SEARCH_FATAL_MESSAGES = new Set([
  'RATE_LIMITED',
  'NOT_AUTHENTICATED',
  'AUTH_ERROR',
  'FORBIDDEN',
  'HTTP_403',
]);

/**
 * Returns ALL open authored PRs by walking pages of the GitHub Search API
 * until either an empty page is returned or the API's 1000-result cap is hit.
 * Each page is ETag-cached individually so repeat polls cost ~0 when nothing
 * has changed.
 *
 * CT-7 — a transient failure (5xx/network) on a page AFTER the first returns
 * the aggregated-so-far items flagged `partial: true` rather than throwing, so
 * one flaky page degrades gracefully instead of blanking the whole account (and
 * the caller skips transition-detection for a partial result). Page-1 failures
 * and account-wide failures (auth/rate/403) still propagate — the caller aborts.
 */
export async function searchAuthoredPRs(accountId?: string): Promise<SearchResult> {
  const aggregated: SearchResult['items'] = [];
  for (let page = 1; page <= SEARCH_MAX_PAGES; page++) {
    const url = `/search/issues?q=is:pr+is:open+author:@me&per_page=${SEARCH_PAGE_SIZE}&page=${page}`;
    let result: SearchResult;
    try {
      result = await request<SearchResult>(url, { useETag: true, accountId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (page === 1 || SEARCH_FATAL_MESSAGES.has(msg)) throw err;
      return { items: aggregated, partial: true };
    }
    aggregated.push(...result.items);
    // GitHub returns fewer than per_page items on the last page.
    if (result.items.length < SEARCH_PAGE_SIZE) break;
  }
  return { items: aggregated };
}

export async function getPR(
  owner: string,
  repo: string,
  number: number,
  accountId?: string,
): Promise<PullRequest> {
  return request<PullRequest>(`/repos/${owner}/${repo}/pulls/${number}`, { accountId });
}

export async function updateBranch(
  owner: string,
  repo: string,
  number: number,
  accountId?: string,
): Promise<void> {
  await request<void>(`/repos/${owner}/${repo}/pulls/${number}/update-branch`, {
    method: 'PUT',
    body: JSON.stringify({ update_method: 'rebase' }),
    headers: { 'Content-Type': 'application/json' },
    accountId,
  });
}

export async function getAuthenticatedUser(accountId?: string): Promise<GitHubUser> {
  return request<GitHubUser>('/user', { accountId });
}
