import { useState, useEffect, useCallback } from 'react';
import { getAuth } from '../../core/auth-store';
import { signOut as coreSignOut, setTokenFromPAT } from '../../core/auth';
import { getAuthenticatedUser } from '../../github/endpoints';
import type { Installation } from '../../github/endpoints/installations';

export interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in' | 'error';
  user?: { login: string; avatarUrl: string };
  /** Story 4.4 — which auth method the current session uses. */
  method?: 'github_app' | 'pat';
  /** Story 4.5 — installations the GitHub App is installed on (App auth only). */
  installations?: Installation[];
  error?: string;
}

export interface UseAuthResult extends AuthState {
  /** Save a Personal Access Token. Throws on invalid PAT (caller surfaces error). */
  signInWithPAT: (pat: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useAuth(): UseAuthResult {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }));
    const auth = await getAuth();
    if (!auth) {
      setState({ status: 'signed-out' });
      return;
    }

    // /user is informational (login + avatar). If it fails — the App
    // lacks `read:user`, the network is down, GitHub returned a transient
    // 5xx — keep the session signed-in with whatever fallback identity we
    // can derive (App installations carry the account login). Without
    // this, a single failed /user call after sign-in would knock the
    // popup back to SignInView even though storage still holds a valid
    // tokenSet.
    const fallbackLogin = auth.method === 'github_app' && auth.installations?.[0]
      ? auth.installations[0].account.login
      : undefined;

    let ghUser: Awaited<ReturnType<typeof getAuthenticatedUser>> | null = null;
    try {
      ghUser = await getAuthenticatedUser();
    } catch (err) {
      // Only AUTH_ERROR (401 after refresh) means the token is dead;
      // anything else is transient.
      if (err instanceof Error && err.message === 'AUTH_ERROR') {
        setState({ status: 'signed-out' });
        return;
      }
    }

    setState({
      status: 'signed-in',
      method: auth.method,
      ...(auth.method === 'github_app' && auth.installations
        ? { installations: auth.installations }
        : {}),
      user: ghUser
        ? { login: ghUser.login, avatarUrl: ghUser.avatar_url }
        : fallbackLogin
          ? { login: fallbackLogin, avatarUrl: '' }
          : undefined,
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signInWithPAT = async (pat: string) => {
    await setTokenFromPAT(pat);
    await refresh();
  };

  const signOut = async () => {
    await coreSignOut();
    setState({ status: 'signed-out' });
  };

  return { ...state, signInWithPAT, signOut, refresh };
}
