# Auto-Rebaser — Roadmap

Forward-looking themes. Granular work lives in [`docs/superpowers/BACKLOG.md`](superpowers/BACKLOG.md);
this file is the why/sequencing one level up. v2.0.0 is live on Chrome + Firefox.

## v1.1 — "Control & Trust"

A tool that auto-acts on your PRs lives or dies on the user believing it won't do
something dumb. The highest-leverage work now is making the automation **legible
and bounded**, not adding more autonomy. Each row below is low-architectural-risk,
builds on substrate that already exists, and is a clean disjoint backlog row.

### Wave 1 (the 4 Ready rows — `BACKLOG.md` §1: CT-1…CT-4)

| # | Row | Effort | Substrate it builds on |
|---|---|---|---|
| CT-1 | Conflict-aware backoff — retry a rebase only after the PR's head SHA changes | Low | CONFLICT-1's `rebase-rejected` state |
| CT-2 | CI-green gate — only auto-rebase when the PR's last check run was successful | Medium | poll-cycle / automations orchestrator |
| CT-3 | Per-repo allow/deny + draft/label filters | Low–Med | `known_repos`, per-account settings |
| CT-4 | Desktop notifications on state transitions | Low–Med | `notifications.ts` |

**Sequencing / dispatch:** CT-1 and CT-2 both touch the poll-cycle engine, so they
are **not** parallel-safe together — run CT-2 then CT-1 serially on the engine. CT-3
(popup/settings) and CT-4 (`notifications.ts`) are disjoint and parallel-safe. A
clean wave: `{CT-2 → CT-1}` ∥ `{CT-3}` ∥ `{CT-4}`.

### Wave 2 (next, not yet filed)

- **Dry-run mode** — "would have rebased X" without acting, to build trust before
  enabling the more aggressive automations. (Medium.)
- **Smart rebase queuing** — rebase in merge-likelihood order (CI-green + approved
  first) to save Actions minutes. Deliberately *not* in Wave 1: it's core-engine
  work (a merge-likelihood scorer in the highest-blast code), not control/trust.

## Deferred — v2.x platform bets (capture-first spike required)

Both introduce an external shape or a major architectural lift; per project
discipline they need a capture-first spike **before** planning, so they are parked,
not Ready:

- **Org-level policy import** — read a repo/org `.auto-rebaser.yml` so teams can
  standardize behavior. Introduces an external file shape → capture a real sample
  first.
- **GitLab / Bitbucket adapter** — biggest reach expansion, behind the
  `host-config`/client abstraction. Major lift.

## Explicitly out of scope (for now)

- **Auto-approve dependabot/version-bump PRs** — runs *against* the control & trust
  theme (more autonomy, less control) and auto-approving code is the highest-risk
  item; dropped from v1.1.
- **i18n scaffolding / Cmd-K command palette / first-run onboarding page** —
  foundational-but-no-demand for a solo extension; the existing `j/r/?` shortcuts
  already cover keyboard-first. Match scope to project size.
- **Scheduled daily digest / quiet-hours push** — a daily *on-open rollup* is fine
  as client-side config, but no scheduled background push (notification fatigue +
  scheduling complexity).

_Source: 2026-06-01 `/btw` brainstorm + assessment. Themes, not commitments — each
row earns its place through the normal `/sprint` gates._
