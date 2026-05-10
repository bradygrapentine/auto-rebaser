import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getAuth,
  getToken,
  setToken,
  setAuthGitHubApp,
  setAuthPAT,
  setInstallations,
  clearAuth,
  clearToken,
  AUTH_KEY,
  type AuthGitHubApp,
} from '../../src/core/auth-store';
import { STORAGE_KEYS } from '../../src/core/constants';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('auth-store', () => {
  describe('getAuth', () => {
    it('returns null when nothing stored anywhere', async () => {
      chrome.storage.local.get = vi.fn().mockResolvedValue({});
      chrome.storage.sync.get = vi.fn().mockResolvedValue({});
      expect(await getAuth()).toBeNull();
    });

    it('returns the new tagged-union shape from local', async () => {
      const auth: AuthGitHubApp = {
        method: 'github_app',
        accessToken: 'gho_x',
        refreshToken: 'ghr_x',
        accessTokenExpiresAt: 100,
        refreshTokenExpiresAt: 200,
      };
      chrome.storage.local.get = vi.fn().mockResolvedValue({ [AUTH_KEY]: auth });
      expect(await getAuth()).toEqual(auth);
    });

    it('migrates legacy sync.github_token to local PAT auth on first read', async () => {
      chrome.storage.local.get = vi.fn().mockResolvedValue({});
      chrome.storage.sync.get = vi.fn().mockResolvedValue({ [STORAGE_KEYS.token]: 'ghp_legacy' });
      chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);
      chrome.storage.sync.remove = vi.fn().mockResolvedValue(undefined);

      const result = await getAuth();
      expect(result).toEqual({ method: 'pat', token: 'ghp_legacy' });
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        [AUTH_KEY]: { method: 'pat', token: 'ghp_legacy' },
      });
      expect(chrome.storage.sync.remove).toHaveBeenCalledWith(STORAGE_KEYS.token);
    });
  });

  describe('getToken (back-compat)', () => {
    it('returns null when signed out', async () => {
      chrome.storage.local.get = vi.fn().mockResolvedValue({});
      chrome.storage.sync.get = vi.fn().mockResolvedValue({});
      expect(await getToken()).toBeNull();
    });

    it('returns access token for github_app auth', async () => {
      chrome.storage.local.get = vi.fn().mockResolvedValue({
        [AUTH_KEY]: {
          method: 'github_app',
          accessToken: 'gho_app',
          refreshToken: 'ghr_x',
          accessTokenExpiresAt: 0,
          refreshTokenExpiresAt: 0,
        },
      });
      expect(await getToken()).toBe('gho_app');
    });

    it('returns token for pat auth', async () => {
      chrome.storage.local.get = vi.fn().mockResolvedValue({
        [AUTH_KEY]: { method: 'pat', token: 'ghp_pat' },
      });
      expect(await getToken()).toBe('ghp_pat');
    });
  });

  describe('setAuthGitHubApp', () => {
    it('persists the github_app union shape to local', async () => {
      chrome.storage.local.get = vi.fn().mockResolvedValue({});
      chrome.storage.sync.get = vi.fn().mockResolvedValue({});
      chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);
      await setAuthGitHubApp({
        accessToken: 'gho',
        refreshToken: 'ghr',
        accessTokenExpiresAt: 100,
        refreshTokenExpiresAt: 200,
      });
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        [AUTH_KEY]: {
          method: 'github_app',
          accessToken: 'gho',
          refreshToken: 'ghr',
          accessTokenExpiresAt: 100,
          refreshTokenExpiresAt: 200,
        },
      });
    });

    it('preserves previously-fetched installations across token rotations', async () => {
      const prevInstalls = [{
        id: 1,
        account: { login: 'octocat', type: 'User' as const },
        repository_selection: 'all',
        target_type: 'User',
      }];
      chrome.storage.local.get = vi.fn().mockResolvedValue({
        [AUTH_KEY]: {
          method: 'github_app',
          accessToken: 'old',
          refreshToken: 'old',
          accessTokenExpiresAt: 0,
          refreshTokenExpiresAt: 0,
          installations: prevInstalls,
        },
      });
      chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);
      await setAuthGitHubApp({
        accessToken: 'new',
        refreshToken: 'new',
        accessTokenExpiresAt: 100,
        refreshTokenExpiresAt: 200,
      });
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        [AUTH_KEY]: expect.objectContaining({
          accessToken: 'new',
          installations: prevInstalls,
        }),
      });
    });
  });

  describe('setAuthPAT / setToken', () => {
    it('setAuthPAT writes the pat shape to local', async () => {
      chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);
      await setAuthPAT('ghp_pat');
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        [AUTH_KEY]: { method: 'pat', token: 'ghp_pat' },
      });
    });

    it('setToken is an alias for setAuthPAT', async () => {
      chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);
      await setToken('ghp_pat');
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        [AUTH_KEY]: { method: 'pat', token: 'ghp_pat' },
      });
    });
  });

  describe('clearAuth / clearToken', () => {
    it('removes the local auth key AND the legacy sync key', async () => {
      chrome.storage.local.remove = vi.fn().mockResolvedValue(undefined);
      chrome.storage.sync.remove = vi.fn().mockResolvedValue(undefined);
      await clearAuth();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(AUTH_KEY);
      expect(chrome.storage.sync.remove).toHaveBeenCalledWith(STORAGE_KEYS.token);
    });

    // Audit cleanup — sign-out drops per-account state to prevent cross-account
    // leakage on shared devices.
    it('also removes pingedPRs and resolved_threads from local', async () => {
      chrome.storage.local.remove = vi.fn().mockResolvedValue(undefined);
      chrome.storage.sync.remove = vi.fn().mockResolvedValue(undefined);
      await clearAuth();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith([
        'pingedPRs',
        'resolved_threads',
      ]);
    });

    it('clearToken is an alias for clearAuth', async () => {
      chrome.storage.local.remove = vi.fn().mockResolvedValue(undefined);
      chrome.storage.sync.remove = vi.fn().mockResolvedValue(undefined);
      await clearToken();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(AUTH_KEY);
    });
  });

  describe('setInstallations', () => {
    it('updates only the installations list on a github_app auth', async () => {
      const existing: AuthGitHubApp = {
        method: 'github_app',
        accessToken: 'a', refreshToken: 'r',
        accessTokenExpiresAt: 999, refreshTokenExpiresAt: 9999,
        installations: [
          { id: 1, account: { login: 'octo', type: 'User' }, repository_selection: 'all', target_type: 'User' },
        ],
      };
      chrome.storage.local.get = vi.fn().mockResolvedValue({ [AUTH_KEY]: existing });
      chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);

      await setInstallations([
        { id: 2, account: { login: 'acme', type: 'Organization' }, repository_selection: 'selected', target_type: 'Organization' },
      ]);

      const call = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const stored = call[AUTH_KEY] as AuthGitHubApp;
      expect(stored.method).toBe('github_app');
      expect(stored.accessToken).toBe('a');
      expect(stored.installations).toHaveLength(1);
      expect(stored.installations?.[0].id).toBe(2);
      expect(stored.installations?.[0].account.login).toBe('acme');
    });

    it('is a no-op when the user is signed out', async () => {
      chrome.storage.local.get = vi.fn().mockResolvedValue({});
      chrome.storage.sync.get = vi.fn().mockResolvedValue({});
      chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);
      await setInstallations([]);
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    it('is a no-op when the user is signed in via PAT', async () => {
      chrome.storage.local.get = vi.fn().mockResolvedValue({
        [AUTH_KEY]: { method: 'pat', token: 'ghp_xxx' },
      });
      chrome.storage.sync.get = vi.fn().mockResolvedValue({});
      chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);
      await setInstallations([]);
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });
  });
});
