// AccountScope — runtime handle binding an AccountId to per-account operations.
//
// Each method delegates 1-line to the corresponding `*For(this.id, ...)` helper.
// No new logic; this class is a shape consolidation, not a behavior change.
//
// The SW poll cycle constructs one AccountScope per iteration. Popup callers
// keep using the existing implicit-id helpers (`loadStore`, `getAuth`, etc.)
// — migrating the popup is a future pass.

import type { AccountId } from './storage/multi-account';
import { setAccountState } from './storage/multi-account';
import type { PRRecord, PRStore } from './types';
import type { ActivityEntry } from './activity-log-types';
import type { Auth } from './auth-store';
import type { AutomationSettings, ResolvedThreadsStore } from './automations-types';
import type { TokenSet } from './auth-device-flow';
import type { Installation } from '../github/endpoints/installations';
import type { PingedStore } from './ping-throttle';
import type { RerequestStore } from './rerequest-throttle';

import {
  loadStoreFor,
  saveStoreFor,
  upsertPRsFor,
  pruneStaleFor,
  stampPollTimeFor,
  loadReviewerStoreFor,
  saveReviewerStoreFor,
  upsertReviewerPRsFor,
  pruneStaleReviewerFor,
} from './pr-store';
import { appendActivityFor } from './activity-log';
import {
  getAutomationSettingsFor,
  getResolvedThreadsFor,
  saveResolvedThreadsFor,
} from './automations-store';
import {
  getAuthFor,
  setAuthGitHubAppFor,
  setInstallationsFor,
} from './auth-store';
import { getPingedStoreFor, recordPingFor } from './ping-throttle';
import { getRerequestStoreFor, recordRerequestFor } from './rerequest-throttle';
import { recordKnownReposFor } from './known-repos-store';

export class AccountScope {
  constructor(readonly id: AccountId) {}

  // ── PRStore (authored) ──────────────────────────────────────────────────
  loadStore(): Promise<PRStore> { return loadStoreFor(this.id); }
  saveStore(store: PRStore): Promise<void> { return saveStoreFor(this.id, store); }
  upsertPRs(recs: PRRecord[]): Promise<PRStore> { return upsertPRsFor(this.id, recs); }
  pruneStale(activeIds: number[]): Promise<PRStore> { return pruneStaleFor(this.id, activeIds); }
  stampPollTime(now?: number): Promise<PRStore> { return stampPollTimeFor(this.id, now); }

  // ── Reviewer PRStore ────────────────────────────────────────────────────
  loadReviewerStore(): Promise<PRStore> { return loadReviewerStoreFor(this.id); }
  saveReviewerStore(store: PRStore): Promise<void> { return saveReviewerStoreFor(this.id, store); }
  upsertReviewerPRs(recs: PRRecord[]): Promise<PRStore> { return upsertReviewerPRsFor(this.id, recs); }
  pruneStaleReviewer(activeIds: number[]): Promise<PRStore> { return pruneStaleReviewerFor(this.id, activeIds); }

  // ── Auth ────────────────────────────────────────────────────────────────
  getAuth(): Promise<Auth | null> { return getAuthFor(this.id); }
  setAuthGitHubApp(tokenSet: TokenSet): Promise<void> { return setAuthGitHubAppFor(this.id, tokenSet); }
  setInstallations(insts: Installation[]): Promise<void> { return setInstallationsFor(this.id, insts); }

  // ── Automations ────────────────────────────────────────────────────────
  getAutomationSettings(): Promise<AutomationSettings> { return getAutomationSettingsFor(this.id); }
  getResolvedThreads(): Promise<ResolvedThreadsStore> { return getResolvedThreadsFor(this.id); }
  saveResolvedThreads(map: ResolvedThreadsStore): Promise<void> { return saveResolvedThreadsFor(this.id, map); }

  // ── Throttles ──────────────────────────────────────────────────────────
  getPingedStore(): Promise<PingedStore> { return getPingedStoreFor(this.id); }
  recordPing(prId: number, now?: number): Promise<void> { return recordPingFor(this.id, prId, now); }
  getRerequestStore(): Promise<RerequestStore> { return getRerequestStoreFor(this.id); }
  recordRerequest(prId: number, now?: number): Promise<void> { return recordRerequestFor(this.id, prId, now); }

  // ── Misc per-account ────────────────────────────────────────────────────
  appendActivity(entries: ActivityEntry[]): Promise<void> { return appendActivityFor(this.id, entries); }
  recordKnownRepos(names: readonly string[]): Promise<void> { return recordKnownReposFor(this.id, names); }
  setActionableCount(n: number): Promise<void> { return setAccountState(this.id, 'actionable_count', n); }
}
