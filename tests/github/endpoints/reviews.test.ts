import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listReviews, requestReviewers } from '../../../src/github/endpoints/reviews';
import * as http from '../../../src/github/http';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listReviews', () => {
  it('GETs /repos/{owner}/{repo}/pulls/{n}/reviews?per_page=100', async () => {
    const requestSpy = vi.spyOn(http, 'request').mockResolvedValue([]);
    await listReviews('octo', 'repo', 42);
    expect(requestSpy).toHaveBeenCalledWith(
      '/repos/octo/repo/pulls/42/reviews?per_page=100',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('maps responses to { login, state, submittedAt: number }', async () => {
    vi.spyOn(http, 'request').mockResolvedValue([
      { user: { login: 'alice' }, state: 'APPROVED', submitted_at: '2026-05-10T12:00:00Z' },
      { user: { login: 'bob' }, state: 'CHANGES_REQUESTED', submitted_at: '2026-05-10T13:00:00Z' },
      { user: { login: 'alice' }, state: 'DISMISSED', submitted_at: '2026-05-10T14:00:00Z' },
    ]);
    const out = await listReviews('octo', 'repo', 42);
    expect(out).toEqual([
      { login: 'alice', state: 'APPROVED', submittedAt: Date.parse('2026-05-10T12:00:00Z') },
      { login: 'bob', state: 'CHANGES_REQUESTED', submittedAt: Date.parse('2026-05-10T13:00:00Z') },
      { login: 'alice', state: 'DISMISSED', submittedAt: Date.parse('2026-05-10T14:00:00Z') },
    ]);
  });

  it('drops reviews missing user.login or submitted_at', async () => {
    vi.spyOn(http, 'request').mockResolvedValue([
      { user: null, state: 'APPROVED', submitted_at: '2026-05-10T12:00:00Z' },
      { user: { login: 'alice' }, state: 'APPROVED', submitted_at: null },
      { user: { login: 'bob' }, state: 'APPROVED', submitted_at: '2026-05-10T15:00:00Z' },
    ]);
    const out = await listReviews('octo', 'repo', 42);
    expect(out).toEqual([
      { login: 'bob', state: 'APPROVED', submittedAt: Date.parse('2026-05-10T15:00:00Z') },
    ]);
  });
});

describe('requestReviewers', () => {
  it('POSTs the reviewer logins to /repos/{owner}/{repo}/pulls/{n}/requested_reviewers', async () => {
    const requestSpy = vi.spyOn(http, 'request').mockResolvedValue({});
    await requestReviewers('octo', 'repo', 42, ['alice', 'bob']);
    expect(requestSpy).toHaveBeenCalledWith(
      '/repos/octo/repo/pulls/42/requested_reviewers',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reviewers: ['alice', 'bob'] }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('returns { ok: true } on a successful POST', async () => {
    vi.spyOn(http, 'request').mockResolvedValue({});
    const out = await requestReviewers('octo', 'repo', 42, ['alice']);
    expect(out).toEqual({ ok: true });
  });

  it('short-circuits to { ok: true, skipped: true } on empty logins, no network call', async () => {
    const requestSpy = vi.spyOn(http, 'request');
    const out = await requestReviewers('octo', 'repo', 42, []);
    expect(out).toEqual({ ok: true, skipped: true });
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('returns { ok: true, alreadyRequested: true } on a 422 with field=reviewers code=invalid', async () => {
    const err = Object.assign(new Error('HTTP_422'), {
      status: 422,
      body: {
        errors: [
          { resource: 'PullRequest', field: 'reviewers', code: 'invalid' },
        ],
      },
    });
    vi.spyOn(http, 'request').mockRejectedValue(err);
    const out = await requestReviewers('octo', 'repo', 42, ['alice']);
    expect(out).toEqual({ ok: true, alreadyRequested: true });
  });

  it('rethrows other 4xx/5xx errors', async () => {
    vi.spyOn(http, 'request').mockRejectedValue(new Error('HTTP_403'));
    await expect(requestReviewers('octo', 'repo', 42, ['alice'])).rejects.toThrow('HTTP_403');
  });

  it('rethrows 422s that are NOT the duplicate-reviewer shape (e.g. PR-author-as-reviewer)', async () => {
    const err = Object.assign(new Error('HTTP_422'), {
      status: 422,
      body: {
        errors: [
          { resource: 'PullRequest', field: 'reviewers', code: 'unprocessable', message: 'Cannot request review from PR author' },
        ],
      },
    });
    vi.spyOn(http, 'request').mockRejectedValue(err);
    await expect(requestReviewers('octo', 'repo', 42, ['author'])).rejects.toThrow('HTTP_422');
  });
});
