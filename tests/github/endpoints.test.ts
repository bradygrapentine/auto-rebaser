import { describe, it, expect, vi } from 'vitest';
import { searchAuthoredPRs, getPR, updateBranch, getAuthenticatedUser } from '../../src/github/endpoints';

vi.mock('../../src/github/http', () => ({
  request: vi.fn(),
}));

import { request } from '../../src/github/http';

describe('endpoints', () => {
  describe('searchAuthoredPRs', () => {
    it('fetches page 1 with useETag', async () => {
      vi.mocked(request).mockResolvedValue({ items: [] });
      await searchAuthoredPRs();
      expect(request).toHaveBeenCalledWith(
        expect.stringContaining('/search/issues?q=is:pr+is:open+author:@me&per_page=100&page=1'),
        { useETag: true, accountId: undefined }
      );
    });

    it('stops paginating when a page returns fewer than 100 items', async () => {
      vi.mocked(request)
        .mockResolvedValueOnce({ items: Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })) })
        .mockResolvedValueOnce({ items: [{ id: 101 }] }); // partial page → stop
      const result = await searchAuthoredPRs();
      expect(result.items).toHaveLength(101);
      expect(request).toHaveBeenCalledTimes(2);
    });

    it('walks all pages until empty', async () => {
      vi.mocked(request)
        .mockResolvedValueOnce({ items: Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })) })
        .mockResolvedValueOnce({ items: [] }); // empty → stop
      const result = await searchAuthoredPRs();
      expect(result.items).toHaveLength(100);
    });

    it('hard-caps at 10 pages (GitHub Search API limit)', async () => {
      vi.mocked(request).mockResolvedValue({
        items: Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })),
      });
      await searchAuthoredPRs();
      expect(request).toHaveBeenCalledTimes(10);
    });

    it('returns SearchResult', async () => {
      vi.mocked(request).mockResolvedValue({ items: [{ id: 1 }] });
      const result = await searchAuthoredPRs();
      expect(result).toEqual({ items: [{ id: 1 }] });
    });

    // CT-7 — per-page error isolation.
    it('flags partial + returns page-1 items when a LATER page throws transiently', async () => {
      vi.mocked(request)
        .mockResolvedValueOnce({ items: Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })) })
        .mockRejectedValueOnce(new Error('HTTP_502')); // page 2 transient 5xx
      const result = await searchAuthoredPRs();
      expect(result.partial).toBe(true);
      expect(result.items).toHaveLength(100); // page-1 aggregate, not blanked
    });

    it('does NOT flag partial on a complete walk', async () => {
      vi.mocked(request).mockResolvedValue({ items: [{ id: 1 }] });
      const result = await searchAuthoredPRs();
      expect(result.partial).toBeUndefined();
    });

    it('propagates a PAGE-1 failure (caller aborts the cycle unchanged)', async () => {
      vi.mocked(request).mockRejectedValueOnce(new Error('HTTP_502'));
      await expect(searchAuthoredPRs()).rejects.toThrow('HTTP_502');
    });

    it.each(['RATE_LIMITED', 'AUTH_ERROR', 'NOT_AUTHENTICATED', 'FORBIDDEN', 'HTTP_403'])(
      're-throws account-fatal %s even on a later page (never partial)',
      async (msg) => {
        vi.mocked(request)
          .mockResolvedValueOnce({ items: Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })) })
          .mockRejectedValueOnce(new Error(msg));
        await expect(searchAuthoredPRs()).rejects.toThrow(msg);
      },
    );
  });

  describe('getPR', () => {
    it('calls request with correct path, no etag', async () => {
      vi.mocked(request).mockResolvedValue({ id: 1, number: 42 });
      await getPR('owner', 'repo', 42);
      expect(request).toHaveBeenCalledWith('/repos/owner/repo/pulls/42', { accountId: undefined });
    });

    it('returns PullRequest', async () => {
      const pr = { id: 1, number: 42, title: 'test', mergeable_state: 'behind' };
      vi.mocked(request).mockResolvedValue(pr);
      const result = await getPR('owner', 'repo', 42);
      expect(result).toEqual(pr);
    });
  });

  describe('updateBranch', () => {
    it('calls PUT with correct path and rebase body', async () => {
      vi.mocked(request).mockResolvedValue(undefined);
      await updateBranch('owner', 'repo', 7);
      expect(request).toHaveBeenCalledWith('/repos/owner/repo/pulls/7/update-branch', {
        method: 'PUT',
        body: JSON.stringify({ update_method: 'rebase' }),
        headers: { 'Content-Type': 'application/json' },
        accountId: undefined,
      });
    });
  });

  describe('getAuthenticatedUser', () => {
    it('calls GET /user', async () => {
      vi.mocked(request).mockResolvedValue({ login: 'me', avatar_url: 'https://x.com/img' });
      await getAuthenticatedUser();
      expect(request).toHaveBeenCalledWith('/user', { accountId: undefined });
    });

    it('returns GitHubUser', async () => {
      const user = { login: 'me', avatar_url: 'https://x.com/img' };
      vi.mocked(request).mockResolvedValue(user);
      const result = await getAuthenticatedUser();
      expect(result).toEqual(user);
    });
  });
});
