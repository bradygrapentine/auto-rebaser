import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRepo, getBranchHeadSHA } from '../../../src/github/endpoints/repos';
import * as http from '../../../src/github/http';

beforeEach(() => {
  vi.spyOn(http, 'request');
});

describe('getRepo', () => {
  it('returns repo data on 200', async () => {
    const repo = {
      name: 'r',
      full_name: 'o/r',
      delete_branch_on_merge: true,
      allow_squash_merge: true,
      allow_merge_commit: false,
      allow_rebase_merge: true,
    };
    vi.mocked(http.request).mockResolvedValue(repo);
    expect(await getRepo('o', 'r')).toEqual(repo);
  });

  it('hits /repos/{owner}/{repo} with useETag', async () => {
    vi.mocked(http.request).mockResolvedValue({
      delete_branch_on_merge: false,
    });
    await getRepo('octocat', 'hello-world');
    expect(http.request).toHaveBeenCalledWith('/repos/octocat/hello-world', {
      useETag: true,
    });
  });

  it('returns null on 404', async () => {
    vi.mocked(http.request).mockRejectedValue(new Error('HTTP_404'));
    expect(await getRepo('o', 'gone')).toBeNull();
  });

  it('rethrows non-404 errors', async () => {
    vi.mocked(http.request).mockRejectedValue(new Error('AUTH_ERROR'));
    await expect(getRepo('o', 'r')).rejects.toThrow('AUTH_ERROR');
  });
});

describe('getBranchHeadSHA', () => {
  it('returns the commit sha on 200', async () => {
    vi.mocked(http.request).mockResolvedValue({
      name: 'main',
      commit: { sha: 'abc123' },
    });
    expect(await getBranchHeadSHA('o', 'r', 'main')).toBe('abc123');
  });

  it('hits /repos/{owner}/{repo}/branches/{branch} with useETag', async () => {
    vi.mocked(http.request).mockResolvedValue({
      name: 'main',
      commit: { sha: 'sha' },
    });
    await getBranchHeadSHA('octocat', 'hello-world', 'main');
    expect(http.request).toHaveBeenCalledWith(
      '/repos/octocat/hello-world/branches/main',
      { useETag: true },
    );
  });

  it('url-encodes branches with slashes', async () => {
    vi.mocked(http.request).mockResolvedValue({
      name: 'feat/x',
      commit: { sha: 'sha' },
    });
    await getBranchHeadSHA('o', 'r', 'feat/x');
    expect(http.request).toHaveBeenCalledWith(
      '/repos/o/r/branches/feat%2Fx',
      { useETag: true },
    );
  });

  it('returns null on 404 (branch deleted under us)', async () => {
    vi.mocked(http.request).mockRejectedValue(new Error('HTTP_404'));
    expect(await getBranchHeadSHA('o', 'r', 'gone')).toBeNull();
  });

  it('rethrows non-404 errors', async () => {
    vi.mocked(http.request).mockRejectedValue(new Error('AUTH_ERROR'));
    await expect(getBranchHeadSHA('o', 'r', 'main')).rejects.toThrow('AUTH_ERROR');
  });
});
