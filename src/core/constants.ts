import type { IntervalMinutes, Settings } from './types';

export const STORAGE_KEYS = {
  /** chrome.storage.sync — OAuth token. */
  token: 'github_token',
  /** chrome.storage.sync — user settings. */
  settings: 'settings',
  /** chrome.storage.local — { prs, lastPollAt }. */
  prStore: 'pr_store',
  /** chrome.storage.local — ETag cache map. */
  etags: 'etags',
} as const;

export const ALARM_NAME = 'poll';

export const DEFAULT_INTERVAL_MINUTES: IntervalMinutes = 5;

export const DEFAULT_SETTINGS: Settings = {
  intervalMinutes: DEFAULT_INTERVAL_MINUTES,
};

export const GITHUB_API_BASE = 'https://api.github.com';
export const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
export const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

/** Always-required scopes, granted on every sign-in. */
export const BASE_SCOPES = 'repo';

export const BADGE_BACKGROUND_COLOR = '#2da44e';
