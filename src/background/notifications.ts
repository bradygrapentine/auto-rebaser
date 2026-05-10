// Story 2.4 — Desktop notifications dispatch.
//
// Reads per-account notification settings + throttle state, calls
// chrome.notifications.create when the user opted in to that event AND the
// runtime `notifications` permission is granted. Throttles to 1 hour per
// (PR, event) tuple so a sequence of polls doesn't spam.
//
// All errors swallowed — notifications are best-effort. A missing permission,
// missing API (Firefox without permission grant), or API failure must NOT
// block the poll cycle.

import type { AutomationSettings } from '../core/automations-types';
import { readAccountKey, writeAccountKey } from '../core/storage/multi-account';

export type NotifEvent =
  | 'rebased'
  | 'conflicted'
  | 'merged'
  | 'idle'
  | 'ping-confirmed';

export interface NotifPayload {
  event: NotifEvent;
  repo: string;
  prNumber: number;
  prTitle: string;
  /** Optional override for the notification body. Falls back to a default per event. */
  message?: string;
}

export const THROTTLE_MS = 60 * 60 * 1000; // 1 hour

const TITLES: Record<NotifEvent, string> = {
  rebased: 'PR rebased',
  conflicted: 'Rebase conflict',
  merged: 'PR merged',
  idle: 'PR idle',
  'ping-confirmed': 'Reviewer pinged',
};

type NotifSettingKey =
  | 'notifyOnRebased'
  | 'notifyOnConflicted'
  | 'notifyOnMerged'
  | 'notifyOnIdle'
  | 'notifyOnPingConfirmed';

const SETTING_KEYS: Record<NotifEvent, NotifSettingKey> = {
  rebased: 'notifyOnRebased',
  conflicted: 'notifyOnConflicted',
  merged: 'notifyOnMerged',
  idle: 'notifyOnIdle',
  'ping-confirmed': 'notifyOnPingConfirmed',
};

function defaultMessage(p: NotifPayload): string {
  switch (p.event) {
    case 'rebased':
      return `${p.repo}#${p.prNumber} — ${p.prTitle}`;
    case 'conflicted':
      return `${p.repo}#${p.prNumber} hit a conflict during rebase`;
    case 'merged':
      return `${p.repo}#${p.prNumber} merged${p.prTitle ? ` — ${p.prTitle}` : ''}`;
    case 'idle':
      return `${p.repo}#${p.prNumber} has gone idle`;
    case 'ping-confirmed':
      return `Pinged reviewers on ${p.repo}#${p.prNumber}`;
  }
}

function throttleKey(prNumber: number, event: NotifEvent): string {
  return `${prNumber}:${event}`;
}

/**
 * Returns true when the runtime `notifications` permission is currently granted.
 * Safe in test environments where chrome.permissions / chrome.notifications may
 * be partially stubbed.
 */
export async function hasNotificationsPermission(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions?.contains) return false;
  try {
    return await new Promise<boolean>((resolve) => {
      chrome.permissions.contains({ permissions: ['notifications'] }, (granted) => {
        resolve(Boolean(granted));
      });
    });
  } catch {
    return false;
  }
}

/**
 * Dispatch a desktop notification for `event` on the given PR. Honors the
 * per-account opt-in toggles, the master `notificationsEnabled` gate, the
 * runtime permission grant, and the 1-hour throttle. Returns true when a
 * notification actually fired.
 */
export async function notify(
  payload: NotifPayload,
  settings: Pick<
    AutomationSettings,
    | 'notificationsEnabled'
    | 'notifyOnRebased'
    | 'notifyOnConflicted'
    | 'notifyOnMerged'
    | 'notifyOnIdle'
    | 'notifyOnPingConfirmed'
  >,
  now: number = Date.now(),
): Promise<boolean> {
  if (!settings.notificationsEnabled) return false;
  if (!settings[SETTING_KEYS[payload.event]]) return false;
  if (!(await hasNotificationsPermission())) return false;
  if (typeof chrome === 'undefined' || !chrome.notifications?.create) return false;

  // Throttle window check.
  const throttle = (await readAccountKey('notif_throttle')) ?? {};
  const key = throttleKey(payload.prNumber, payload.event);
  const last = throttle[key];
  if (typeof last === 'number' && now - last < THROTTLE_MS) return false;

  try {
    await new Promise<void>((resolve) => {
      chrome.notifications.create(
        {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon128.png'),
          title: TITLES[payload.event],
          message: payload.message ?? defaultMessage(payload),
        },
        () => resolve(),
      );
    });
  } catch {
    return false;
  }

  // Best-effort throttle write — drop entries older than the throttle window
  // so the map doesn't grow unboundedly.
  const cutoff = now - THROTTLE_MS;
  const next: Record<string, number> = { [key]: now };
  for (const [k, v] of Object.entries(throttle)) {
    if (k !== key && typeof v === 'number' && v >= cutoff) next[k] = v;
  }
  try {
    await writeAccountKey('notif_throttle', next);
  } catch {
    // If the write fails, the next call will re-evaluate from whatever was
    // stored before — at worst the user gets one extra notification.
  }
  return true;
}
