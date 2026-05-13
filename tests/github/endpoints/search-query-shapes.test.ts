// T3 — guard against GitHub /search/issues queries that trip HTTP 422.
//
// History: #166 fixed `searchReviewerPRs` after the natural
// `(review-requested:@me OR assignee:@me)` query 422'd silently in
// production. GitHub's /search/issues endpoint does NOT support boolean
// OR-grouping with parens. The reviewer-flow feature was quietly broken
// for ~6 months because no test exercised the query shape end-to-end.
//
// Two-layer defense:
//
// - Layer A: spy on `request` while calling existing search functions.
//   Decode the `q` param, assert no `(`, no `OR`, that `is:pr` and
//   `is:open` are present, that PRs authored by @me are excluded.
//
// - Layer B: read `src/github/**/*.ts` (excluding tests) and grep every
//   string literal containing `/search/issues?q=` for bait patterns
//   (`OR`, `(`). Catches future engineers who add a new search call
//   site bypassing the existing two helpers.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../../../src/github/http', () => ({ request: vi.fn() }));

import { searchAuthoredPRs } from '../../../src/github/endpoints';
import { searchReviewerPRs } from '../../../src/github/endpoints/reviewer-search';
import { request } from '../../../src/github/http';

beforeEach(() => {
  vi.clearAllMocks();
  (request as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
});

describe('search-query-shapes — Layer A (call-site spy)', () => {
  function decodeQ(url: string): string {
    const m = url.match(/\/search\/issues\?q=([^&]+)/);
    if (!m) throw new Error(`no /search/issues?q= in URL: ${url}`);
    return decodeURIComponent(m[1]);
  }

  it('searchAuthoredPRs query has no OR-grouping bait', async () => {
    await searchAuthoredPRs();
    const url = (request as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const q = decodeQ(url);
    expect(q).toContain('is:pr');
    expect(q).toContain('is:open');
    expect(q).toContain('author:@me');
    expect(q).not.toContain(' OR ');
    expect(q).not.toContain('(');
    expect(q).not.toContain(')');
  });

  it('searchReviewerPRs issues separate queries, none with OR-grouping', async () => {
    await searchReviewerPRs();
    const calls = (request as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const [url] of calls) {
      const q = decodeQ(url as string);
      expect(q).toContain('is:pr');
      expect(q).toContain('is:open');
      expect(q).toContain('-author:@me');
      expect(q).not.toContain(' OR ');
      expect(q).not.toContain('(');
      expect(q).not.toContain(')');
    }
  });
});

describe('search-query-shapes — Layer B (source-tree regex scan)', () => {
  // Resolve src/github/ relative to this test file. import.meta.url is the
  // file:// of the test; walk up to repo root, then down into src/github.
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const scanDir = path.join(repoRoot, 'src', 'github');

  function walk(dir: string, out: string[]): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, out);
        continue;
      }
      // In-scope: src/github/**/*.ts excluding tests.
      if (!entry.name.endsWith('.ts')) continue;
      if (entry.name.endsWith('.test.ts')) continue;
      out.push(full);
    }
    return out;
  }

  it('no /search/issues query string in src/github/**/*.ts contains OR-grouping bait', () => {
    const files = walk(scanDir, []);
    expect(files.length).toBeGreaterThan(0);

    // Match string literals that mention /search/issues?q= AND contain a
    // bait token. The regex is intentionally permissive — it errs toward
    // false-positives (failing the test) over missing a real bug. If a
    // legitimate future query needs a `(` (parenthesised qualifier value
    // like `label:"with paren"`) the test should be tightened then.
    const offenders: Array<{ file: string; line: number; text: string }> = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.includes('/search/issues?q=')) continue;
        // Bait tokens: an `OR` token (uppercase, GitHub's syntax) or a `(`
        // anywhere on the same line as the q= prefix.
        if (/\bOR\b/.test(line) || line.includes('(')) {
          offenders.push({ file: path.relative(repoRoot, file), line: i + 1, text: line.trim() });
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
