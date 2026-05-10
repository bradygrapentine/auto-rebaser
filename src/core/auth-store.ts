// Story 4.3 — tagged-union Auth persisted in chrome.storage.local.
//
// Tokens never go to sync — sync is gossipy (encrypted in transit but pushed
// to every signed-in browser) and the Phase-4 spec requires local-only.
//
// Migration: pre-4.3 builds stored a single PAT string under sync.github_token.
// First `getAuth()` after upgrade reads that, rewrites it as
// `{ method: 'pat', token }` in local, and removes the sync key.

import { STORAGE_KEYS } from './constants';
import type { TokenSet } from './auth-device-flow';
import type { Installation } from '../github/endpoints/installations';
import { readAccountKey, writeAccountKey, removeAccountKey } from './storage/multi-account';

export const AUTH_KEY = 'auth';

export interface AuthGitHubApp extends TokenSet {
  method: 'github_app';
  /**
   * Story 4.5 — installations the user can access. Populated after sign-in,
   * refreshed on demand. Optional so older stored auth values keep loading
   * without migration.
   */
  installations?: Installation[];
}

export interface AuthPAT {
  method: 'pat';
  token: string;
}

export type Auth = AuthGitHubApp | AuthPAT;

export async function getAuth(): Promise<Auth | null> {
  const stored = await readAccountKey('auth');
  if (stored) return stored;

  // Migration from legacy sync.github_token (PAT only — pre-4.3 builds didn't
  // support GitHub App auth at all).
  const sync = await chrome.storage.sync.get(STORAGE_KEYS.token);
  const legacy = sync[STORAGE_KEYS.token] as string | undefined;
  if (legacy) {
    const auth: AuthPAT = { method: 'pat', token: legacy };
    await writeAccountKey('auth', auth);
    await chrome.storage.sync.remove(STORAGE_KEYS.token);
    return auth;
  }
  return null;
}

export async function setAuthGitHubApp(tokenSet: TokenSet): Promise<void> {
  // Preserve any previously-fetched installations across token rotations.
  const prev = await getAuth();
  const installations =
    prev && prev.method === 'github_app' ? prev.installations : undefined;
  const auth: AuthGitHubApp = {
    method: 'github_app',
    ...tokenSet,
    ...(installations ? { installations } : {}),
  };
  await writeAccountKey('auth', auth);
}

/**
 * Story 4.5 — update only the installations list on the current github_app
 * auth. No-op when the user is signed in via PAT or signed out.
 */
export async function setInstallations(installations: Installation[]): Promise<void> {
  const prev = await getAuth();
  if (!prev || prev.method !== 'github_app') return;
  const next: AuthGitHubApp = { ...prev, installations };
  await writeAccountKey('auth', next);
}

export async function setAuthPAT(token: string): Promise<void> {
  const auth: AuthPAT = { method: 'pat', token };
  await writeAccountKey('auth', auth);
}

export async function clearAuth(): Promise<void> {
  await removeAccountKey('auth');
  // Belt-and-suspenders: also drop the legacy sync key in case migration
  // hasn't run yet on this device.
  await chrome.storage.sync.remove(STORAGE_KEYS.token);
  // Audit cleanup — drop per-account state that would otherwise leak across
  // sign-ins on a shared device.
  await removeAccountKey('pingedPRs');
  await removeAccountKey('rerequestedPRs');
  await removeAccountKey('resolved_threads');
}

// ── Back-compat shims so callers don't all need to know about the new shape ──

/**
 * Returns the current access token (PAT or GitHub App access_token), or null
 * if the user is signed out. Does NOT refresh — callers that hit the GitHub
 * API should use `ensureFreshToken()` from `auth-refresh.ts` instead.
 */
export async function getToken(): Promise<string | null> {
  const auth = await getAuth();
  if (!auth) return null;
  return auth.method === 'github_app' ? auth.accessToken : auth.token;
}

/** Persist a PAT. Equivalent to `setAuthPAT`. */
export async function setToken(token: string): Promise<void> {
  await setAuthPAT(token);
}

/** Sign out. Equivalent to `clearAuth`. */
export async function clearToken(): Promise<void> {
  await clearAuth();
}
