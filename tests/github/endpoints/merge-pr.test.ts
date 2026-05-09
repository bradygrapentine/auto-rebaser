import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mergePR } from '../../../src/github/endpoints/merge-pr';
import * as http from '../../../src/github/http';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('mergePR', () => {
  it('PUTs to /repos/:o/:r/pulls/:n/merge with sha + method', async () => {
    const requestSpy = vi.spyOn(http, 'request').mockResolvedValue({
      merged: true,
      sha: 'abc123',
    });

    const result = await mergePR('octo', 'cat', 7, {
      sha: 'deadbeef',
      merge_method: 'squash',
    });

    expect(requestSpy).toHaveBeenCalledWith(
      '/repos/octo/cat/pulls/7/merge',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ sha: 'deadbeef', merge_method: 'squash' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(result).toEqual({ merged: true, sha: 'abc123' });
  });

  it('translates HTTP_405 to METHOD_NOT_ALLOWED', async () => {
    vi.spyOn(http, 'request').mockRejectedValue(new Error('HTTP_405'));
    await expect(
      mergePR('o', 'r', 1, { sha: 's', merge_method: 'rebase' }),
    ).rejects.toThrow('METHOD_NOT_ALLOWED');
  });

  it('translates HTTP_409 to SHA_MISMATCH', async () => {
    vi.spyOn(http, 'request').mockRejectedValue(new Error('HTTP_409'));
    await expect(
      mergePR('o', 'r', 1, { sha: 's', merge_method: 'squash' }),
    ).rejects.toThrow('SHA_MISMATCH');
  });

  it('propagates other HTTP errors unchanged', async () => {
    vi.spyOn(http, 'request').mockRejectedValue(new Error('HTTP_403'));
    await expect(
      mergePR('o', 'r', 1, { sha: 's', merge_method: 'merge' }),
    ).rejects.toThrow('HTTP_403');
  });
});
