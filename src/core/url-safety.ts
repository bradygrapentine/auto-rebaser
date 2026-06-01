// TRIAGE-2 / SEC-11 — synchronous render-time origin guard for URLs that arrive
// straight from the GitHub API (check-run `detailsUrl` / status `targetUrl`). A
// hostile GHES could return a data:/javascript:/arbitrary URL; only https: URLs
// whose hostname is github.com OR the configured enterprise host are safe to
// render as a clickable link. Everything else → render as plain text. No DOM, no
// settings I/O (caller threads the host from useSettings()).
//
// Cloud-host note (do NOT "fix" to api.github.com): `assertGithubOrigin`
// (host-config.ts) allowlists `api.github.com` because it guards *API* calls.
// This guards *render* URLs — check-run detailsUrl / status targetUrl live on
// `github.com` (the web host), NOT api.github.com. The cloud host differs by
// design (render-host vs API-host); it is `assertGithubOrigin`'s exact-match
// posture that is mirrored here, not its host list.

export function isSafeExternalUrl(
  rawUrl: string | null | undefined,
  enterpriseHost?: string | null,
): boolean {
  if (!rawUrl) return false;
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false; // blocks data:, javascript:, http:
  if (u.hostname === 'github.com') return true;
  // Exact match only (no endsWith) — blocks github.com.evil.com, mirroring
  // assertGithubOrigin's exact-hostname posture at host-config.ts.
  if (enterpriseHost && u.hostname === enterpriseHost) return true;
  return false;
}
