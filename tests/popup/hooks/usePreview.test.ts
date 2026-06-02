// PREVIEW-9 — usePreview: covers the dry-run hook's PREVIEW_NOW round-trip and
// every result branch (ok / not-ok / no-data / thrown). The hook runs once on
// mount via useEffect, so each case waits for the async settle.
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePreview } from '../../../src/popup/hooks/usePreview';
import type { PreviewProjection } from '../../../src/background/automations/planned-action';

// `tests/setup.ts` rebuilds `globalThis.chrome` in an afterEach, so the mock fn
// must be read LIVE each test — capturing it at module scope goes stale.
const sm = () => vi.mocked(chrome.runtime.sendMessage);

const projection: PreviewProjection = {
  actions: [],
  counts: { 'enable-auto-merge': 0, 'direct-merge': 0, 'delete-branch': 0, 'resolve-thread': 0 },
  directMergePreviewable: false,
  directMergeCandidatePRIds: [],
  generatedAt: 0,
};

beforeEach(() => vi.clearAllMocks());

describe('usePreview', () => {
  it('fires PREVIEW_NOW exactly once on mount', async () => {
    sm().mockResolvedValue({ ok: true, data: projection } as never);
    renderHook(() => usePreview());
    await waitFor(() => expect(sm()).toHaveBeenCalledTimes(1));
    expect(sm()).toHaveBeenCalledWith({ type: 'PREVIEW_NOW' });
  });

  it('sets projection and clears loading on an ok response', async () => {
    sm().mockResolvedValue({ ok: true, data: projection } as never);
    const { result } = renderHook(() => usePreview());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.projection).toEqual(projection);
    expect(result.current.error).toBeNull();
  });

  it('surfaces the response error on a not-ok response', async () => {
    sm().mockResolvedValue({ ok: false, error: 'boom' } as never);
    const { result } = renderHook(() => usePreview());
    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current.projection).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('falls back to PREVIEW_FAILED when ok but data is missing', async () => {
    sm().mockResolvedValue({ ok: true } as never);
    const { result } = renderHook(() => usePreview());
    await waitFor(() => expect(result.current.error).toBe('PREVIEW_FAILED'));
    expect(result.current.projection).toBeNull();
  });

  it('surfaces the thrown message when sendMessage rejects', async () => {
    sm().mockRejectedValue(new Error('disconnected') as never);
    const { result } = renderHook(() => usePreview());
    await waitFor(() => expect(result.current.error).toBe('disconnected'));
    expect(result.current.loading).toBe(false);
  });

  it('falls back to PREVIEW_FAILED when the rejection is not an Error', async () => {
    sm().mockRejectedValue('nope' as never);
    const { result } = renderHook(() => usePreview());
    await waitFor(() => expect(result.current.error).toBe('PREVIEW_FAILED'));
  });

  it('re-runs the dry-run when run() is invoked', async () => {
    sm().mockResolvedValue({ ok: true, data: projection } as never);
    const { result } = renderHook(() => usePreview());
    await waitFor(() => expect(sm()).toHaveBeenCalledTimes(1));
    act(() => result.current.run());
    await waitFor(() => expect(sm()).toHaveBeenCalledTimes(2));
  });
});
