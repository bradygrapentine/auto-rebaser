import { request } from '../http';
import { requestNoBody } from '../http-extra';

export interface NotificationThread {
  id: string;
  unread: boolean;
  reason: string;
  subject: {
    title: string;
    /** API URL — for PRs: https://api.github.com/repos/{owner}/{repo}/pulls/{n}. */
    url: string | null;
    type: 'PullRequest' | 'Issue' | 'Discussion' | 'Release' | 'Commit' | string;
  };
  repository: {
    full_name: string;
  };
}

// Scope-missing detection happens in the automation layer (we know what scopes
// we requested at OAuth time). This module just surfaces transport errors.
export async function listNotifications(): Promise<NotificationThread[]> {
  return await request<NotificationThread[]>(
    '/notifications?all=false&participating=false',
    { useETag: true }
  );
}

export async function markThreadRead(threadId: string): Promise<void> {
  const status = await requestNoBody(`/notifications/threads/${threadId}`, {
    method: 'PATCH',
  });
  // GitHub returns 205 Reset Content on success; tolerate 200 too.
  if (status !== 205 && status !== 200) {
    throw new Error(`HTTP_${status}`);
  }
}

export async function unsubscribeThread(threadId: string): Promise<void> {
  const status = await requestNoBody(
    `/notifications/threads/${threadId}/subscription`,
    { method: 'DELETE' }
  );
  if (status !== 204) {
    throw new Error(`HTTP_${status}`);
  }
}
