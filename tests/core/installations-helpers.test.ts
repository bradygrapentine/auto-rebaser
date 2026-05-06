import { describe, it, expect } from 'vitest';
import {
  coverageFor,
  suspendedOwners,
  installationsDisplay,
} from '../../src/core/installations-helpers';
import type { Installation } from '../../src/github/endpoints/installations';

const inst = (
  login: string,
  over: Partial<Installation> = {},
): Installation => ({
  id: 1,
  account: { login, type: 'Organization' },
  repository_selection: 'all',
  target_type: 'Organization',
  ...over,
});

describe('coverageFor', () => {
  it('returns not-installed when list is empty', () => {
    expect(coverageFor('octo/repo', [])).toBe('not-installed');
  });

  it('returns not-installed when list is undefined', () => {
    expect(coverageFor('octo/repo', undefined)).toBe('not-installed');
  });

  it('returns active when owner has a non-suspended installation', () => {
    expect(coverageFor('octo/r', [inst('octo')])).toBe('active');
  });

  it('returns suspended when owner has a suspended installation', () => {
    expect(coverageFor('octo/r', [inst('octo', { suspended_at: '2026-01-01T00:00:00Z' })])).toBe(
      'suspended',
    );
  });

  it('matches owner case-insensitively', () => {
    expect(coverageFor('OCTO/r', [inst('octo')])).toBe('active');
    expect(coverageFor('octo/r', [inst('OCTO')])).toBe('active');
  });

  it('returns not-installed when owner is not in the list', () => {
    expect(coverageFor('other/r', [inst('octo')])).toBe('not-installed');
  });
});

describe('suspendedOwners', () => {
  it('returns owners with suspended_at set, lowercased', () => {
    const set = suspendedOwners([
      inst('Acme', { suspended_at: 'now' }),
      inst('Active'),
      inst('Other', { suspended_at: 'then' }),
    ]);
    expect(set.has('acme')).toBe(true);
    expect(set.has('active')).toBe(false);
    expect(set.has('other')).toBe(true);
  });

  it('handles undefined input', () => {
    expect(suspendedOwners(undefined).size).toBe(0);
  });
});

describe('installationsDisplay', () => {
  it('comma-joins logins', () => {
    expect(installationsDisplay([inst('a'), inst('b'), inst('c')])).toBe('a, b, c');
  });

  it('returns empty string for empty/undefined input', () => {
    expect(installationsDisplay(undefined)).toBe('');
    expect(installationsDisplay([])).toBe('');
  });
});
