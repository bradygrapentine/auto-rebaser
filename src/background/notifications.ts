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
  /** CT-4 — PR URL opened when the notification is clicked. When absent the
   *  notification still fires but is not clickable (graceful no-op). */
  url?: string;
}

export const THROTTLE_MS = 60 * 60 * 1000; // 1 hour

/** CT-4 — global (NOT account-scoped) chrome.storage.local map of
 *  chrome-generated notificationId → PR URL, consumed by the onClicked handler.
 *  Bounded to CLICK_TARGETS_MAX most-recent entries; entries are removed on click. */
export const CLICK_TARGETS_KEY = 'notif_click_targets';
export const CLICK_TARGETS_MAX = 50;

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

  let notifId: string | undefined;
  try {
    notifId = await new Promise<string | undefined>((resolve) => {
      chrome.notifications.create(
        {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon128.png'),
          title: TITLES[payload.event],
          message: payload.message ?? defaultMessage(payload),
        },
        (id) => resolve(id),
      );
    });
  } catch {
    return false;
  }

  // CT-4 — record the notificationId → PR-URL mapping so the onClicked handler
  // can open the PR. Best-effort and only when we have both an id and a url; a
  // failure must NOT change the return or block (notifications stay best-effort).
  if (notifId && payload.url) {
    try {
      await persistClickTarget(notifId, payload.url);
    } catch {
      // swallow — at worst this one notification isn't clickable.
    }
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

// ── CT-4 — notification click-to-open ───────────────────────────────────────

async function readClickTargets(): Promise<Record<string, string>> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local?.get) return {};
  const snap = await chrome.storage.local.get(CLICK_TARGETS_KEY);
  const map = snap?.[CLICK_TARGETS_KEY];
  return map && typeof map === 'object' ? (map as Record<string, string>) : {};
}

/** Persist `id → url`, bounded to the most-recent CLICK_TARGETS_MAX entries.
 *  chrome-generated ids are unique, so each call appends a fresh key → object
 *  insertion order is fire order; slicing the last N drops the oldest. */
async function persistClickTarget(id: string, url: string): Promise<void> {
  const current = await readClickTargets();
  const merged = { ...current, [id]: url };
  const entries = Object.entries(merged);
  const bounded =
    entries.length > CLICK_TARGETS_MAX
      ? Object.fromEntries(entries.slice(entries.length - CLICK_TARGETS_MAX))
      : merged;
  await chrome.storage.local.set({ [CLICK_TARGETS_KEY]: bounded });
}

/**
 * Open the PR for a clicked notification. Looks up the stored URL, opens it in a
 * new tab, clears the notification, and removes the entry. Best-effort: a missing
 * entry (urlless/pre-ship notification), missing API, or failure is a silent no-op.
 */
export async function handleNotificationClick(notificationId: string): Promise<void> {
  try {
    const targets = await readClickTargets();
    const url = targets[notificationId];
    if (!url) return;
    chrome.tabs?.create?.({ url });
    chrome.notifications?.clear?.(notificationId);
    const { [notificationId]: _gone, ...rest } = targets;
    await chrome.storage.local.set({ [CLICK_TARGETS_KEY]: rest });
  } catch {
    // best-effort — clicking a notification must never throw into the SW.
  }
}

/** Register the onClicked listener. Call at the top level of the service worker
 *  so the click event wakes the SW and is handled after MV3 eviction. */
export function registerNotificationClickListener(): void {
  if (typeof chrome === 'undefined' || !chrome.notifications?.onClicked) return;
  chrome.notifications.onClicked.addListener((id) => void handleNotificationClick(id));
}
