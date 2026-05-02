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
