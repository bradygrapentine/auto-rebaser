// Wave B1 — Lightweight per-account display data for the popup switcher.
//
// Reads each account's auth + the global host config, returns one row per
// signed-in account. Pure read — does not refresh tokens, does not call
// /user. Avatar / login come from auth.user populated by useAuth on
// sign-in; if absent (legacy auth, or pre-B1 sign-in flow), falls back
// to deriving login from the accountId itself.

import { listAccountIds, getAccountState } from './multi-account';
import type { Auth } from '../auth-store';

export interface AccountSummary {
  /** Stable id, matches `accounts.<id>` namespace key. */
  id: string;
  /** Display login (lowercased GitHub login). */
  login: string;
  /** Avatar URL if known; '' otherwise. */
  avatarUrl: string;
  /** Auth method as recorded under the account. */
  method: 'github_app' | 'pat';
  /** GHES host without protocol/path; empty for cloud accounts. */
  host: string;
  /**
   * Wave B1 — true when an installation under this account is in
   * `suspended` state. Surface as a yellow dot on the switcher row.
   */
  suspended: boolean;
}

/** Strip the `gh_` (and any GHES `<host>_`) prefix from an accountId
 *  so we can show a sensible login when no auth metadata is stored. */
function loginFromId(id: string): string {
  return id.startsWith('gh_') ? id.slice(3).split('_').pop() ?? id : id;
}

/** Pull the host portion (with dots restored) from an accountId, if any. */
function hostFromId(id: string): string {
  if (!id.startsWith('gh_')) return '';
  const parts = id.slice(3).split('_');
  if (parts.length <= 1) return '';
  // Last segment is the login; everything before it is the host (dots → underscores).
  return parts.slice(0, -1).join('.');
}

/**
 * Returns one row per signed-in account, in insertion order.
 * Returns [] when no accounts namespace exists (fresh install).
 */
export async function getAccountSummaries(): Promise<AccountSummary[]> {
  const ids = await listAccountIds();
  const out: AccountSummary[] = [];
  for (const id of ids) {
    const auth = (await getAccountState(id, 'auth')) as Auth | undefined;
    if (!auth) continue;
    const installations = auth.method === 'github_app' ? auth.installations ?? [] : [];
    const suspended =
      installations.length > 0 && installations.every((i) => i.suspended_at !== null);
    out.push({
      id,
      login: loginFromId(id),
      avatarUrl: '',
      method: auth.method,
      host: hostFromId(id),
      suspended,
    });
  }
  return out;
}
