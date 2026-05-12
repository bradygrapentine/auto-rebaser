import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUserInstallations } from '../../../src/github/endpoints/installations';
import * as http from '../../../src/github/http';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getUserInstallations', () => {
  it('calls /user/installations and returns the array', async () => {
    const stub = [
      { id: 1, account: { login: 'octocat', type: 'User' as const }, repository_selection: 'all', target_type: 'User' },
    ];
    vi.spyOn(http, 'request').mockResolvedValue({ total_count: 1, installations: stub });

    const result = await getUserInstallations();
    expect(http.request).toHaveBeenCalledWith('/user/installations', { accountId: undefined });
    expect(result).toEqual(stub);
  });

  it('returns [] when GitHub omits installations field', async () => {
    vi.spyOn(http, 'request').mockResolvedValue({ total_count: 0 });
    expect(await getUserInstallations()).toEqual([]);
  });

  it('propagates errors from the request layer', async () => {
    vi.spyOn(http, 'request').mockRejectedValue(new Error('AUTH_ERROR'));
    await expect(getUserInstallations()).rejects.toThrow('AUTH_ERROR');
  });
});
