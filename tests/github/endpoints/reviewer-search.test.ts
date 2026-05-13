import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchReviewerPRs } from '../../../src/github/endpoints/reviewer-search';
import { request } from '../../../src/github/http';

vi.mock('../../../src/github/http', () => ({ request: vi.fn() }));

beforeEach(() => { vi.clearAllMocks(); });

describe('searchReviewerPRs', () => {
  it('issues two separate queries (review-requested + assignee) — GitHub /search/issues rejects OR-grouping with 422', async () => {
    (request as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
    await searchReviewerPRs();
    const urls = (request as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string);
    expect(urls.length).toBeGreaterThanOrEqual(2);
    expect(urls.some((u) => u.includes('review-requested%3A%40me'))).toBe(true);
    expect(urls.some((u) => u.includes('assignee%3A%40me'))).toBe(true);
    // Critical: no OR-grouped query lands here (the 422-bait).
    expect(urls.every((u) => !u.includes('%20OR%20'))).toBe(true);
    // Both queries exclude PRs authored by @me.
    expect(urls.every((u) => u.includes('-author%3A%40me'))).toBe(true);
  });

  it('dedupes PRs that match both queries by id', async () => {
    // First query (review-requested) returns id=1 and id=2.
    // Second query (assignee) returns id=2 and id=3.
    // Expected: 3 unique items (1, 2, 3).
    (request as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ items: [{ id: 1, number: 10 }, { id: 2, number: 20 }] })
      .mockResolvedValueOnce({ items: [{ id: 2, number: 20 }, { id: 3, number: 30 }] });
    const result = await searchReviewerPRs();
    const ids = result.items.map((i) => i.id).sort();
    expect(ids).toEqual([1, 2, 3]);
  });

  it('aggregates pages until a short page is returned (per query)', async () => {
    // Each query paginates until short page; the first query has 2 pages, second has 1.
    const fullPage = { items: Array.from({ length: 100 }, (_, i) => ({ id: i, number: i })) };
    const shortPage = { items: [{ id: 999, number: 999 }] };
    const empty = { items: [] };
    (request as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(fullPage)   // query A, page 1
      .mockResolvedValueOnce(shortPage)  // query A, page 2 (short → stop)
      .mockResolvedValueOnce(empty);     // query B, page 1 (short → stop)
    const result = await searchReviewerPRs();
    // 100 ids 0..99 plus id 999 = 101 unique.
    expect(result.items).toHaveLength(101);
  });

  it('uses ETag caching on every request', async () => {
    (request as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
    await searchReviewerPRs();
    for (const call of (request as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[1]).toMatchObject({ useETag: true });
    }
  });

  it('threads accountId through to request', async () => {
    (request as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
    await searchReviewerPRs('gh_alice');
    for (const call of (request as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[1]).toMatchObject({ accountId: 'gh_alice' });
    }
  });
});
