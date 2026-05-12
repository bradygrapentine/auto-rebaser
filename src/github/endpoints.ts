import type { SearchResult, PullRequest, GitHubUser } from '../core/types';
import { request } from './http';

const SEARCH_PAGE_SIZE = 100;
/** GitHub Search API hard cap: max 1000 results = 10 pages of 100. */
const SEARCH_MAX_PAGES = 10;

/**
 * Returns ALL open authored PRs by walking pages of the GitHub Search API
 * until either an empty page is returned or the API's 1000-result cap is hit.
 * Each page is ETag-cached individually so repeat polls cost ~0 when nothing
 * has changed.
 */
export async function searchAuthoredPRs(accountId?: string): Promise<SearchResult> {
  const aggregated: SearchResult['items'] = [];
  for (let page = 1; page <= SEARCH_MAX_PAGES; page++) {
    const url = `/search/issues?q=is:pr+is:open+author:@me&per_page=${SEARCH_PAGE_SIZE}&page=${page}`;
    const result = await request<SearchResult>(url, { useETag: true, accountId });
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
