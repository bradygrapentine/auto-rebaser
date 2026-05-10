// MA-1 — One-shot v1 → v2 storage migration.
//
// Idempotent: reads `storage_version`, no-ops if already 2.
// Atomic-ish: writes _migration_backup_v1 BEFORE the new shape so a mid-flight
// crash leaves enough breadcrumbs to retry on next startup.

import { request } from '../../github/http';
import type { Auth } from '../auth-store';
import type { AutomationSettings } from '../automations-types';
import {
  STORAGE_KEYS_V2,
  STORAGE_VERSION,
  buildAccountId,
  type AccountState,
  type GlobalSettings,
  type PerAccountSettings,
} from './multi-account';

// v1 storage keys, kept as string literals here so the migration reads
// don't pull in the old constant modules (which we'll delete later).
const V1 = {
  // local
  auth: 'auth',
  prStore: 'pr_store',
  etags: 'etags',
  activity: 'activity',
  pingedPRs: 'pingedPRs',
  resolvedThreads: 'resolved_threads',
  knownRepos: 'known_repos',
  // sync
  settings: 'settings',
  automationSettings: 'automation_settings',
  migrationBannerDismissed: 'migration_banner_dismissed',
} as const;

const V1_LOCAL_KEYS_TO_REMOVE = [
  V1.auth,
  V1.prStore,
  V1.etags,
  V1.activity,
  V1.pingedPRs,
  V1.resolvedThreads,
] as const;

const V1_SYNC_KEYS_TO_REMOVE = [V1.settings, V1.automationSettings] as const;

const PER_ACCOUNT_QUOTA_BYTES = 8192;

/** Public entry point. Run from the service-worker on startup, before alarms. */
export async function runMigrationIfNeeded(): Promise<void> {
  const localVersionSnap = await chrome.storage.local.get(STORAGE_KEYS_V2.storageVersion);
  if (localVersionSnap[STORAGE_KEYS_V2.storageVersion] === STORAGE_VERSION) return;

  const v1Local = await chrome.storage.local.get(null);
  const v1Sync = await chrome.storage.sync.get(null);

  const auth = v1Local[V1.auth] as Auth | undefined;

  // No active auth → treat as fresh install. A stale legacy `github_token`
  // sync key (pure-legacy v0.x users who never opened v0.2+) stays in place;
  // getAuth()'s lazy migration handles it on next sign-in.
  if (!auth) {
    await chrome.storage.local.set({ [STORAGE_KEYS_V2.storageVersion]: STORAGE_VERSION });
    await chrome.storage.sync.set({ [STORAGE_KEYS_V2.storageVersion]: STORAGE_VERSION });
    return;
  }

  // Backup BEFORE any new-shape write — escape hatch if a step throws.
  await chrome.storage.local.set({
    [STORAGE_KEYS_V2.migrationBackupV1]: { ...v1Local, ...v1Sync, backed_up_at: Date.now() },
  });

  const accountId = await deriveAccountIdSafe(auth, v1Sync[V1.settings] as
    | { enterpriseHost?: string }
    | undefined);

  const accountState: Partial<AccountState> = {};
  if (auth) accountState.auth = auth;
  if (v1Local[V1.prStore]) accountState.pr_store = v1Local[V1.prStore] as AccountState['pr_store'];
  if (v1Local[V1.activity]) {
    accountState.activity = v1Local[V1.activity] as AccountState['activity'];
  }
  if (v1Local[V1.pingedPRs]) {
    accountState.pingedPRs = v1Local[V1.pingedPRs] as AccountState['pingedPRs'];
  }
  if (v1Local[V1.resolvedThreads]) {
    accountState.resolved_threads =
      v1Local[V1.resolvedThreads] as AccountState['resolved_threads'];
  }

  const v1Auto = (v1Sync[V1.automationSettings] ?? {}) as Partial<AutomationSettings>;
  const v1Settings = (v1Sync[V1.settings] ?? {}) as {
    intervalMinutes?: GlobalSettings['intervalMinutes'];
    enterpriseHost?: string;
    enterpriseClientId?: string;
  };

  const globalSettings: Partial<GlobalSettings> = {};
  if (v1Settings.intervalMinutes !== undefined) {
    globalSettings.intervalMinutes = v1Settings.intervalMinutes;
  }
  if (v1Auto.ignoredRepos !== undefined) globalSettings.ignoredRepos = v1Auto.ignoredRepos;
  if (v1Auto.enableKeyboardShortcuts !== undefined) {
    globalSettings.enableKeyboardShortcuts = v1Auto.enableKeyboardShortcuts;
  }
  if (v1Settings.enterpriseHost !== undefined) {
    globalSettings.enterpriseHost = v1Settings.enterpriseHost;
  }
  if (v1Settings.enterpriseClientId !== undefined) {
    globalSettings.enterpriseClientId = v1Settings.enterpriseClientId;
  }

  // Per-account is everything else from automation settings.
  const perAccount = stripGlobalKeys(v1Auto);

  const perAccountKey = `${STORAGE_KEYS_V2.perAccountSettingsPrefix}${accountId}`;

  // Quota guard — blow up loudly in tests if the per-account split exceeds 8 KB.
  const perAccountSize = byteLength(JSON.stringify(perAccount));
  if (perAccountSize > PER_ACCOUNT_QUOTA_BYTES) {
    // eslint-disable-next-line no-console
    console.warn(
      `[migration] per-account settings for ${accountId} is ${perAccountSize}B, ` +
        `over the ${PER_ACCOUNT_QUOTA_BYTES}B sync quota. Sync write may fail.`,
    );
  }

  // Write the new shape.
  await chrome.storage.local.set({
    [STORAGE_KEYS_V2.activeAccountId]: accountId,
    [STORAGE_KEYS_V2.accounts]: { [accountId]: accountState },
  });

  await chrome.storage.sync.set({
    [STORAGE_KEYS_V2.globalSettings]: globalSettings,
    [perAccountKey]: perAccount,
    [STORAGE_KEYS_V2.perAccountSettingsIndex]: [accountId],
  });

  // Stamp version on both surfaces. After this point, runMigrationIfNeeded is a no-op.
  await chrome.storage.local.set({ [STORAGE_KEYS_V2.storageVersion]: STORAGE_VERSION });
  await chrome.storage.sync.set({ [STORAGE_KEYS_V2.storageVersion]: STORAGE_VERSION });

  await chrome.storage.local.remove([...V1_LOCAL_KEYS_TO_REMOVE]);
  await chrome.storage.sync.remove([...V1_SYNC_KEYS_TO_REMOVE]);
}

function stripGlobalKeys(auto: Partial<AutomationSettings>): Partial<PerAccountSettings> {
  const { ignoredRepos: _ignored, enableKeyboardShortcuts: _kb, ...rest } = auto;
  return rest;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

async function deriveAccountIdSafe(
  auth: Auth | undefined,
  v1Settings: { enterpriseHost?: string } | undefined,
): Promise<string> {
  // No active auth (legacy `github_token` only): we can't reach `/user`,
  // and the PAT path migrates lazily on first sign-in elsewhere. Use a
  // placeholder; the real account id slots in once the user signs in.
  if (!auth) return 'gh_unknown';

  try {
    const me = await request<{ login: string }>('/user');
    if (me?.login) return buildAccountId(me.login, v1Settings?.enterpriseHost);
  } catch {
    // network down, suspended app, etc. — fall through to placeholder.
  }
  return 'gh_unknown';
}
