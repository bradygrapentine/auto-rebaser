import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signIn, signOut, composeOAuthScope, setTokenFromPAT } from '../../src/core/auth';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../src/core/automations-types';

vi.mock('../../src/core/auth-store', () => ({
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

vi.mock('../../src/core/automations-store', () => ({
  getAutomationSettings: vi.fn(),
  saveAutomationSettings: vi.fn(),
}));

import * as authStore from '../../src/core/auth-store';
import * as automationsStore from '../../src/core/automations-store';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

function buildRedirectURL(params: Record<string, string>): string {
  const base = 'https://abc123.chromiumapp.org/';
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

describe('auth', () => {
  beforeEach(() => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('fixed-state' as `${string}-${string}-${string}-${string}-${string}`);
    vi.mocked(authStore.setToken).mockResolvedValue(undefined);
    vi.mocked(authStore.clearToken).mockResolvedValue(undefined);
    vi.mocked(automationsStore.getAutomationSettings).mockResolvedValue({ ...DEFAULT_AUTOMATION_SETTINGS });
    vi.mocked(automationsStore.saveAutomationSettings).mockResolvedValue(undefined);
    mockFetch.mockReset();
  });

  it('signIn throws AUTH_CANCELLED when launchWebAuthFlow returns undefined', async () => {
    chrome.identity.launchWebAuthFlow = vi.fn().mockResolvedValue(undefined);
    await expect(signIn()).rejects.toThrow('AUTH_CANCELLED');
  });

  it('signIn throws AUTH_STATE_MISMATCH when state differs', async () => {
    chrome.identity.launchWebAuthFlow = vi.fn().mockResolvedValue(
      buildRedirectURL({ code: 'c123', state: 'wrong-state' })
    );
    await expect(signIn()).rejects.toThrow('AUTH_STATE_MISMATCH');
  });

  it('signIn throws AUTH_NO_CODE when no code param', async () => {
    chrome.identity.launchWebAuthFlow = vi.fn().mockResolvedValue(
      buildRedirectURL({ state: 'fixed-state' })
    );
    await expect(signIn()).rejects.toThrow('AUTH_NO_CODE');
  });

  it('signIn throws AUTH_TOKEN_ERROR when token endpoint returns error', async () => {
    chrome.identity.launchWebAuthFlow = vi.fn().mockResolvedValue(
      buildRedirectURL({ code: 'c123', state: 'fixed-state' })
    );
    mockFetch.mockResolvedValue({
      json: vi.fn().mockResolvedValue({ error: 'bad_verification_code' }),
    });

    await expect(signIn()).rejects.toThrow('AUTH_TOKEN_ERROR: bad_verification_code');
  });

  it('signIn throws AUTH_TOKEN_ERROR when no access_token in response', async () => {
    chrome.identity.launchWebAuthFlow = vi.fn().mockResolvedValue(
      buildRedirectURL({ code: 'c123', state: 'fixed-state' })
    );
    mockFetch.mockResolvedValue({
      json: vi.fn().mockResolvedValue({}),
    });

    await expect(signIn()).rejects.toThrow('AUTH_TOKEN_ERROR: no token');
  });

  it('signIn happy path calls setToken with access_token', async () => {
    chrome.identity.launchWebAuthFlow = vi.fn().mockResolvedValue(
      buildRedirectURL({ code: 'c123', state: 'fixed-state' })
    );
    mockFetch.mockResolvedValue({
      json: vi.fn().mockResolvedValue({ access_token: 'abc' }),
    });

    await signIn();
    expect(authStore.setToken).toHaveBeenCalledWith('abc');
  });

  it('signOut calls clearToken', async () => {
    await signOut();
    expect(authStore.clearToken).toHaveBeenCalled();
  });

  describe('setTokenFromPAT', () => {
    function mockUserResponse(opts: {
      ok: boolean;
      status?: number;
      login?: string;
      scopes?: string;
    }) {
      const headers = new Map<string, string>();
      if (opts.scopes !== undefined) headers.set('x-oauth-scopes', opts.scopes);
      mockFetch.mockResolvedValue({
        ok: opts.ok,
        status: opts.status ?? (opts.ok ? 200 : 401),
        headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
        json: vi.fn().mockResolvedValue({ login: opts.login }),
      });
    }

    it('throws PAT_EMPTY on empty input', async () => {
      await expect(setTokenFromPAT('   ')).rejects.toThrow('PAT_EMPTY');
    });

    it('throws PAT_NETWORK_ERROR when fetch rejects', async () => {
      mockFetch.mockRejectedValue(new TypeError('network'));
      await expect(setTokenFromPAT('ghp_x')).rejects.toThrow('PAT_NETWORK_ERROR');
    });

    it('throws PAT_INVALID on 401', async () => {
      mockUserResponse({ ok: false, status: 401 });
      await expect(setTokenFromPAT('ghp_x')).rejects.toThrow('PAT_INVALID: HTTP_401');
      expect(authStore.setToken).not.toHaveBeenCalled();
    });

    it('throws PAT_INVALID when /user returns no login', async () => {
      mockUserResponse({ ok: true, login: undefined });
      await expect(setTokenFromPAT('ghp_x')).rejects.toThrow('PAT_INVALID: no login');
    });

    it('saves token and returns login on valid PAT with repo scope only', async () => {
      mockUserResponse({ ok: true, login: 'brady', scopes: 'repo' });

      const result = await setTokenFromPAT('  ghp_validtoken  ');

      expect(result).toEqual({ login: 'brady', scopes: ['repo'] });
      expect(authStore.setToken).toHaveBeenCalledWith('ghp_validtoken');
      // notificationsScopeGranted stays false (default).
      expect(automationsStore.saveAutomationSettings).not.toHaveBeenCalled();
    });

    it('updates notificationsScopeGranted to true when token has notifications scope', async () => {
      mockUserResponse({ ok: true, login: 'brady', scopes: 'repo, notifications' });
      vi.mocked(automationsStore.getAutomationSettings).mockResolvedValue({
        ...DEFAULT_AUTOMATION_SETTINGS,
        notificationsScopeGranted: false,
      });

      await setTokenFromPAT('ghp_x');

      expect(automationsStore.saveAutomationSettings).toHaveBeenCalledWith(
        expect.objectContaining({ notificationsScopeGranted: true }),
      );
    });

    it('flips notificationsScopeGranted back to false if a re-pasted PAT loses the scope', async () => {
      mockUserResponse({ ok: true, login: 'brady', scopes: 'repo' });
      vi.mocked(automationsStore.getAutomationSettings).mockResolvedValue({
        ...DEFAULT_AUTOMATION_SETTINGS,
        notificationsScopeGranted: true, // previously had it
      });

      await setTokenFromPAT('ghp_x');

      expect(automationsStore.saveAutomationSettings).toHaveBeenCalledWith(
        expect.objectContaining({ notificationsScopeGranted: false }),
      );
    });

    it('still saves the token when automation_settings store fails', async () => {
      mockUserResponse({ ok: true, login: 'brady', scopes: 'repo' });
      vi.mocked(automationsStore.getAutomationSettings).mockRejectedValue(new Error('storage down'));

      await expect(setTokenFromPAT('ghp_x')).resolves.toEqual({ login: 'brady', scopes: ['repo'] });
      expect(authStore.setToken).toHaveBeenCalledWith('ghp_x');
    });

    it('handles missing X-OAuth-Scopes header gracefully', async () => {
      mockUserResponse({ ok: true, login: 'brady', scopes: undefined });

      const result = await setTokenFromPAT('ghp_x');

      expect(result.scopes).toEqual([]);
    });
  });

  describe('OAuth scope composition (Phase 2)', () => {
    it('composeOAuthScope returns "repo" when no automations need elevated scope', async () => {
      vi.mocked(automationsStore.getAutomationSettings).mockResolvedValue({ ...DEFAULT_AUTOMATION_SETTINGS });
      const scope = await composeOAuthScope();
      expect(scope).toBe('repo');
    });

    it('composeOAuthScope adds notifications when autoDismissStaleNotifications is true', async () => {
      vi.mocked(automationsStore.getAutomationSettings).mockResolvedValue({
        ...DEFAULT_AUTOMATION_SETTINGS,
        autoDismissStaleNotifications: true,
      });
      const scope = await composeOAuthScope();
      expect(scope).toBe('repo notifications');
    });

    it('composeOAuthScope falls back to base scopes if settings store throws', async () => {
      vi.mocked(automationsStore.getAutomationSettings).mockRejectedValue(new Error('storage unavailable'));
      const scope = await composeOAuthScope();
      expect(scope).toBe('repo');
    });

    it('signIn requests the composed scope via launchWebAuthFlow URL', async () => {
      vi.mocked(automationsStore.getAutomationSettings).mockResolvedValue({
        ...DEFAULT_AUTOMATION_SETTINGS,
        autoDismissStaleNotifications: true,
      });
      const flow = vi.fn().mockResolvedValue(
        buildRedirectURL({ code: 'c123', state: 'fixed-state' })
      );
      chrome.identity.launchWebAuthFlow = flow;
      mockFetch.mockResolvedValue({
        json: vi.fn().mockResolvedValue({ access_token: 'abc' }),
      });

      await signIn();

      const calledWith = flow.mock.calls[0][0];
      const calledScope = new URL(calledWith.url).searchParams.get('scope');
      expect(calledScope).toBe('repo notifications');
    });

    it('signIn persists notificationsScopeGranted=true after successful elevated sign-in', async () => {
      vi.mocked(automationsStore.getAutomationSettings).mockResolvedValue({
        ...DEFAULT_AUTOMATION_SETTINGS,
        autoDismissStaleNotifications: true,
        notificationsScopeGranted: false, // not granted yet
      });
      chrome.identity.launchWebAuthFlow = vi.fn().mockResolvedValue(
        buildRedirectURL({ code: 'c123', state: 'fixed-state' })
      );
      mockFetch.mockResolvedValue({
        json: vi.fn().mockResolvedValue({ access_token: 'abc' }),
      });

      await signIn();

      expect(automationsStore.saveAutomationSettings).toHaveBeenCalledWith(
        expect.objectContaining({ notificationsScopeGranted: true })
      );
    });

    it('signIn still succeeds when scope-bookkeeping settings load fails', async () => {
      // composeOAuthScope succeeds, but the post-token bookkeeping load fails.
      vi.mocked(automationsStore.getAutomationSettings)
        .mockResolvedValueOnce({ ...DEFAULT_AUTOMATION_SETTINGS })
        .mockRejectedValueOnce(new Error('storage unavailable'));

      chrome.identity.launchWebAuthFlow = vi.fn().mockResolvedValue(
        buildRedirectURL({ code: 'c123', state: 'fixed-state' })
      );
      mockFetch.mockResolvedValue({
        json: vi.fn().mockResolvedValue({ access_token: 'abc' }),
      });

      await expect(signIn()).resolves.toBeUndefined();
      expect(authStore.setToken).toHaveBeenCalledWith('abc');
      expect(automationsStore.saveAutomationSettings).not.toHaveBeenCalled();
    });
  });
});
