import { describe, it, expect } from 'vitest';
import { capCiList, MAX_RENDERED_CI_NAMES } from '../../src/core/ci-format';

describe('capCiList', () => {
  it('defaults to MAX_RENDERED_CI_NAMES (2)', () => {
    expect(MAX_RENDERED_CI_NAMES).toBe(2);
    expect(capCiList(['a', 'b', 'c'])).toEqual({ shown: ['a', 'b'], extra: 1 });
  });

  it('no overflow at exactly the cap (boundary)', () => {
    expect(capCiList(['a', 'b'])).toEqual({ shown: ['a', 'b'], extra: 0 });
  });

  it('below the cap → all shown, zero extra', () => {
    expect(capCiList(['a'])).toEqual({ shown: ['a'], extra: 0 });
    expect(capCiList([])).toEqual({ shown: [], extra: 0 });
  });

  it('is generic over the element type (objects, not just strings)', () => {
    const objs = [{ name: 'x' }, { name: 'y' }, { name: 'z' }];
    const { shown, extra } = capCiList(objs);
    expect(shown).toEqual([{ name: 'x' }, { name: 'y' }]);
    expect(extra).toBe(1);
  });

  it('honors an explicit max', () => {
    expect(capCiList(['a', 'b', 'c', 'd'], 3)).toEqual({ shown: ['a', 'b', 'c'], extra: 1 });
  });
});
