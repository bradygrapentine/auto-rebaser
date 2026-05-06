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
    try {
      const auth = await getAuth();
      if (!auth) {
        setState({ status: 'signed-out' });
        return;
      }
      const ghUser = await getAuthenticatedUser();
      setState({
        status: 'signed-in',
        method: auth.method,
        ...(auth.method === 'github_app' && auth.installations
          ? { installations: auth.installations }
          : {}),
        user: { login: ghUser.login, avatarUrl: ghUser.avatar_url },
      });
    } catch {
      setState({ status: 'signed-out' });
    }
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
