import { describe, it, expect, vi, beforeEach } from 'vitest';
import { postIssueComment } from '../../../src/github/endpoints/issues';
import * as http from '../../../src/github/http';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('postIssueComment', () => {
  it('POSTs to /repos/{owner}/{repo}/issues/{number}/comments with JSON body', async () => {
    const requestSpy = vi.spyOn(http, 'request').mockResolvedValue({
      id: 1, html_url: 'https://github.com/o/r/pull/1#issuecomment-1', body: 'hi',
    });

    const result = await postIssueComment('octo', 'repo', 42, 'hi {reviewers}');

    expect(requestSpy).toHaveBeenCalledWith(
      '/repos/octo/repo/issues/42/comments',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ body: 'hi {reviewers}' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(result.id).toBe(1);
  });

  it('propagates HTTP errors', async () => {
    vi.spyOn(http, 'request').mockRejectedValue(new Error('HTTP_403'));
    await expect(postIssueComment('octo', 'repo', 42, 'hi')).rejects.toThrow('HTTP_403');
  });
});
