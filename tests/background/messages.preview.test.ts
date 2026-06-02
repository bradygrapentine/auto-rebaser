// PREVIEW-1 (T2) — PREVIEW_NOW message routing + SEC-1 sender gate.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// messages.ts imports these — mock so the handler is exercised in isolation.
vi.mock('../../src/background/poll-cycle', () => ({ runPollCycle: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../src/background/alarm', () => ({ setupAlarm: vi.fn() }));
vi.mock('../../src/background/auth-device-flow-runner', () => ({
  beginDeviceFlow: vi.fn(), beginDeviceFlowAddAccount: vi.fn(),
  cancelDeviceFlow: vi.fn(), getStatus: vi.fn(), resetStatus: vi.fn(),
}));
vi.mock('../../src/background/automations/preview-gather', () => ({
  gatherPreviewInputs: vi.fn().mockResolvedValue({
    prs: [], prDetails: new Map(), settings: {}, resolvedThreads: {}, github: {},
  }),
}));
vi.mock('../../src/background/automations/orchestrator', () => ({
  runAllAutomations: vi.fn().mockResolvedValue({
    preview: {
      actions: [{ kind: 'delete-branch', prId: 1, owner: 'o', name: 'r', headRef: 'f', repo: 'o/r', number: 1 }],
      counts: { 'enable-auto-merge': 0, 'direct-merge': 0, 'delete-branch': 1, 'resolve-thread': 0 },
      directMergePreviewable: false, directMergeCandidatePRIds: [], generatedAt: 123,
    },
  }),
}));

import { handleMessage } from '../../src/background/messages';
import { gatherPreviewInputs } from '../../src/background/automations/preview-gather';
import { runAllAutomations } from '../../src/background/automations/orchestrator';
import type { RuntimeResponse } from '../../src/core/types';

function legitimateSender(): chrome.runtime.MessageSender {
  return { id: chrome.runtime.id, url: chrome.runtime.getURL('popup/index.html') };
}
function foreignSender(): chrome.runtime.MessageSender {
  return { id: 'evil', url: 'chrome-extension://evil/x.html' };
}

/** Invoke handleMessage and resolve with the RuntimeResponse the handler sends. */
function invoke(sender: chrome.runtime.MessageSender): Promise<RuntimeResponse> {
  return new Promise((resolve) => {
    handleMessage({ type: 'PREVIEW_NOW' }, sender, resolve);
  });
}

beforeEach(() => vi.clearAllMocks());

describe('PREVIEW_NOW message', () => {
  it('authorized sender → { ok:true, data: PreviewProjection }', async () => {
    const res = await invoke(legitimateSender());
    expect(res.ok).toBe(true);
    expect(gatherPreviewInputs).toHaveBeenCalledOnce();
    expect(runAllAutomations).toHaveBeenCalledWith(expect.objectContaining({ mode: 'preview' }));
    expect(res.data).toMatchObject({ directMergePreviewable: false, counts: { 'delete-branch': 1 } });
  });

  it('unauthorized sender → { ok:false, error:"UNAUTHORIZED_SENDER" } and never gathers', async () => {
    const res = await invoke(foreignSender());
    expect(res).toEqual({ ok: false, error: 'UNAUTHORIZED_SENDER' });
    expect(gatherPreviewInputs).not.toHaveBeenCalled();
  });

  it('gather failure → { ok:false, error }', async () => {
    vi.mocked(gatherPreviewInputs).mockRejectedValueOnce(new Error('BOOM'));
    const res = await invoke(legitimateSender());
    expect(res).toEqual({ ok: false, error: 'BOOM' });
  });
});
