// MERGE-2 — direct REST merge for clean PRs (when auto-merge can't apply).
// Uses the `sha` precondition to guard against the race where a new commit
// lands between our snapshot and the merge call: GitHub returns 409 if the
// supplied SHA no longer matches HEAD.
//
// Reference: https://docs.github.com/rest/pulls/pulls#merge-a-pull-request

import { request } from '../http';

export type MergeMethod = 'merge' | 'squash' | 'rebase';

export interface MergePROpts {
  /** Required: head SHA at the moment we decided to merge. Closes the race window. */
  sha: string;
  /** GitHub-allowed merge method. Repo settings may forbid one or two. */
  merge_method: MergeMethod;
}

export interface MergePRResult {
  merged: boolean;
  sha: string;
}

/**
 * PUT /repos/{owner}/{repo}/pulls/{number}/merge.
 *
 * Throws:
 * - `METHOD_NOT_ALLOWED` (405) — generic "merge cannot be performed". GitHub's
 *   docs treat 405 broadly (could be method-disabled OR a transient state),
 *   so callers should NOT silently fall through to a different merge method
 *   on this signal — that risks shifting the user's chosen merge semantics
 *   on what was actually a transient condition. Surface the failure instead.
 * - `SHA_MISMATCH` (409) — head moved between snapshot and call. Abort; will be
 *   retried on the next poll if still applicable.
 * - `HTTP_<code>` for any other unexpected status.
 *
 * On 200 the response payload includes `{ merged: boolean }`. Callers must
 * check `merged === true` — GitHub can return 200 with `merged: false` in
 * unusual states.
 */
export async function mergePR(
  owner: string,
  repo: string,
  number: number,
  opts: MergePROpts,
): Promise<MergePRResult> {
  try {
    return await request<MergePRResult>(
      `/repos/${owner}/${repo}/pulls/${number}/merge`,
      {
        method: 'PUT',
        body: JSON.stringify({ sha: opts.sha, merge_method: opts.merge_method }),
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'HTTP_405') throw new Error('METHOD_NOT_ALLOWED');
    if (msg === 'HTTP_409') throw new Error('SHA_MISMATCH');
    throw err;
  }
}
