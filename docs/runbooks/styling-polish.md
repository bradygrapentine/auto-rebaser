# Runbook — Styling polish

_Goal: Primer-style rebrand finalized; all 423 tests green._

## Inputs

- Current state: `popup.css` rewritten in Primer style; `Header.tsx`, `RepoGroup.tsx`, `PollSummaryFooter.tsx` updated; **10 test assertions stale**.
- Failing files at last run:
  - `tests/popup/components/Header.test.tsx` — expects "Auto Rebaser", component renders "auto-rebaser".
  - `tests/popup/components/PRRow.test.tsx`
  - `tests/popup/components/PollSummaryFooter.test.tsx` — expects "Just rebased: N", new markup is `rebased <strong>N</strong>`.
  - `tests/popup/components/RepoGroup.test.tsx`
  - `tests/popup/views/PRListView.test.tsx`
  - `tests/popup/views/SettingsView.test.tsx`
  - `tests/popup/views/SignInView.test.tsx` (3 cases — PAT label / title copy)

## Steps

1. `npx vitest run 2>&1 | grep "FAIL"` — confirm exactly which assertions fail.
2. For each failing test:
   - Read the component the test renders.
   - Read the test.
   - Update **only** the assertion (label text, role name, class hook) to match current component output.
   - **Do NOT** change component behavior.
   - Re-run that file: `npx vitest run tests/popup/components/Header.test.tsx`.
3. Once all individual files pass: `npx vitest run` — must be 423/423.
4. `npm run typecheck`.
5. `npm run build` — Chrome bundle must be clean.
6. `npm run build:firefox` — Firefox bundle must be clean.
7. Commit: `chore: refresh test assertions for primer-style ui`.

## Exit

- `vitest run`: 423 passed, 0 failed.
- `tsc --noEmit`: 0 errors.
- Both builds clean.

## Red flags

- "I'll just delete the failing test" — no. Test was protecting real behavior; update its assertion.
- "I'll change the component to make the test happy" — no. The user already chose the new copy. Match the test to the component.
- New copy looks wrong → ask user; don't unilaterally rename in either direction.
