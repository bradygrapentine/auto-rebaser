// Story 4.4 — one-time migration banner shown to PAT users encouraging
// the GitHub App path. State persists in chrome.storage.sync so dismissing
// on one device doesn't re-show on another.

const KEY = 'migration_banner_dismissed';

export async function isMigrationBannerDismissed(): Promise<boolean> {
  const result = await chrome.storage.sync.get(KEY);
  return Boolean(result[KEY]);
}

export async function dismissMigrationBanner(): Promise<void> {
  await chrome.storage.sync.set({ [KEY]: true });
}

export const MIGRATION_BANNER_KEY = KEY;
