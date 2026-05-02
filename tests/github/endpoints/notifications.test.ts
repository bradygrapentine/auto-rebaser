import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listNotifications,
  markThreadRead,
  unsubscribeThread,
} from '../../../src/github/endpoints/notifications';
import * as http from '../../../src/github/http';
import * as httpExtra from '../../../src/github/http-extra';

beforeEach(() => {
  vi.spyOn(http, 'request');
  vi.spyOn(httpExtra, 'requestNoBody');
});

describe('listNotifications', () => {
  it('hits /notifications with unread+non-participating filters and useETag', async () => {
    vi.mocked(http.request).mockResolvedValue([]);
    await listNotifications();
    expect(http.request).toHaveBeenCalledWith(
      '/notifications?all=false&participating=false',
      { useETag: true }
    );
  });

  it('returns the array verbatim', async () => {
    const list = [
      {
        id: '1',
        unread: true,
        reason: 'mention',
        subject: { title: 't', url: null, type: 'PullRequest' },
        repository: { full_name: 'o/r' },
      },
    ];
    vi.mocked(http.request).mockResolvedValue(list);
    expect(await listNotifications()).toEqual(list);
  });

  it('propagates errors', async () => {
    vi.mocked(http.request).mockRejectedValue(new Error('FORBIDDEN'));
    await expect(listNotifications()).rejects.toThrow('FORBIDDEN');
  });
});

describe('markThreadRead', () => {
  it('PATCHes /notifications/threads/{id}', async () => {
    vi.mocked(httpExtra.requestNoBody).mockResolvedValue(205);
    await markThreadRead('thr_1');
    expect(httpExtra.requestNoBody).toHaveBeenCalledWith(
      '/notifications/threads/thr_1',
      { method: 'PATCH' }
    );
  });

  it('accepts 200 as success', async () => {
    vi.mocked(httpExtra.requestNoBody).mockResolvedValue(200);
    await expect(markThreadRead('t')).resolves.toBeUndefined();
  });

  it('accepts 205 as success', async () => {
    vi.mocked(httpExtra.requestNoBody).mockResolvedValue(205);
    await expect(markThreadRead('t')).resolves.toBeUndefined();
  });

  it('throws on unexpected status', async () => {
    vi.mocked(httpExtra.requestNoBody).mockResolvedValue(404);
    await expect(markThreadRead('t')).rejects.toThrow('HTTP_404');
  });
});

describe('unsubscribeThread', () => {
  it('DELETEs /notifications/threads/{id}/subscription', async () => {
    vi.mocked(httpExtra.requestNoBody).mockResolvedValue(204);
    await unsubscribeThread('thr_1');
    expect(httpExtra.requestNoBody).toHaveBeenCalledWith(
      '/notifications/threads/thr_1/subscription',
      { method: 'DELETE' }
    );
  });

  it('204 → success', async () => {
    vi.mocked(httpExtra.requestNoBody).mockResolvedValue(204);
    await expect(unsubscribeThread('t')).resolves.toBeUndefined();
  });

  it('throws on non-204', async () => {
    vi.mocked(httpExtra.requestNoBody).mockResolvedValue(404);
    await expect(unsubscribeThread('t')).rejects.toThrow('HTTP_404');
  });
});
