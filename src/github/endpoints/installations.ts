// Story 4.5 — list installations of the GitHub App accessible to the
// authenticated user. Used to display org coverage and decide whether a
// PR's repo is reachable.

import { request } from '../http';

export interface InstallationAccount {
  login: string;
  type: 'User' | 'Organization';
}

export interface Installation {
  id: number;
  account: InstallationAccount;
  /** "selected" or "all" — which repos in the account the App can act on. */
  repository_selection: 'selected' | 'all' | string;
  target_type: 'User' | 'Organization' | string;
  /** ISO timestamp when the installation was suspended; null when active. */
  suspended_at?: string | null;
  /** Number of repos visible to the App in this account. */
  repositories_url?: string;
}

interface ListInstallationsResponse {
  total_count: number;
  installations: Installation[];
}

export async function getUserInstallations(accountId?: string): Promise<Installation[]> {
  const data = await request<ListInstallationsResponse>('/user/installations', { accountId });
  return data.installations ?? [];
}
