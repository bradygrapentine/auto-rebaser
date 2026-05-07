import type { PollSummary } from '../core/automations-types';

export interface AutomationResults {
  branchesDeleted: number;
  autoMergeEnabled: number;
  threadsResolved: number;
}

export function buildPollSummary(
  rebased: number,
  results: AutomationResults,
  errors: number,
): PollSummary {
  return {
    ranAt: Date.now(),
    rebased,
    branchesDeleted: results.branchesDeleted,
    autoMergeEnabled: results.autoMergeEnabled,
    threadsResolved: results.threadsResolved,
    errors,
  };
}
