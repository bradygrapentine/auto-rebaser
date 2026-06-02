// DIGEST-1 — popup hook for the weekly activity digest.
//
// Reuses `useActivityLog({ scope: 'account' })` for the entries + storage-change
// listener (same account-scope rationale as ActivityLogView) and computes the
// digest with `computeDigest`. `Date.now()` is read HERE (the impure boundary),
// never in the pure core. NO settings hook, NO `usePRStore` — this structurally
// sidesteps the documented settings-read mock ripple.

import { useMemo } from 'react';
import { useActivityLog } from './useActivityLog';
import { computeDigest, type ActivityDigest } from '../../core/activity-digest';

export interface UseDigest {
  digest: ActivityDigest;
  loading: boolean;
}

export function useDigest(): UseDigest {
  const { entries, loading } = useActivityLog({ scope: 'account' });
  const digest = useMemo(() => computeDigest(entries, { now: Date.now() }), [entries]);
  return { digest, loading };
}
