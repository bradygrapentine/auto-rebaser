import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteRef } from '../../../src/github/endpoints/git-refs';
import * as httpExtra from '../../../src/github/http-extra';

beforeEach(() => {
  vi.spyOn(httpExtra, 'requestNoBody');
});

describe('deleteRef', () => {
  it('204 → "deleted"', async () => {
    vi.mocked(httpExtra.requestNoBody).mockResolvedValue(204);
    expect(await deleteRef('o', 'r', 'feat/x')).toBe('deleted');
  });

  it('404 → "already-gone"', async () => {
    vi.mocked(httpExtra.requestNoBody).mockResolvedValue(404);
    expect(await deleteRef('o', 'r', 'feat/x')).toBe('already-gone');
  });

  it('422 → "already-gone"', async () => {
    vi.mocked(httpExtra.requestNoBody).mockResolvedValue(422);
    expect(await deleteRef('o', 'r', 'feat/x')).toBe('already-gone');
  });

  it('hits /repos/{o}/{r}/git/refs/heads/{branch} with DELETE', async () => {
    vi.mocked(httpExtra.requestNoBody).mockResolvedValue(204);
    await deleteRef('octocat', 'hello', 'feat/x');
    expect(httpExtra.requestNoBody).toHaveBeenCalledWith(
      '/repos/octocat/hello/git/refs/heads/feat%2Fx',
      { method: 'DELETE' }
    );
  });

  it('throws HTTP_<status> on unexpected status', async () => {
    vi.mocked(httpExtra.requestNoBody).mockResolvedValue(500);
    await expect(deleteRef('o', 'r', 'b')).rejects.toThrow('HTTP_500');
  });

  it('propagates AUTH_ERROR from requestNoBody', async () => {
    vi.mocked(httpExtra.requestNoBody).mockRejectedValue(new Error('AUTH_ERROR'));
    await expect(deleteRef('o', 'r', 'b')).rejects.toThrow('AUTH_ERROR');
  });
});
