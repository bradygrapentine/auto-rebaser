import type { PRState, MergeableState } from '../core/types';

export interface UpdateBranchAttempt {
  state: PRState;
  errorMessage?: string;
}

/** Returns the next PR state given the latest mergeable_state. Does NOT call updateBranch. */
export function deriveStateFromMergeable(
  mergeableState: MergeableState,
  previousState: PRState
): { action: 'rebase' | 'none'; nextState: PRState } {
  if (mergeableState === 'behind') {
    return { action: 'rebase', nextState: 'behind' };
  }
  if (mergeableState === 'dirty') {
    return { action: 'none', nextState: 'conflict' };
  }
  if (mergeableState === 'unknown') {
    return { action: 'none', nextState: previousState };
  }
  return { action: 'none', nextState: 'current' };
}

/** Maps an Error thrown by updateBranch into the resulting PR state. */
export function mapUpdateBranchError(err: unknown): UpdateBranchAttempt {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.startsWith('HTTP_422')) {
    return { state: 'needs-manual', errorMessage: 'Rebase rejected by GitHub' };
  }
  if (msg.startsWith('HTTP_409')) {
    return { state: 'conflict', errorMessage: 'Merge conflict' };
  }
  // 403/404 from the rebase endpoint almost always mean the GitHub App
  // isn't installed for this repo (or was suspended). Surface a
  // user-actionable message instead of a raw "HTTP_403".
  if (msg.startsWith('HTTP_403') || msg.startsWith('HTTP_404')) {
    return {
      state: 'error',
      errorMessage: 'Auto Rebaser App not installed for this repo',
    };
  }
  if (msg === 'AUTH_ERROR') {
    throw err instanceof Error ? err : new Error(msg);
  }
  if (msg === 'RATE_LIMITED') {
    throw err instanceof Error ? err : new Error(msg);
  }
  return { state: 'error', errorMessage: msg };
}

/** Parses a GitHub `repository_url` like "https://api.github.com/repos/o/r" into [owner, repo]. */
export function parseRepoUrl(repositoryUrl: string): { owner: string; repo: string; fullName: string } {
  const prefix = 'https://api.github.com/repos/';
  if (!repositoryUrl.startsWith(prefix)) {
    throw new Error(`Unexpected repository_url format: ${repositoryUrl}`);
  }
  const path = repositoryUrl.slice(prefix.length);
  const slashIdx = path.indexOf('/');
  if (slashIdx === -1 || slashIdx === path.length - 1 || path.length === 0) {
    throw new Error(`Cannot parse owner/repo from: ${repositoryUrl}`);
  }
  const owner = path.slice(0, slashIdx);
  const repo = path.slice(slashIdx + 1);
  if (!owner || !repo) {
    throw new Error(`Empty owner or repo in: ${repositoryUrl}`);
  }
  return { owner, repo, fullName: `${owner}/${repo}` };
}
