import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuth } from '../../../src/popup/hooks/useAuth';

vi.mock('../../../src/core/auth-store', () => ({
  getToken: vi.fn(),
}));

vi.mock('../../../src/core/auth', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  setTokenFromPAT: vi.fn(),
}));

vi.mock('../../../src/github/endpoints', () => ({
  getAuthenticatedUser: vi.fn(),
}));

import { getToken } from '../../../src/core/auth-store';
import { signOut as coreSignOut, setTokenFromPAT } from '../../../src/core/auth';
import { getAuthenticatedUser } from '../../../src/github/endpoints';

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts as loading then signed-out when no token', async () => {
    (getToken as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { result } = renderHook(() => useAuth());
    expect(result.current.status).toBe('loading');
    await act(async () => {});
    expect(result.current.status).toBe('signed-out');
  });

  it('becomes signed-in when token + valid user', async () => {
    (getToken as ReturnType<typeof vi.fn>).mockResolvedValue('token123');
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      login: 'testuser',
      avatar_url: 'https://example.com/avatar.png',
    });
    const { result } = renderHook(() => useAuth());
    await act(async () => {});
    expect(result.current.status).toBe('signed-in');
    expect(result.current.user?.login).toBe('testuser');
    expect(result.current.user?.avatarUrl).toBe('https://example.com/avatar.png');
  });

  it('becomes signed-out when getAuthenticatedUser throws', async () => {
    (getToken as ReturnType<typeof vi.fn>).mockResolvedValue('token123');
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('AUTH_ERROR'));
    const { result } = renderHook(() => useAuth());
    await act(async () => {});
    expect(result.current.status).toBe('signed-out');
  });

  it('signInWithPAT calls setTokenFromPAT then refreshes', async () => {
    (getToken as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null)         // initial load → signed-out
      .mockResolvedValueOnce('newtoken');  // after PAT-set refresh
    (setTokenFromPAT as ReturnType<typeof vi.fn>).mockResolvedValue({ login: 'newuser', scopes: ['repo'] });
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      login: 'newuser',
      avatar_url: '',
    });

    const { result } = renderHook(() => useAuth());
    await act(async () => {});
    expect(result.current.status).toBe('signed-out');

    await act(async () => {
      await result.current.signInWithPAT('ghp_test123');
    });
    expect(setTokenFromPAT).toHaveBeenCalledWith('ghp_test123');
    expect(result.current.status).toBe('signed-in');
  });

  it('signOut calls coreSignOut then sets signed-out', async () => {
    (getToken as ReturnType<typeof vi.fn>).mockResolvedValue('token123');
    (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      login: 'testuser',
      avatar_url: '',
    });
    (coreSignOut as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth());
    await act(async () => {});
    expect(result.current.status).toBe('signed-in');

    await act(async () => {
      await result.current.signOut();
    });
    expect(coreSignOut).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('signed-out');
    expect(result.current.user).toBeUndefined();
  });
});
