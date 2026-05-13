# GitHub /search/issues query constraints

Reference for anyone adding a `/search/issues?q=...` call. Captures one quietly-broken historical query (the OR-grouping form fixed in #166) and the constraint surface around it.

## The rule

GitHub's `/search/issues` endpoint **rejects boolean OR with parens** in the `q` parameter. Anything matching the natural-language pattern

```
(qualifierA:X OR qualifierB:Y)
```

returns HTTP 422 `Validation Failed` with a confusingly-worded error message ("The listed users cannot be searched either because the users do not exist or you do not have permission to view the users.") that obscures the real cause.

## Reproducer

```bash
gh api -X GET "search/issues" \
  -f "q=is:pr is:open (review-requested:@me OR assignee:@me) -author:@me" \
  -f per_page=1
```

Returns HTTP 422.

The fix shape: issue two separate queries and dedupe client-side.

```bash
# Both return 200.
gh api -X GET "search/issues" -f "q=is:pr is:open review-requested:@me -author:@me" -f per_page=1
gh api -X GET "search/issues" -f "q=is:pr is:open assignee:@me -author:@me"        -f per_page=1
```

## Regression net

`tests/github/endpoints/search-query-shapes.test.ts` has two layers:

- **Layer A** — spies on `request` while calling the existing search helpers (`searchAuthoredPRs`, `searchReviewerPRs`). Decodes the `q` param and asserts no `(`, no `OR`, presence of `is:pr` + `is:open`.
- **Layer B** — reads every `*.ts` under `src/github/**` (excluding tests) and greps for any line that has `/search/issues?q=` AND contains `OR` or `(`. Catches a future engineer who adds a new search call site bypassing the existing helpers.

If you legitimately need a `(` in a query (a parenthesised qualifier value like `label:"some (paren) label"`), tighten the test to match the actual bait pattern rather than the broader heuristic.

## What works inside `/search/issues?q=`

- Conjunction (implicit AND): `is:pr is:open -author:@me`
- Exclusion: `-author:@me`, `-label:"in progress"`
- Single qualifier per term: `review-requested:@me`, `assignee:@me`, `repo:owner/name`
- Quoted values for spaces: `label:"in progress"`
- `is:`, `state:`, `type:` filters

## What doesn't work (422 traps)

- `(A OR B)` — boolean OR with parens, regardless of qualifiers.
- Top-level `A OR B` without parens — accepted by GitHub but **only when each side is a complete qualifier expression**; `(A OR B) -author:@me` always fails. Safer pattern: two separate queries.

## See also

- PR #166 — discovery and fix of the original 422 (reviewer-flow broken for ~6 months).
- [GitHub docs — Searching issues and pull requests](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests) (the qualifier list; doesn't document the OR-grouping limitation).
