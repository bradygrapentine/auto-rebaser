// MA-1 — Multi-account storage facade.
//
// All v2 reads and writes go through here. The shape is:
//
//   chrome.storage.local
//     storage_version: 2
//     active_account_id: "gh_<login>" | null
//     accounts: { [accountId]: AccountState }
//     known_repos: string[]                       // unchanged from v1, global
//     _migration_backup_v1: { ...v1 keys, backed_up_at }
//
//   chrome.storage.sync
//     storage_version: 2
//     global_settings: GlobalSettings
//     per_account_settings:<accountId>: PerAccountSettings   (one key per account)
//     per_account_settings_index: string[]                   (account ids with sync settings)
//     migration_banner_dismissed: boolean
//
// Per-account sync settings live in *separate keys* (not nested under one
// `per_account_settings` object) because chrome.storage.sync's
// QUOTA_BYTES_PER_ITEM is 8192. One key per account keeps each account's
// settings comfortably under quota even with many opt-out repos.

import type { Auth } from '../auth-store';
import type { PRStore, Settings } from '../types';
import type { ActivityEntry } from '../activity-log-types';
import type { ResolvedThreadsStore, AutomationSettings } from '../automations-types';
import type { PingedStore } from '../ping-throttle';

export const STORAGE_KEYS_V2 = {
  storageVersion: 'storage_version',
  activeAccountId: 'active_account_id',
  accounts: 'accounts',
  knownRepos: 'known_repos',
  migrationBackupV1: '_migration_backup_v1',
  globalSettings: 'global_settings',
  perAccountSettingsIndex: 'per_account_settings_index',
  /** Prefix only — append accountId to form a full key. */
  perAccountSettingsPrefix: 'per_account_settings:',
  migrationBannerDismissed: 'migration_banner_dismissed',
} as const;

export const STORAGE_VERSION = 2;

export interface AccountState {
  auth: Auth;
  pr_store: PRStore;
  activity: { entries: ActivityEntry[] };
  pingedPRs: PingedStore;
  resolved_threads: ResolvedThreadsStore;
  /** Story 2.4 — last-fire timestamps for desktop notifications, keyed by `<prNumber>:<event>`. */
  notif_throttle: Record<string, number>;
  /** Story 5.2-A — per-PR throttle of the re-request-review action. Mirrors `pingedPRs`. */
  rerequestedPRs: Record<number, { at: number }>;
}

export interface GlobalSettings {
  intervalMinutes: Settings['intervalMinutes'];
  ignoredRepos: AutomationSettings['ignoredRepos'];
  enableKeyboardShortcuts: AutomationSettings['enableKeyboardShortcuts'];
  enterpriseHost?: string;
  enterpriseClientId?: string;
}

/** Per-account half of the split. AutomationSettings minus the keys hoisted to GlobalSettings. */
export type PerAccountSettings = Omit<
  AutomationSettings,
  'ignoredRepos' | 'enableKeyboardShortcuts'
>;

// ── account-id helpers ────────────────────────────────────────────────────

/** Build a stable account id. GHES hosts include the host; cloud is just `gh_<login>`. */
export function buildAccountId(login: string, host?: string): string {
  const normLogin = login.trim().toLowerCase();
  if (!host) return `gh_${normLogin}`;
  const normHost = host.trim().toLowerCase().replace(/\./g, '_');
  return `gh_${normHost}_${normLogin}`;
}

function perAccountSettingsKey(id: string): string {
  return `${STORAGE_KEYS_V2.perAccountSettingsPrefix}${id}`;
}

// ── active account ────────────────────────────────────────────────────────

export async function getActiveAccountId(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS_V2.activeAccountId);
  const id = (result ?? {})[STORAGE_KEYS_V2.activeAccountId];
  return typeof id === 'string' ? id : null;
}

export async function setActiveAccountId(id: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS_V2.activeAccountId]: id });
}

export async function listAccountIds(): Promise<string[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS_V2.accounts);
  const accounts = ((result ?? {})[STORAGE_KEYS_V2.accounts] ?? {}) as Record<string, unknown>;
  return Object.keys(accounts);
}

// ── per-account state ─────────────────────────────────────────────────────

export async function getAccountState<K extends keyof AccountState>(
  id: string,
  key: K,
): Promise<AccountState[K] | undefined> {
  const result = await chrome.storage.local.get(STORAGE_KEYS_V2.accounts);
  const accounts = ((result ?? {})[STORAGE_KEYS_V2.accounts] ?? {}) as Record<
    string,
    Partial<AccountState>
  >;
  return accounts[id]?.[key] as AccountState[K] | undefined;
}

export async function setAccountState<K extends keyof AccountState>(
  id: string,
  key: K,
  value: AccountState[K],
): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS_V2.accounts);
  const accounts = ((result ?? {})[STORAGE_KEYS_V2.accounts] ?? {}) as Record<
    string,
    Partial<AccountState>
  >;
  const existing = accounts[id] ?? {};
  accounts[id] = { ...existing, [key]: value };
  await chrome.storage.local.set({ [STORAGE_KEYS_V2.accounts]: accounts });
}

/** Drop one account's local namespace AND its sync settings key + index entry. */
export async function removeAccount(id: string): Promise<void> {
  const localSnap = await chrome.storage.local.get([
    STORAGE_KEYS_V2.accounts,
    STORAGE_KEYS_V2.activeAccountId,
  ]);
  const accounts = (localSnap[STORAGE_KEYS_V2.accounts] ?? {}) as Record<string, unknown>;
  delete accounts[id];

  const updates: Record<string, unknown> = {
    [STORAGE_KEYS_V2.accounts]: accounts,
  };
  if (localSnap[STORAGE_KEYS_V2.activeAccountId] === id) {
    const remaining = Object.keys(accounts);
    updates[STORAGE_KEYS_V2.activeAccountId] = remaining[0] ?? null;
  }
  await chrome.storage.local.set(updates);

  const syncSnap = await chrome.storage.sync.get(STORAGE_KEYS_V2.perAccountSettingsIndex);
  const index = (syncSnap[STORAGE_KEYS_V2.perAccountSettingsIndex] ?? []) as string[];
  const nextIndex = index.filter((x) => x !== id);
  await chrome.storage.sync.remove(perAccountSettingsKey(id));
  await chrome.storage.sync.set({ [STORAGE_KEYS_V2.perAccountSettingsIndex]: nextIndex });
}

// ── global settings ───────────────────────────────────────────────────────

export async function getGlobalSetting<K extends keyof GlobalSettings>(
  key: K,
): Promise<GlobalSettings[K] | undefined> {
  const result = await chrome.storage.sync.get(STORAGE_KEYS_V2.globalSettings);
  const settings = (result[STORAGE_KEYS_V2.globalSettings] ?? {}) as Partial<GlobalSettings>;
  return settings[key];
}

export async function setGlobalSetting<K extends keyof GlobalSettings>(
  key: K,
  value: GlobalSettings[K],
): Promise<void> {
  const result = await chrome.storage.sync.get(STORAGE_KEYS_V2.globalSettings);
  const settings = (result[STORAGE_KEYS_V2.globalSettings] ?? {}) as Partial<GlobalSettings>;
  settings[key] = value;
  await chrome.storage.sync.set({ [STORAGE_KEYS_V2.globalSettings]: settings });
}

// ── per-account settings ──────────────────────────────────────────────────

export async function getPerAccountSetting<K extends keyof PerAccountSettings>(
  id: string,
  key: K,
): Promise<PerAccountSettings[K] | undefined> {
  const fullKey = perAccountSettingsKey(id);
  const result = await chrome.storage.sync.get(fullKey);
  const settings = (result[fullKey] ?? {}) as Partial<PerAccountSettings>;
  return settings[key];
}

export async function setPerAccountSetting<K extends keyof PerAccountSettings>(
  id: string,
  key: K,
  value: PerAccountSettings[K],
): Promise<void> {
  const fullKey = perAccountSettingsKey(id);
  const snap = await chrome.storage.sync.get([
    fullKey,
    STORAGE_KEYS_V2.perAccountSettingsIndex,
  ]);
  const settings = (snap[fullKey] ?? {}) as Partial<PerAccountSettings>;
  settings[key] = value;

  const index = (snap[STORAGE_KEYS_V2.perAccountSettingsIndex] ?? []) as string[];
  const nextIndex = index.includes(id) ? index : [...index, id];

  await chrome.storage.sync.set({
    [fullKey]: settings,
    [STORAGE_KEYS_V2.perAccountSettingsIndex]: nextIndex,
  });
}

// ── transition-layer helpers ──────────────────────────────────────────────
//
// Stores call these instead of touching chrome.storage directly. Reads
// resolve the active account; if no v2 namespace exists yet (fresh
// install pre-migration, or tests that mock the legacy shape), they
// fall back to the v1 top-level key. Writes go to v2 if there's an
// active account, otherwise to the v1 top-level key. The fallback path
// disappears in production after migration runs once.

export async function readAccountKey<K extends keyof AccountState>(
  key: K,
): Promise<AccountState[K] | undefined> {
  const id = await getActiveAccountId();
  if (id) {
    const v2 = await getAccountState(id, key);
    if (v2 !== undefined) return v2;
  }
  const legacy = await chrome.storage.local.get(key);
  return (legacy ?? {})[key] as AccountState[K] | undefined;
}

export async function writeAccountKey<K extends keyof AccountState>(
  key: K,
  value: AccountState[K],
): Promise<void> {
  const id = await getActiveAccountId();
  if (id) {
    await setAccountState(id, key, value);
    return;
  }
  await chrome.storage.local.set({ [key]: value });
}

export async function removeAccountKey<K extends keyof AccountState>(key: K): Promise<void> {
  const id = await getActiveAccountId();
  if (id) {
    const result = await chrome.storage.local.get(STORAGE_KEYS_V2.accounts);
    const accounts = (result[STORAGE_KEYS_V2.accounts] ?? {}) as Record<
      string,
      Partial<AccountState>
    >;
    if (accounts[id]) {
      const { [key]: _removed, ...rest } = accounts[id];
      accounts[id] = rest;
      await chrome.storage.local.set({ [STORAGE_KEYS_V2.accounts]: accounts });
    }
  }
  await chrome.storage.local.remove(key);
}

/** Test/migration-only — do not import in app code. */
export const __testing = {
  perAccountSettingsKey,
};
