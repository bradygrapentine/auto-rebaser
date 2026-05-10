import { request } from '../http';

export interface Repo {
  name: string;
  full_name: string;
  delete_branch_on_merge: boolean;
  allow_squash_merge: boolean;
  allow_merge_commit: boolean;
  allow_rebase_merge: boolean;
}

export async function getRepo(owner: string, repo: string): Promise<Repo | null> {
  try {
    return await request<Repo>(`/repos/${owner}/${repo}`, { useETag: true });
  } catch (err) {
    if (err instanceof Error && err.message === 'HTTP_404') return null;
    throw err;
  }
}

interface Branch {
  name: string;
  commit: { sha: string };
}

/**
 * BEHIND-1: returns the current HEAD commit SHA for a base branch, or null
 * if the branch is missing. ETag-cached so steady-state cost is a 304. Used
 * to detect "behind base" when GitHub's `mergeable_state` is `blocked` or
 * `unstable` (which masks behind-ness when branch protection doesn't
 * require "branch up to date").
 */
export async function getBranchHeadSHA(
  owner: string,
  repo: string,
  branch: string,
): Promise<string | null> {
  try {
    const data = await request<Branch>(
      `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
      { useETag: true },
    );
    return data.commit.sha;
  } catch (err) {
    if (err instanceof Error && err.message === 'HTTP_404') return null;
    throw err;
  }
}
