// Story 4.5 — pure helpers that derive installation coverage from a stored
// list of Installation records. Used by the popup (badges) and poll-cycle
// (gating automations against suspended owners).

import type { Installation } from '../github/endpoints/installations';
import { getOriginBase } from './host-config';

// Must match the slug under github.com/apps/<slug>. Mismatch = install
// link 404s or routes to a stranger's app, and the popup's
// "install or request" CTA stops working.
const APP_SLUG = 'auto-rebaser-ext';

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

/**
 * Audit B3 — derive the install-request URL from the configured host. On
 * github.com this is `https://github.com/apps/auto-rebaser-ext/installations/new`;
 * on a GHES instance it must point at the GHES host since the App lives in
 * a separate registry.
 */
export async function getInstallRequestUrl(): Promise<string> {
  const origin = await getOriginBase();
  return `${origin}/apps/${APP_SLUG}/installations/new`;
}

/** @deprecated Use `getInstallRequestUrl()` so GHES users get the right host. */
export const INSTALL_REQUEST_URL = `https://github.com/apps/${APP_SLUG}/installations/new`;
