// PREVIEW-1 (T2) — the dry-run view. Renders the projected automation actions
// WITHOUT firing any mutation (the SW preview branch already guaranteed that).
// Grouped by PlannedAction kind; delete-branch rows carry a DESTRUCTIVE label;
// direct-merge is never an action row here — instead a notice names the
// candidate count, since clean-status is only knowable at execute time.

import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { usePreview } from '../hooks/usePreview';
import {
  DESTRUCTIVE_KINDS,
  type PlannedAction,
  type PlannedActionKind,
} from '../../background/automations/planned-action';

interface Props {
  onBack: () => void;
}

const KIND_ORDER: PlannedActionKind[] = [
  'enable-auto-merge',
  'direct-merge',
  'delete-branch',
  'resolve-thread',
];

const KIND_LABEL: Record<PlannedActionKind, string> = {
  'enable-auto-merge': 'enable auto-merge',
  'direct-merge': 'direct merge',
  'delete-branch': 'delete branch',
  'resolve-thread': 'resolve thread',
};

const DESTRUCTIVE = new Set<PlannedActionKind>(DESTRUCTIVE_KINDS);

function actionLabel(a: PlannedAction): string {
  switch (a.kind) {
    case 'enable-auto-merge':
      return `${a.repo} #${a.number} → ${a.method}`;
    case 'direct-merge':
      return `${a.repo} #${a.number} → ${a.method}`;
    case 'delete-branch':
      return `${a.repo} #${a.number} — ${a.headRef}`;
    case 'resolve-thread':
      return `${a.repo} #${a.prNumber} — thread ${a.threadId}`;
  }
}

export function PreviewView({ onBack }: Props) {
  const { projection, loading, error } = usePreview();
  useKeyboardShortcuts({ enabled: true, bindings: { Escape: onBack } });

  return (
    <div className="popup-root" data-testid="preview-view">
      <header className="popup-header">
        <button type="button" aria-label="Back" onClick={onBack} className="btn">
          ← back
        </button>
        <span className="popup-header__title" style={{ marginLeft: 4 }}>
          dry run
        </span>
      </header>

      <div className="view-body preview-view">
        <div className="preview-banner" role="status" data-testid="preview-banner">
          DRY RUN — nothing was changed
        </div>

        {/* Polite live region: announces the async PREVIEW_NOW result when it
            replaces "computing…". Kept SEPARATE from the banner's role="status"
            (a sibling, not a wrapper) so the two don't double-announce. */}
        <div aria-live="polite" data-testid="preview-live">
        {loading && <p className="preview-status" data-testid="preview-loading">computing…</p>}
        {error && (
          <p className="preview-status preview-status--error" role="alert" data-testid="preview-error">
            {error}
          </p>
        )}

        {projection && !loading && (
          <>
            {projection.actions.length === 0
              && !(projection.directMergePreviewable === false && projection.directMergeCandidatePRIds.length > 0)
              && (
                <p className="preview-status" data-testid="preview-empty">
                  No automations would act right now.
                </p>
              )}

            {KIND_ORDER.filter((kind) => kind !== 'direct-merge').map((kind) => {
              const rows = projection.actions.filter((a) => a.kind === kind);
              if (rows.length === 0) return null;
              return (
                <section key={kind} className="preview-group" data-testid={`preview-group-${kind}`}>
                  <h2 className="preview-group__title">
                    {KIND_LABEL[kind]} <span className="preview-group__count">({rows.length})</span>
                  </h2>
                  <ul className="preview-group__list">
                    {rows.map((a, i) => (
                      <li key={i} className="preview-row" data-testid={`preview-row-${kind}`}>
                        <span className="preview-row__label">{actionLabel(a)}</span>
                        {DESTRUCTIVE.has(a.kind) && (
                          <span className="preview-row__destructive" data-testid="preview-destructive">
                            DESTRUCTIVE
                            <span className="sr-only"> — this action permanently deletes the branch</span>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}

            {projection.directMergePreviewable === false
              && projection.directMergeCandidatePRIds.length > 0 && (
                <section className="preview-group preview-group--notice" data-testid="preview-directmerge-notice">
                  <h2 className="preview-group__title">{KIND_LABEL['direct-merge']}</h2>
                  <p className="preview-notice">
                    Direct-merge cannot be previewed without contacting GitHub —{' '}
                    {projection.directMergeCandidatePRIds.length} candidate PR(s); clean-status is
                    only knowable at execute time.
                  </p>
                </section>
              )}
          </>
        )}
        </div>
      </div>
    </div>
  );
}
