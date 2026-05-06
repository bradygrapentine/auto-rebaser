// Story 5.1 — issue / PR comments. Used by the ping-reviewers feature.

import { request } from '../http';

export interface IssueComment {
  id: number;
  html_url: string;
  body: string;
}

/**
 * Post a comment on an issue or PR. GitHub treats PRs as issues for
 * comments, so the `/repos/{owner}/{repo}/issues/{number}/comments`
 * endpoint covers both.
 */
export async function postIssueComment(
  owner: string,
  repo: string,
  number: number,
  body: string,
): Promise<IssueComment> {
  return request<IssueComment>(
    `/repos/${owner}/${repo}/issues/${number}/comments`,
    {
      method: 'POST',
      body: JSON.stringify({ body }),
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
