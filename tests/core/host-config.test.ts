import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/core/settings-store', () => ({
  loadSettings: vi.fn(),
  getSettings: vi.fn(),
}));

import {
  ghOriginFor,
  ghApiBaseFor,
  ghGraphQLFor,
  getApiBase,
  getOriginBase,
  getGraphQLEndpoint,
  getOAuthClientId,
  validateHost,
} from '../../src/core/host-config';
import { GITHUB_APP_CLIENT_ID } from '../../src/core/auth-constants';
import { loadSettings, getSettings } from '../../src/core/settings-store';

const mLoad = vi.mocked(loadSettings);
const mGet = vi.mocked(getSettings);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: cloud (no enterprise host).
  mLoad.mockResolvedValue({ intervalMinutes: 5 });
  mGet.mockResolvedValue({ intervalMinutes: 5 });
});

describe('ghOriginFor / ghApiBaseFor / ghGraphQLFor', () => {
  it('returns cloud URLs when host is empty', () => {
    expect(ghOriginFor(undefined)).toBe('https://github.com');
    expect(ghApiBaseFor(undefined)).toBe('https://api.github.com');
    expect(ghGraphQLFor(undefined)).toBe('https://api.github.com/graphql');
  });

  it('returns GHES URLs when host is set', () => {
    expect(ghOriginFor('github.acme.corp')).toBe('https://github.acme.corp');
    expect(ghApiBaseFor('github.acme.corp')).toBe('https://github.acme.corp/api/v3');
    expect(ghGraphQLFor('github.acme.corp')).toBe('https://github.acme.corp/api/graphql');
  });
});

describe('getApiBase / getOriginBase / getGraphQLEndpoint', () => {
  it('reads enterpriseHost from settings', async () => {
    mGet.mockResolvedValue({ intervalMinutes: 5, enterpriseHost: 'github.acme.corp' });
    expect(await getApiBase()).toBe('https://github.acme.corp/api/v3');
    expect(await getOriginBase()).toBe('https://github.acme.corp');
    expect(await getGraphQLEndpoint()).toBe('https://github.acme.corp/api/graphql');
  });

  it('falls back to cloud when settings load fails', async () => {
    mGet.mockRejectedValue(new Error('boom'));
    expect(await getApiBase()).toBe('https://api.github.com');
  });
});

describe('getOAuthClientId', () => {
  it('returns the cloud client_id by default', async () => {
    expect(await getOAuthClientId()).toBe(GITHUB_APP_CLIENT_ID);
  });

  it('returns the user-supplied GHES client_id when host is set', async () => {
    mGet.mockResolvedValue({
      intervalMinutes: 5,
      enterpriseHost: 'github.acme.corp',
      enterpriseClientId: 'Iv23ghes',
    });
    expect(await getOAuthClientId()).toBe('Iv23ghes');
  });

  it('returns empty string when GHES host set but client_id missing', async () => {
    mGet.mockResolvedValue({ intervalMinutes: 5, enterpriseHost: 'github.acme.corp' });
    expect(await getOAuthClientId()).toBe('');
  });
});

describe('validateHost', () => {
  it('accepts a bare host', () => {
    expect(validateHost('github.acme.corp')).toBeNull();
    expect(validateHost('github-internal.dev')).toBeNull();
  });

  it('accepts empty input (clears host)', () => {
    expect(validateHost('')).toBeNull();
  });

  it('rejects protocol prefix', () => {
    expect(validateHost('https://github.acme.corp')).toMatch(/no protocol/);
  });

  it('rejects path', () => {
    expect(validateHost('github.acme.corp/api')).toMatch(/no path/);
  });

  it('rejects whitespace', () => {
    expect(validateHost('foo bar.com')).toMatch(/no spaces/);
  });

  it('rejects garbage chars', () => {
    expect(validateHost('foo!bar.com')).toMatch(/valid domain/);
  });
});
