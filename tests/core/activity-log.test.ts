import { describe, it, expect, beforeEach, vi } from 'vitest';
import { trimByCapAndAge, appendActivity, clearActivity, loadActivity } from '../../src/core/activity-log';
import type { ActivityEntry } from '../../src/core/activity-log-types';
import { ACTIVITY_STORAGE_KEY } from '../../src/core/activity-log-types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(at: number, overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    at,
    action: 'rebase',
    repo: 'org/repo',
    prNumber: 1,
    prTitle: 'Test PR',
    result: 'success',
    ...overrides,
  };
}

// ── trimByCapAndAge ───────────────────────────────────────────────────────────

describe('trimByCapAndAge', () => {
  const NOW = 1_000_000;
  const DAY = 86_400_000;
  const MAX_N = 5;
  const MAX_AGE = 30 * DAY;

  it('returns all entries when within cap and age', () => {
    const entries = [
      makeEntry(NOW - DAY),
      makeEntry(NOW - 2 * DAY),
      makeEntry(NOW - DAY * 15),
    ];
    const result = trimByCapAndAge(entries, MAX_N, MAX_AGE, NOW);
    expect(result).toHaveLength(3);
  });

  it('drops entries older than maxAgeMs', () => {
    const fresh = makeEntry(NOW - DAY);
    const old = makeEntry(NOW - 31 * DAY);
    const result = trimByCapAndAge([old, fresh], MAX_N, MAX_AGE, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].at).toBe(fresh.at);
  });

  it('keeps entry exactly at the cutoff boundary (at >= cutoff)', () => {
    const atCutoff = makeEntry(NOW - 30 * DAY); // exactly at boundary
    const justOver = makeEntry(NOW - 30 * DAY - 1); // 1ms too old
    const result = trimByCapAndAge([justOver, atCutoff], MAX_N, MAX_AGE, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].at).toBe(atCutoff.at);
  });

  it('trims to maxN keeping the most-recent entries', () => {
    // Create 8 entries; newest last.
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry(NOW - (8 - i) * 1000)
    );
    const result = trimByCapAndAge(entries, MAX_N, MAX_AGE, NOW);
    expect(result).toHaveLength(MAX_N);
    // The last MAX_N entries should be retained (most recent).
    expect(result[result.length - 1].at).toBe(entries[7].at);
    expect(result[0].at).toBe(entries[3].at);
  });

  it('applies age filter before cap — does not count already-dropped entries against cap', () => {
    // 3 old + 3 fresh; cap=5. After age filter: 3 remain (< cap). None sliced.
    const old = Array.from({ length: 3 }, () => makeEntry(NOW - 31 * DAY));
    const fresh = Array.from({ length: 3 }, (_, i) => makeEntry(NOW - i * 1000));
    const result = trimByCapAndAge([...old, ...fresh], 5, MAX_AGE, NOW);
    expect(result).toHaveLength(3);
  });

  it('returns empty array when all entries are too old', () => {
    const entries = [makeEntry(NOW - 31 * DAY), makeEntry(NOW - 60 * DAY)];
    expect(trimByCapAndAge(entries, MAX_N, MAX_AGE, NOW)).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(trimByCapAndAge([], MAX_N, MAX_AGE, NOW)).toHaveLength(0);
  });

  it('does not mutate the input array', () => {
    const entries = Array.from({ length: 8 }, (_, i) => makeEntry(NOW - i * 1000));
    const original = [...entries];
    trimByCapAndAge(entries, MAX_N, MAX_AGE, NOW);
    expect(entries).toEqual(original);
  });

  it('cap of 200 and age of 30 days: default constants smoke test', () => {
    // With defaults, 200 fresh entries → all 200 kept.
    const entries = Array.from({ length: 200 }, (_, i) => makeEntry(NOW - i * 1000));
    const result = trimByCapAndAge(entries, 200, 30 * 86_400_000, NOW);
    expect(result).toHaveLength(200);
  });

  it('exactly 201 entries → trimmed to 200', () => {
    const entries = Array.from({ length: 201 }, (_, i) => makeEntry(NOW - i * 1000));
    expect(trimByCapAndAge(entries, 200, 30 * 86_400_000, NOW)).toHaveLength(200);
  });
});

// ── appendActivity ────────────────────────────────────────────────────────────

describe('appendActivity', () => {
  beforeEach(() => {
    (chrome.storage.local.get as ReturnType<typeof Object>).mockResolvedValue({});
    (chrome.storage.local.set as ReturnType<typeof Object>).mockResolvedValue(undefined);
  });

  it('writes merged entries to storage', async () => {
    const entry = makeEntry(Date.now());
    await appendActivity([entry]);
    expect(chrome.storage.local.set).toHaveBeenCalledOnce();
    const arg = (chrome.storage.local.set as ReturnType<typeof Object>).mock.calls[0][0];
    expect(arg[ACTIVITY_STORAGE_KEY].entries).toHaveLength(1);
    expect(arg[ACTIVITY_STORAGE_KEY].entries[0].action).toBe('rebase');
  });

  it('appends to existing entries', async () => {
    const base = Date.now();
    const existing = makeEntry(base - 1000);
    (chrome.storage.local.get as ReturnType<typeof Object>).mockResolvedValue({
      [ACTIVITY_STORAGE_KEY]: { entries: [existing] },
    });
    await appendActivity([makeEntry(base)]);
    const arg = (chrome.storage.local.set as ReturnType<typeof Object>).mock.calls[0][0];
    expect(arg[ACTIVITY_STORAGE_KEY].entries).toHaveLength(2);
  });

  it('is a no-op when newEntries is empty', async () => {
    await appendActivity([]);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('storage write failure is non-fatal — logs to console.error', async () => {
    (chrome.storage.local.set as ReturnType<typeof Object>).mockRejectedValue(
      new Error('quota exceeded')
    );
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(appendActivity([makeEntry(Date.now())])).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      '[activity] append failed:',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it('storage read failure is non-fatal — logs to console.error', async () => {
    (chrome.storage.local.get as ReturnType<typeof Object>).mockRejectedValue(
      new Error('storage unavailable')
    );
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(appendActivity([makeEntry(Date.now())])).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('trims to 200 entries when cap exceeded', async () => {
    const base = Date.now();
    const existing = Array.from({ length: 200 }, (_, i) => makeEntry(base - (200 - i) * 1000));
    (chrome.storage.local.get as ReturnType<typeof Object>).mockResolvedValue({
      [ACTIVITY_STORAGE_KEY]: { entries: existing },
    });
    await appendActivity([makeEntry(base)]);
    const arg = (chrome.storage.local.set as ReturnType<typeof Object>).mock.calls[0][0];
    expect(arg[ACTIVITY_STORAGE_KEY].entries).toHaveLength(200);
  });
});

// ── clearActivity ─────────────────────────────────────────────────────────────

describe('clearActivity', () => {
  it('sets entries to empty array', async () => {
    (chrome.storage.local.set as ReturnType<typeof Object>).mockResolvedValue(undefined);
    await clearActivity();
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [ACTIVITY_STORAGE_KEY]: { entries: [] },
    });
  });
});

// ── loadActivity ──────────────────────────────────────────────────────────────

describe('loadActivity', () => {
  it('returns stored entries', async () => {
    const entries = [makeEntry(1000), makeEntry(2000)];
    (chrome.storage.local.get as ReturnType<typeof Object>).mockResolvedValue({
      [ACTIVITY_STORAGE_KEY]: { entries },
    });
    const result = await loadActivity();
    expect(result).toHaveLength(2);
  });

  it('returns empty array when key missing', async () => {
    (chrome.storage.local.get as ReturnType<typeof Object>).mockResolvedValue({});
    expect(await loadActivity()).toEqual([]);
  });

  it('returns empty array on storage error', async () => {
    (chrome.storage.local.get as ReturnType<typeof Object>).mockRejectedValue(
      new Error('fail')
    );
    expect(await loadActivity()).toEqual([]);
  });
});
