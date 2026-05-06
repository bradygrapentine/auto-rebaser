import { describe, it, expect } from 'vitest';
import {
  computeIdleDays,
  resolveThreshold,
  formatIdleDays,
} from '../../src/core/staleness';

describe('computeIdleDays', () => {
  const now = Date.parse('2026-05-15T00:00:00Z');

  it('returns whole-day count', () => {
    const lastActivity = Date.parse('2026-05-01T00:00:00Z'); // 14 days ago
    expect(computeIdleDays(lastActivity, now)).toBe(14);
  });

  it('rounds down partial days', () => {
    const lastActivity = now - (3 * 24 * 60 * 60 * 1000) - (10 * 60 * 60 * 1000); // 3d10h
    expect(computeIdleDays(lastActivity, now)).toBe(3);
  });

  it('returns 0 for future timestamps (clock skew safety)', () => {
    expect(computeIdleDays(now + 60_000, now)).toBe(0);
  });

  it('returns 0 when timestamps match', () => {
    expect(computeIdleDays(now, now)).toBe(0);
  });
});

describe('resolveThreshold', () => {
  it('uses per-repo override when present', () => {
    const result = resolveThreshold('org/special', {
      staleThresholdDays: 14,
      staleThresholdOverrides: { 'org/special': 7 },
    });
    expect(result).toBe(7);
  });

  it('falls back to default when no override', () => {
    const result = resolveThreshold('org/other', {
      staleThresholdDays: 30,
      staleThresholdOverrides: { 'org/special': 7 },
    });
    expect(result).toBe(30);
  });
});

describe('formatIdleDays', () => {
  it('renders days under a week', () => {
    expect(formatIdleDays(0)).toBe('idle 0d');
    expect(formatIdleDays(3)).toBe('idle 3d');
    expect(formatIdleDays(6)).toBe('idle 6d');
  });

  it('renders weeks from 7-29 days', () => {
    expect(formatIdleDays(7)).toBe('idle 1w');
    expect(formatIdleDays(14)).toBe('idle 2w');
    expect(formatIdleDays(29)).toBe('idle 4w');
  });

  it('renders months at 30+ days', () => {
    expect(formatIdleDays(30)).toBe('idle 1mo');
    expect(formatIdleDays(67)).toBe('idle 2mo');
    expect(formatIdleDays(90)).toBe('idle 3mo');
  });
});
