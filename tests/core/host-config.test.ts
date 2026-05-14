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

describe('validateHost — SEC-2 tightened rules', () => {
  it('rejects host > 253 chars', () => {
    const long = 'a'.repeat(250) + '.co';
    expect(validateHost(long)).toMatch(/too long/);
  });

  it('rejects consecutive dots', () => {
    expect(validateHost('foo..bar.com')).toMatch(/consecutive dots/);
  });

  it('rejects leading dot', () => {
    expect(validateHost('.foo.com')).toMatch(/start or end with a dot/);
  });

  it('rejects trailing dot', () => {
    expect(validateHost('foo.com.')).toMatch(/start or end with a dot/);
  });

  it('rejects leading hyphen', () => {
    expect(validateHost('-foo.com')).toMatch(/start or end with a hyphen/);
  });

  it('rejects trailing hyphen', () => {
    expect(validateHost('foo.com-')).toMatch(/start or end with a hyphen/);
  });

  it('rejects label > 63 chars', () => {
    const longLabel = 'a'.repeat(64) + '.com';
    expect(validateHost(longLabel)).toMatch(/label too long/);
  });

  it('rejects single-label host', () => {
    expect(validateHost('singlelabel')).toMatch(/at least one dot/);
  });

  it('accepts localhost as single-label exception', () => {
    expect(validateHost('localhost')).toBeNull();
  });

  it('accepts valid GHES hosts', () => {
    expect(validateHost('github.acme.corp')).toBeNull();
    expect(validateHost('github-internal.dev')).toBeNull();
  });

  it('accepts 253-char host exactly', () => {
    // 253 chars: 63.63.63.61 pattern
    const host = 'a'.repeat(63) + '.' + 'a'.repeat(63) + '.' + 'a'.repeat(63) + '.' + 'a'.repeat(61);
    expect(host.length).toBe(253);
    expect(validateHost(host)).toBeNull();
  });
});

describe('assertGithubOrigin', () => {
  it('resolves for api.github.com without reading settings', async () => {
    const { assertGithubOrigin: fn } = await import('../../src/core/host-config');
    mGet.mockRejectedValue(new Error('should not be called'));
    await expect(fn('https://api.github.com/repos')).resolves.toBeUndefined();
    expect(mGet).not.toHaveBeenCalled();
  });

  it('throws for unknown host when no enterpriseHost configured', async () => {
    const { assertGithubOrigin: fn } = await import('../../src/core/host-config');
    mGet.mockResolvedValue({ intervalMinutes: 5 }); // no enterpriseHost
    await expect(fn('https://evil.com/api')).rejects.toThrow('INVALID_HOST');
  });

  it('throws when settings read fails', async () => {
    const { assertGithubOrigin: fn } = await import('../../src/core/host-config');
    mGet.mockRejectedValue(new Error('storage error'));
    await expect(fn('https://ghes.acme.corp/api/v3/repos')).rejects.toThrow('INVALID_HOST');
  });

  it('throws for suffix-attack URL (api.github.com.evil.com)', async () => {
    const { assertGithubOrigin: fn } = await import('../../src/core/host-config');
    mGet.mockResolvedValue({ intervalMinutes: 5, enterpriseHost: 'api.github.com' });
    await expect(fn('https://api.github.com.evil.com/repos')).rejects.toThrow('INVALID_HOST');
  });

  it('passes for the configured enterprise host', async () => {
    const { assertGithubOrigin: fn } = await import('../../src/core/host-config');
    mGet.mockResolvedValue({ intervalMinutes: 5, enterpriseHost: 'ghes.acme.corp' });
    await expect(fn('https://ghes.acme.corp/api/v3/user')).resolves.toBeUndefined();
  });

  it('throws when URL hostname differs from configured enterpriseHost', async () => {
    const { assertGithubOrigin: fn } = await import('../../src/core/host-config');
    mGet.mockResolvedValue({ intervalMinutes: 5, enterpriseHost: 'ghes.acme.corp' });
    await expect(fn('https://ghes.other.corp/api/v3/user')).rejects.toThrow('INVALID_HOST');
  });
});
