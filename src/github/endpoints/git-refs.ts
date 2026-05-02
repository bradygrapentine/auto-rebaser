import { requestNoBody } from '../http-extra';

export type DeleteRefResult = 'deleted' | 'already-gone';

// 204 → deleted. 404 / 422 → already gone (idempotent). Anything else throws.
export async function deleteRef(
  owner: string,
  repo: string,
  branch: string
): Promise<DeleteRefResult> {
  const status = await requestNoBody(
    `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    { method: 'DELETE' }
  );
  if (status === 204) return 'deleted';
  if (status === 404 || status === 422) return 'already-gone';
  throw new Error(`HTTP_${status}`);
}
