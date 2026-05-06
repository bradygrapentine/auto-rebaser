import { describe, it, expect } from 'vitest';
import {
  toMergedPRInput,
  toEligiblePR,
  toPRRef,
  toPRStateMap,
  type PullRequestDetail,
} from '../../../src/background/automations/adapters';
import type { PRRecord } from '../../../src/core/types';

function makePR(overrides: Partial<PRRecord> = {}): PRRecord {
  return {
    id: 1,
    number: 42,
    title: 'Test PR',
    repo: 'owner/repo',
    url: 'https://github.com/owner/repo/pull/42',
    state: 'behind',
    lastUpdated: 1000,
    ...overrides,
  };
}

function makeDetail(overrides: Partial<PullRequestDetail> = {}): PullRequestDetail {
  return {
    id: 1,
    number: 42,
    title: 'Test PR',
    html_url: 'https://github.com/owner/repo/pull/42',
    mergeable_state: 'clean',
    base: { repo: { full_name: 'owner/repo' } },
    node_id: 'MDEwOlB1bGxSZXF1ZXN0MQ==',
    draft: false,
    auto_merge: null,
    head: { ref: 'feature/test', repo: { full_name: 'owner/repo' } },
    ...overrides,
  };
}

describe('toMergedPRInput', () => {
  it('happy path: maps PRRecord + detail to MergedPRInput', () => {
    const pr = makePR();
    const detail = makeDetail();
    const result = toMergedPRInput(pr, detail);
    expect(result.id).toBe(1);
    expect(result.number).toBe(42);
    expect(result.repo).toBe('owner/repo');
    expect(result.headRef).toBe('feature/test');
    expect(result.sameRepo).toBe(true);
  });

  it('fork detection: sameRepo=false when head repo differs', () => {
    const pr = makePR();
    const detail = makeDetail({ head: { ref: 'feature/test', repo: { full_name: 'fork/repo' } } });
    const result = toMergedPRInput(pr, detail);
    expect(result.sameRepo).toBe(false);
  });

  it('missing head → sameRepo=false and headRef=""', () => {
    const pr = makePR();
    const detail = makeDetail({ head: undefined });
    const result = toMergedPRInput(pr, detail);
    expect(result.headRef).toBe('');
    expect(result.sameRepo).toBe(false);
  });

  it('missing detail.base falls back to pr.repo for fork comparison', () => {
    const pr = makePR({ repo: 'owner/repo' });
    const detail = makeDetail({
      base: undefined as unknown as PullRequestDetail['base'],
      head: { ref: 'x', repo: { full_name: 'owner/repo' } },
    });
    const result = toMergedPRInput(pr, detail);
    expect(result.sameRepo).toBe(true);
  });

  it('missing head.repo (null) → sameRepo=false', () => {
    const pr = makePR();
    const detail = makeDetail({ head: { ref: 'feature/test', repo: null } });
    const result = toMergedPRInput(pr, detail);
    expect(result.sameRepo).toBe(false);
  });
});

describe('toEligiblePR', () => {
  it('happy path: maps PRRecord + detail to EligiblePR', () => {
    const pr = makePR();
    const detail = makeDetail();
    const result = toEligiblePR(pr, detail, { squash: true, merge: true, rebase: true });
    expect(result.id).toBe(1);
    expect(result.nodeId).toBe('MDEwOlB1bGxSZXF1ZXN0MQ==');
    expect(result.repo).toBe('owner/repo');
    expect(result.isDraft).toBe(false);
    expect(result.mergeableState).toBe('clean');
    expect(result.autoMergeEnabled).toBe(false);
    expect(result.unsupported).toBe(false);
    expect(result.allowedMethods).toEqual({ squash: true, merge: true, rebase: true });
  });

  it('auto_merge present → autoMergeEnabled=true', () => {
    const pr = makePR();
    const detail = makeDetail({ auto_merge: { enabled: true } });
    const result = toEligiblePR(pr, detail, { squash: true, merge: true, rebase: true });
    expect(result.autoMergeEnabled).toBe(true);
  });

  it('missing node_id → nodeId=""', () => {
    const pr = makePR();
    const detail = makeDetail({ node_id: undefined });
    const result = toEligiblePR(pr, detail, { squash: true, merge: true, rebase: true });
    expect(result.nodeId).toBe('');
  });

  it('draft=true → isDraft=true', () => {
    const pr = makePR();
    const detail = makeDetail({ draft: true });
    const result = toEligiblePR(pr, detail, { squash: true, merge: true, rebase: true });
    expect(result.isDraft).toBe(true);
  });

  it('draft undefined → isDraft=false (?? fallback)', () => {
    const pr = makePR();
    const detail = makeDetail({ draft: undefined });
    expect(toEligiblePR(pr, detail, { squash: true, merge: true, rebase: true }).isDraft).toBe(false);
  });

  it('node_id undefined → nodeId="" (?? fallback)', () => {
    const pr = makePR();
    const detail = makeDetail({ node_id: undefined });
    expect(toEligiblePR(pr, detail, { squash: true, merge: true, rebase: true }).nodeId).toBe('');
  });
});

describe('toPRRef', () => {
  it('happy path: maps PRRecord to PRRef', () => {
    const pr = makePR({ repo: 'org/project', number: 99 });
    const result = toPRRef(pr);
    expect(result.repo).toBe('org/project');
    expect(result.number).toBe(99);
  });
});

describe('toPRStateMap', () => {
  it('collapses array to PRStateMap keyed by owner/repo#number', () => {
    const prs: PRRecord[] = [
      makePR({ id: 1, number: 1, repo: 'o/r', state: 'behind' }),
      makePR({ id: 2, number: 2, repo: 'o/r', state: 'current' }),
    ];
    const map = toPRStateMap(prs);
    expect(map['o/r#1']).toBe('open');
    expect(map['o/r#2']).toBe('open');
  });

  it('branch-deleted state → merged', () => {
    const prs: PRRecord[] = [
      makePR({ id: 1, number: 1, repo: 'o/r', state: 'branch-deleted' as PRRecord['state'] }),
    ];
    const map = toPRStateMap(prs);
    expect(map['o/r#1']).toBe('merged');
  });

  it('delete-failed state → merged', () => {
    const prs: PRRecord[] = [
      makePR({ id: 1, number: 1, repo: 'o/r', state: 'delete-failed' as PRRecord['state'] }),
    ];
    const map = toPRStateMap(prs);
    expect(map['o/r#1']).toBe('merged');
  });

  it('merged state → merged', () => {
    const prs = [makePR({ id: 1, number: 1, repo: 'o/r', state: 'merged' })];
    expect(toPRStateMap(prs)['o/r#1']).toBe('merged');
  });

  it('closed state → closed', () => {
    const prs = [makePR({ id: 1, number: 1, repo: 'o/r', state: 'closed' })];
    expect(toPRStateMap(prs)['o/r#1']).toBe('closed');
  });

  it('empty array → empty map', () => {
    expect(toPRStateMap([])).toEqual({});
  });
});
