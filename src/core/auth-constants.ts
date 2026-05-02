/**
 * GitHub App credentials for OAuth Device Flow.
 *
 * `__dev__` is a stub used during development. Replace with the real
 * client_id (`Iv1.<hex>`) after registering the App per
 * `docs/runbooks/github-app-setup.md` §1. No client_secret is needed —
 * Device Flow is designed for public clients.
 */
export const GITHUB_APP_CLIENT_ID = '__dev__';

/** Base origin for GitHub OAuth + Device Flow endpoints. */
export const GITHUB_DEVICE_FLOW_BASE = 'https://github.com';

/** Base origin for GitHub REST API. */
export const GITHUB_API_BASE = 'https://api.github.com';
