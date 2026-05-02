import { describe, it, expect } from 'vitest';
import {
  deriveStateFromMergeable,
  mapUpdateBranchError,
  parseRepoUrl,
} from '../../src/background/state-machine';
import type { MergeableState, PRState } from '../../src/core/types';

describe('deriveStateFromMergeable', () => {
  const cases: Array<[MergeableState, PRState, { action: 'rebase' | 'none'; nextState: PRState }]> = [
    ['behind',             'current',      { action: 'rebase', nextState: 'behind' }],
    ['dirty',              'current',      { action: 'none',   nextState: 'conflict' }],
    ['clean',              'current',      { action: 'none',   nextState: 'current' }],
    ['blocked',            'current',      { action: 'none',   nextState: 'current' }],
    ['draft',              'current',      { action: 'none',   nextState: 'current' }],
    ['has_hooks',          'current',      { action: 'none',   nextState: 'current' }],
    ['unstable',           'current',      { action: 'none',   nextState: 'current' }],
    ['something_unexpected','current',     { action: 'none',   nextState: 'current' }],
  ];

  it.each(cases)('mergeableState=%s returns expected', (mergeableState, prevState, expected) => {
    expect(deriveStateFromMergeable(mergeableState, prevState)).toEqual(expected);
  });

  describe('unknown keeps previousState', () => {
    const prevStates: PRState[] = ['current', 'behind', 'conflict', 'error', 'needs-manual', 'updated', 'updating'];
    it.each(prevStates)('unknown + previousState=%s → keeps previousState', (prev) => {
      const result = deriveStateFromMergeable('unknown', prev);
      expect(result.action).toBe('none');
      expect(result.nextState).toBe(prev);
    });
  });
});

describe('mapUpdateBranchError', () => {
  it('HTTP_422 → needs-manual', () => {
    const result = mapUpdateBranchError(new Error('HTTP_422: Unprocessable'));
    expect(result.state).toBe('needs-manual');
    expect(result.errorMessage).toBe('Rebase rejected by GitHub');
  });

  it('HTTP_409 → conflict', () => {
    const result = mapUpdateBranchError(new Error('HTTP_409: Conflict'));
    expect(result.state).toBe('conflict');
    expect(result.errorMessage).toBe('Merge conflict');
  });

  it('AUTH_ERROR → re-throws', () => {
    expect(() => mapUpdateBranchError(new Error('AUTH_ERROR'))).toThrow('AUTH_ERROR');
  });

  it('RATE_LIMITED → re-throws', () => {
    expect(() => mapUpdateBranchError(new Error('RATE_LIMITED'))).toThrow('RATE_LIMITED');
  });

  it('HTTP_500 → error state', () => {
    const result = mapUpdateBranchError(new Error('HTTP_500: Server Error'));
    expect(result.state).toBe('error');
    expect(result.errorMessage).toBe('HTTP_500: Server Error');
  });

  it('generic Error → error state', () => {
    const result = mapUpdateBranchError(new Error('network failure'));
    expect(result.state).toBe('error');
    expect(result.errorMessage).toBe('network failure');
  });

  it('non-Error string thrown → error state', () => {
    const result = mapUpdateBranchError('some string error');
    expect(result.state).toBe('error');
    expect(result.errorMessage).toBe('some string error');
  });

  it('non-Error object thrown → error state', () => {
    const result = mapUpdateBranchError({ code: 42 });
    expect(result.state).toBe('error');
    expect(typeof result.errorMessage).toBe('string');
  });

  it('AUTH_ERROR thrown as bare string is wrapped and re-thrown', () => {
    expect(() => mapUpdateBranchError('AUTH_ERROR')).toThrow('AUTH_ERROR');
  });

  it('RATE_LIMITED thrown as bare string is wrapped and re-thrown', () => {
    expect(() => mapUpdateBranchError('RATE_LIMITED')).toThrow('RATE_LIMITED');
  });
});

describe('parseRepoUrl', () => {
  it('happy path', () => {
    const result = parseRepoUrl('https://api.github.com/repos/myorg/myrepo');
    expect(result).toEqual({ owner: 'myorg', repo: 'myrepo', fullName: 'myorg/myrepo' });
  });

  it('throws on missing prefix', () => {
    expect(() => parseRepoUrl('https://github.com/repos/myorg/myrepo')).toThrow();
  });

  it('throws on missing slash (only owner, no repo)', () => {
    expect(() => parseRepoUrl('https://api.github.com/repos/myorg')).toThrow();
  });

  it('throws on empty string', () => {
    expect(() => parseRepoUrl('')).toThrow();
  });

  it('throws on empty owner (leading slash after prefix)', () => {
    expect(() => parseRepoUrl('https://api.github.com/repos//myrepo')).toThrow(
      /Empty owner or repo/
    );
  });
});
