import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRerequestStore } from '../../../src/popup/hooks/useRerequestStore';
import { RE_REQUEST_THROTTLE_KEY } from '../../../src/core/rerequest-throttle';

beforeEach(() => {
  vi.clearAllMocks();
  chrome.storage.local.get = vi.fn().mockResolvedValue({});
});

describe('useRerequestStore', () => {
  it('loads the rerequest map on mount', async () => {
    const stored = { 42: { at: 1_700_000_000_000 } };
    chrome.storage.local.get = vi.fn().mockResolvedValue({ [RE_REQUEST_THROTTLE_KEY]: stored });
    const { result } = renderHook(() => useRerequestStore());
    await act(async () => {});
    expect(result.current.store).toEqual(stored);
  });

  it('isThrottled / hoursSince delegate to the underlying helpers', async () => {
    const at = Date.now() - 60 * 60 * 1000;
    chrome.storage.local.get = vi.fn().mockResolvedValue({
      [RE_REQUEST_THROTTLE_KEY]: { 42: { at } },
    });
    const { result } = renderHook(() => useRerequestStore());
    await act(async () => {});
    expect(result.current.isThrottled(42)).toBe(true);
    expect(result.current.isThrottled(43)).toBe(false);
    expect(result.current.hoursSince(42)).toBe(1);
    expect(result.current.hoursSince(43)).toBeNull();
  });

  it('reacts to chrome.storage.onChanged events', async () => {
    let listener: ((c: Record<string, chrome.storage.StorageChange>, area: chrome.storage.AreaName) => void) | undefined;
    (chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>).mockImplementation((fn) => {
      listener = fn;
    });
    const { result } = renderHook(() => useRerequestStore());
    await act(async () => {});
    await act(async () => {
      listener!({ [RE_REQUEST_THROTTLE_KEY]: { newValue: { 99: { at: 1 } } } }, 'local');
    });
    expect(result.current.store).toEqual({ 99: { at: 1 } });
  });

  it('ignores changes from areas other than local', async () => {
    let listener: ((c: Record<string, chrome.storage.StorageChange>, area: chrome.storage.AreaName) => void) | undefined;
    (chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>).mockImplementation((fn) => {
      listener = fn;
    });
    const { result } = renderHook(() => useRerequestStore());
    await act(async () => {});
    await act(async () => {
      listener!({ [RE_REQUEST_THROTTLE_KEY]: { newValue: { 99: { at: 1 } } } }, 'sync');
    });
    expect(result.current.store).toEqual({});
  });

  it('removes the listener on unmount', async () => {
    const { unmount } = renderHook(() => useRerequestStore());
    await act(async () => {});
    unmount();
    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalled();
  });
});
