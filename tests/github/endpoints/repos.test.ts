import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRepo } from '../../../src/github/endpoints/repos';
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
