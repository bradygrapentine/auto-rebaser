import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchReviewerPRs } from '../../../src/github/endpoints/reviewer-search';
import { request } from '../../../src/github/http';

vi.mock('../../../src/github/http', () => ({ request: vi.fn() }));

beforeEach(() => { vi.clearAllMocks(); });

describe('searchReviewerPRs', () => {
  it('builds the review-requested OR assignee query, excludes author:@me', async () => {
    (request as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
    await searchReviewerPRs();
    const url = (request as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('is%3Apr');
    expect(url).toContain('is%3Aopen');
    expect(url).toContain('review-requested%3A%40me');
    expect(url).toContain('assignee%3A%40me');
    expect(url).toContain('-author%3A%40me');
  });

  it('aggregates pages until a short page is returned', async () => {
    const page1 = { items: Array.from({ length: 100 }, (_, i) => ({ id: i, number: i })) };
    const page2 = { items: [{ id: 999, number: 999 }] };
    (request as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);
    const result = await searchReviewerPRs();
    expect(result.items).toHaveLength(101);
    expect((request as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it('stops at the 1000-result hard cap (10 pages)', async () => {
    (request as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: Array.from({ length: 100 }, (_, i) => ({ id: i, number: i })),
    });
    await searchReviewerPRs();
    expect((request as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(10);
  });

  it('uses ETag caching on each page request', async () => {
    (request as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
    await searchReviewerPRs();
    expect((request as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual({ useETag: true });
  });
});
