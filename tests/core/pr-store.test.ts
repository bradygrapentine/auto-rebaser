import { describe, it, expect, vi } from 'vitest';
import { loadStore, saveStore, upsertPRs, pruneStale, stampPollTime } from '../../src/core/pr-store';
import { STORAGE_KEYS } from '../../src/core/constants';
import type { PRRecord, PRStore } from '../../src/core/types';

const makePR = (id: number, overrides: Partial<PRRecord> = {}): PRRecord => ({
  id,
  number: id,
  title: `PR ${id}`,
  repo: 'owner/repo',
  url: `https://github.com/owner/repo/pull/${id}`,
  state: 'current',
  lastUpdated: 1000,
  ...overrides,
});

describe('pr-store', () => {
  describe('loadStore', () => {
    it('returns empty default when nothing stored', async () => {
      chrome.storage.local.get = vi.fn().mockResolvedValue({});
      const store = await loadStore();
      expect(store).toEqual({ prs: [], lastPollAt: null });
    });

    it('returns stored value', async () => {
      const stored: PRStore = { prs: [makePR(1)], lastPollAt: 12345 };
      chrome.storage.local.get = vi.fn().mockResolvedValue({ [STORAGE_KEYS.prStore]: stored });
      const store = await loadStore();
      expect(store).toEqual(stored);
    });
  });

  describe('saveStore', () => {
    it('round-trips via saveStore/loadStore', async () => {
      const storeData: Record<string, unknown> = {};
      chrome.storage.local.set = vi.fn().mockImplementation(async (obj: Record<string, unknown>) => {
        Object.assign(storeData, obj);
      });
      chrome.storage.local.get = vi.fn().mockImplementation(async (key: string) => {
        return { [key]: storeData[key] };
      });

      const toSave: PRStore = { prs: [makePR(5)], lastPollAt: 9999 };
      await saveStore(toSave);
      const loaded = await loadStore();
      expect(loaded).toEqual(toSave);
    });
  });

  describe('upsertPRs', () => {
    it('adds new prs to empty store', async () => {
      chrome.storage.local.get = vi.fn().mockResolvedValue({});
      chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);

      const result = await upsertPRs([makePR(1), makePR(2)]);
      expect(result.prs).toHaveLength(2);
      expect(result.prs.map((p) => p.id)).toEqual([1, 2]);
    });

    it('replaces existing PR with same id', async () => {
      const existing: PRStore = { prs: [makePR(1, { title: 'old' })], lastPollAt: 100 };
      chrome.storage.local.get = vi.fn().mockResolvedValue({ [STORAGE_KEYS.prStore]: existing });
      chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);

      const result = await upsertPRs([makePR(1, { title: 'new' })]);
      expect(result.prs).toHaveLength(1);
      expect(result.prs[0].title).toBe('new');
    });

    it('preserves lastPollAt when upserting', async () => {
      const existing: PRStore = { prs: [], lastPollAt: 55555 };
      chrome.storage.local.get = vi.fn().mockResolvedValue({ [STORAGE_KEYS.prStore]: existing });
      chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);

      const result = await upsertPRs([makePR(1)]);
      expect(result.lastPollAt).toBe(55555);
    });

    it('adds new ids while keeping existing', async () => {
      const existing: PRStore = { prs: [makePR(1)], lastPollAt: null };
      chrome.storage.local.get = vi.fn().mockResolvedValue({ [STORAGE_KEYS.prStore]: existing });
      chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);

      const result = await upsertPRs([makePR(2)]);
      expect(result.prs.map((p) => p.id).sort()).toEqual([1, 2]);
    });
  });

  describe('pruneStale', () => {
    it('removes prs not in activeIds', async () => {
      const existing: PRStore = { prs: [makePR(1), makePR(2), makePR(3)], lastPollAt: 100 };
      chrome.storage.local.get = vi.fn().mockResolvedValue({ [STORAGE_KEYS.prStore]: existing });
      chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);

      const result = await pruneStale([1, 3]);
      expect(result.prs.map((p) => p.id)).toEqual([1, 3]);
    });

    it('returns empty prs when activeIds is empty', async () => {
      const existing: PRStore = { prs: [makePR(1)], lastPollAt: null };
      chrome.storage.local.get = vi.fn().mockResolvedValue({ [STORAGE_KEYS.prStore]: existing });
      chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);

      const result = await pruneStale([]);
      expect(result.prs).toHaveLength(0);
    });
  });

  describe('stampPollTime', () => {
    it('stamps provided timestamp', async () => {
      const existing: PRStore = { prs: [], lastPollAt: null };
      chrome.storage.local.get = vi.fn().mockResolvedValue({ [STORAGE_KEYS.prStore]: existing });
      chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);

      const result = await stampPollTime(12345);
      expect(result.lastPollAt).toBe(12345);
    });

    it('stamps Date.now() when no arg provided', async () => {
      const existing: PRStore = { prs: [], lastPollAt: null };
      chrome.storage.local.get = vi.fn().mockResolvedValue({ [STORAGE_KEYS.prStore]: existing });
      chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);

      const before = Date.now();
      const result = await stampPollTime();
      const after = Date.now();

      expect(result.lastPollAt).toBeGreaterThanOrEqual(before);
      expect(result.lastPollAt).toBeLessThanOrEqual(after);
    });
  });
});
