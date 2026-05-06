// Story 4.6 — derive every GitHub host URL from the user's enterpriseHost
// setting. github.com is the implicit default; a configured GHES host swaps
// the origin AND the API base path (`/api/v3` for REST, `/api/graphql` for
// GraphQL — neither path applies on cloud).

import { GITHUB_APP_CLIENT_ID } from './auth-constants';
import { getSettings } from './settings-store';

const CLOUD_ORIGIN = 'https://github.com';
const CLOUD_API = 'https://api.github.com';
const CLOUD_GRAPHQL = 'https://api.github.com/graphql';

export function ghOriginFor(host: string | undefined | null): string {
  return host ? `https://${host}` : CLOUD_ORIGIN;
}

export function ghApiBaseFor(host: string | undefined | null): string {
  return host ? `https://${host}/api/v3` : CLOUD_API;
}

export function ghGraphQLFor(host: string | undefined | null): string {
  return host ? `https://${host}/api/graphql` : CLOUD_GRAPHQL;
}

export async function getApiBase(): Promise<string> {
  const s = await getSettings().catch(() => null);
  return ghApiBaseFor(s?.enterpriseHost);
}

export async function getOriginBase(): Promise<string> {
  const s = await getSettings().catch(() => null);
  return ghOriginFor(s?.enterpriseHost);
}

export async function getGraphQLEndpoint(): Promise<string> {
  const s = await getSettings().catch(() => null);
  return ghGraphQLFor(s?.enterpriseHost);
}

/**
 * Returns the OAuth/Device-Flow client_id appropriate for the configured host.
 * GHES hosts have their own App registry; the user must paste their App's
 * client_id into settings before sign-in works.
 */
export async function getOAuthClientId(): Promise<string> {
  const s = await getSettings().catch(() => null);
  if (s?.enterpriseHost) return s.enterpriseClientId ?? '';
  return GITHUB_APP_CLIENT_ID;
}

/** Validate user input for the enterpriseHost field. Returns null on success. */
export function validateHost(input: string): string | null {
  if (!input) return null;
  if (input.includes('://')) return 'no protocol — host only (e.g. github.acme.corp)';
  if (input.includes('/')) return 'no path — host only';
  if (input.includes(' ')) return 'no spaces in host';
  if (!/^[a-z0-9.-]+$/i.test(input)) return 'host must be a valid domain';
  return null;
}
