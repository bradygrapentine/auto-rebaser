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
import {
  readAccountKey,
  writeAccountKey,
  removeAccountKey,
  readAccountKeyFor,
  writeAccountKeyFor,
  getActiveAccountId,
  buildAccountId,
  migrateAndWriteAuth,
} from './storage/multi-account';
import { getApiBase } from './host-config';

export const AUTH_KEY = 'auth';

export interface AuthGitHubApp extends TokenSet {
  method: 'github_app';
  /** GitHub user login for this auth blob — populated synchronously by
   *  setAuthGitHubApp's /user fetch (T1). Used to seed inline legacy
   *  migrations and avoid `gh_unknown` fallbacks. Optional only because
   *  older stored auth values pre-T1 may lack it. */
  login?: string;
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
  /** Cached GitHub login, populated after a successful /user fetch so the
   * account switcher pill shows the username instead of "me". */
  login?: string;
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

async function fetchLoginForToken(accessToken: string): Promise<string> {
  const apiBase = await getApiBase();
  const res = await fetch(`${apiBase}/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`AUTH_USER_FETCH_FAILED: HTTP_${res.status}`);
  const user = (await res.json()) as { login?: string };
  if (!user.login) throw new Error('AUTH_USER_FETCH_FAILED: no login');
  return user.login;
}

export async function setAuthGitHubApp(tokenSet: TokenSet): Promise<void> {
  const activeId = await getActiveAccountId();

  if (activeId) {
    // Preserve any previously-fetched installations + login across token rotations.
    const prev = await readAccountKeyFor(activeId, 'auth');
    const installations =
      prev && prev.method === 'github_app' ? prev.installations : undefined;
    const login =
      prev && prev.method === 'github_app' ? prev.login : undefined;
    const auth: AuthGitHubApp = {
      method: 'github_app',
      ...tokenSet,
      ...(login ? { login } : {}),
      ...(installations ? { installations } : {}),
    };
    await writeAccountKeyFor(activeId, 'auth', auth);
    return;
  }

  // First sign-in (no active account). Fetch /user synchronously to derive
  // the accountId — never write to a `gh_unknown` namespace. If /user
  // fails, throw and let the popup surface the retry. Legacy top-level
  // `auth` (if any) is migrated separately by readAccountKey's inline
  // migration or by the add-account flow's resolver — NOT here, because
  // we don't have the legacy account's login at this entry point.
  const login = await fetchLoginForToken(tokenSet.accessToken);
  const newId = buildAccountId(login);
  const auth: AuthGitHubApp = { method: 'github_app', ...tokenSet, login };

  await migrateAndWriteAuth({
    legacyAuth: null,
    legacyId: null,
    newId,
    newAuth: auth,
  });
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

export async function setAuthPAT(token: string, knownLogin?: string): Promise<void> {
  const activeId = await getActiveAccountId();

  if (activeId) {
    const prev = await readAccountKeyFor(activeId, 'auth');
    const login =
      knownLogin ?? (prev && prev.method === 'pat' ? prev.login : undefined);
    const auth: AuthPAT = { method: 'pat', token, ...(login ? { login } : {}) };
    await writeAccountKeyFor(activeId, 'auth', auth);
    return;
  }

  // First sign-in (no active account). Fetch /user synchronously unless the
  // caller already did and passed `knownLogin`. Never write `gh_unknown`.
  // Legacy migration is owned by readAccountKey/add-account path — not here.
  const login = knownLogin ?? (await fetchLoginForToken(token));
  const newId = buildAccountId(login);
  const auth: AuthPAT = { method: 'pat', token, login };

  await migrateAndWriteAuth({
    legacyAuth: null,
    legacyId: null,
    newId,
    newAuth: auth,
  });
}

/** Cache the GitHub login on the current PAT auth blob. No-op for other methods. */
export async function setPATLogin(login: string): Promise<void> {
  const prev = await getAuth();
  if (!prev || prev.method !== 'pat') return;
  await writeAccountKey('auth', { ...prev, login });
}

/** Explicit-id variant — reads the named account's auth directly. */
export async function getAuthFor(accountId: string): Promise<Auth | null> {
  const stored = await readAccountKeyFor(accountId, 'auth');
  return stored ?? null;
}

/** Explicit-id variant — update only installations on the named account's auth. No-op for non-App. */
export async function setInstallationsFor(
  accountId: string,
  installations: Installation[],
): Promise<void> {
  const prev = await getAuthFor(accountId);
  if (!prev || prev.method !== 'github_app') return;
  const next: AuthGitHubApp = { ...prev, installations };
  await writeAccountKeyFor(accountId, 'auth', next);
}

/** Explicit-id variant — write the named account's GitHub App auth. Preserves installations. */
export async function setAuthGitHubAppFor(accountId: string, tokenSet: TokenSet): Promise<void> {
  const prev = await getAuthFor(accountId);
  const installations =
    prev && prev.method === 'github_app' ? prev.installations : undefined;
  const auth: AuthGitHubApp = {
    method: 'github_app',
    ...tokenSet,
    ...(installations ? { installations } : {}),
  };
  await writeAccountKeyFor(accountId, 'auth', auth);
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
