// REVIEWER-AUTOMATIONS — discovery search for PRs where the signed-in user
// is a requested reviewer or assignee, excluding PRs they authored. Mirrors
// the pagination semantics of searchAuthoredPRs in src/github/endpoints.ts.
//
// IMPORTANT: GitHub's /search/issues endpoint REJECTS the natural
// `(review-requested:@me OR assignee:@me)` boolean-grouped query with
// HTTP 422 ("Validation Failed", confusingly reporting the qualifier
// values rather than the grouping itself). Boolean OR with parens is
// not supported on this endpoint. We issue the two queries
// sequentially and dedupe by `id`.

import type { SearchResult } from '../../core/types';
import { request } from '../http';

const SEARCH_PAGE_SIZE = 100;
const SEARCH_MAX_PAGES = 10;

async function searchOne(q: string, accountId?: string): Promise<SearchResult['items']> {
  const aggregated: SearchResult['items'] = [];
  const encoded = encodeURIComponent(q);
  for (let page = 1; page <= SEARCH_MAX_PAGES; page++) {
    const url = `/search/issues?q=${encoded}&per_page=${SEARCH_PAGE_SIZE}&page=${page}`;
    const result = await request<SearchResult>(url, { useETag: true, accountId });
    aggregated.push(...result.items);
    if (result.items.length < SEARCH_PAGE_SIZE) break;
  }
  return aggregated;
}

export async function searchReviewerPRs(accountId?: string): Promise<SearchResult> {
  const [reviewRequested, assigned] = await Promise.all([
    searchOne('is:pr is:open review-requested:@me -author:@me', accountId),
    searchOne('is:pr is:open assignee:@me -author:@me', accountId),
  ]);

  // Dedupe by `id` — a PR where the user is both reviewer and assignee
  // shows up in both queries; we want it once.
  const byId = new Map<number, SearchResult['items'][number]>();
  for (const item of reviewRequested) byId.set(item.id, item);
  for (const item of assigned) byId.set(item.id, item);
  return { items: Array.from(byId.values()) };
}
