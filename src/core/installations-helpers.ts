// Story 4.5 — pure helpers that derive installation coverage from a stored
// list of Installation records. Used by the popup (badges) and poll-cycle
// (gating automations against suspended owners).

import type { Installation } from '../github/endpoints/installations';

export type Coverage = 'active' | 'suspended' | 'not-installed';

/** Returns coverage status for a repo's owner. */
export function coverageFor(
  repoFullName: string,
  installations: Installation[] | undefined,
): Coverage {
  if (!installations || installations.length === 0) return 'not-installed';
  const [owner] = repoFullName.split('/');
  const ownerLower = owner.toLowerCase();
  const match = installations.find(
    (inst) => inst.account.login.toLowerCase() === ownerLower,
  );
  if (!match) return 'not-installed';
  return match.suspended_at ? 'suspended' : 'active';
}

/** Set of `owner` strings whose installation is suspended. */
export function suspendedOwners(installations: Installation[] | undefined): Set<string> {
  const out = new Set<string>();
  if (!installations) return out;
  for (const inst of installations) {
    if (inst.suspended_at) out.add(inst.account.login.toLowerCase());
  }
  return out;
}

/** Comma-joined display string for the "via GitHub App on …" footer line. */
export function installationsDisplay(installations: Installation[] | undefined): string {
  if (!installations || installations.length === 0) return '';
  return installations.map((i) => i.account.login).join(', ');
}

export const INSTALL_REQUEST_URL = 'https://github.com/apps/auto-rebaser/installations/new';
