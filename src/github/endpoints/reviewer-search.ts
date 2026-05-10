// REVIEWER-AUTOMATIONS — discovery search for PRs where the signed-in user
// is a requested reviewer or assignee, excluding PRs they authored. Mirrors
// the pagination semantics of searchAuthoredPRs in src/github/endpoints.ts.

import type { SearchResult } from '../../core/types';
import { request } from '../http';

const SEARCH_PAGE_SIZE = 100;
const SEARCH_MAX_PAGES = 10;

export async function searchReviewerPRs(): Promise<SearchResult> {
  const aggregated: SearchResult['items'] = [];
  const q = encodeURIComponent('is:pr is:open (review-requested:@me OR assignee:@me) -author:@me');
  for (let page = 1; page <= SEARCH_MAX_PAGES; page++) {
    const url = `/search/issues?q=${q}&per_page=${SEARCH_PAGE_SIZE}&page=${page}`;
    const result = await request<SearchResult>(url, { useETag: true });
    aggregated.push(...result.items);
    if (result.items.length < SEARCH_PAGE_SIZE) break;
  }
  return { items: aggregated };
}
