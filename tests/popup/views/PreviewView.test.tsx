// PREVIEW-1 (T2) — PreviewView render. usePreview is mocked so this is a pure
// render test (no chrome messaging).
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PreviewProjection } from '../../../src/background/automations/planned-action';

const mockUsePreview = vi.fn();
vi.mock('../../../src/popup/hooks/usePreview', () => ({ usePreview: () => mockUsePreview() }));

import { PreviewView } from '../../../src/popup/views/PreviewView';

function projection(over: Partial<PreviewProjection> = {}): PreviewProjection {
  return {
    actions: [
      { kind: 'enable-auto-merge', prId: 1, nodeId: 'N1', repo: 'o/a', number: 101, method: 'SQUASH' },
      { kind: 'delete-branch', prId: 2, owner: 'o', name: 'b', headRef: 'fb', repo: 'o/b', number: 102 },
      { kind: 'resolve-thread', threadId: 'tC', repo: 'o/c', prNumber: 103 },
    ],
    counts: { 'enable-auto-merge': 1, 'direct-merge': 0, 'delete-branch': 1, 'resolve-thread': 1 },
    directMergePreviewable: false,
    directMergeCandidatePRIds: [],
    generatedAt: 0,
    ...over,
  };
}

beforeEach(() => {
  mockUsePreview.mockReturnValue({ projection: projection(), loading: false, error: null, run: vi.fn() });
});

describe('PreviewView', () => {
  it('renders the dry-run banner, one row per action, grouped by kind', () => {
    render(<PreviewView onBack={() => {}} />);
    expect(screen.getByTestId('preview-banner')).toHaveTextContent(/DRY RUN/i);
    expect(screen.getByTestId('preview-group-enable-auto-merge')).toBeInTheDocument();
    expect(screen.getByTestId('preview-group-delete-branch')).toBeInTheDocument();
    expect(screen.getByTestId('preview-group-resolve-thread')).toBeInTheDocument();
    expect(screen.getByText('o/a #101 → SQUASH')).toBeInTheDocument();
    expect(screen.getByText('o/b #102 — fb')).toBeInTheDocument();
    expect(screen.getByText(/thread tC/)).toBeInTheDocument();
  });

  it('renders a DESTRUCTIVE label on delete-branch rows only', () => {
    render(<PreviewView onBack={() => {}} />);
    const destructive = screen.getAllByTestId('preview-destructive');
    expect(destructive).toHaveLength(1);
    // It belongs to the delete-branch group.
    expect(screen.getByTestId('preview-group-delete-branch')).toContainElement(destructive[0]);
  });

  it('(PREVIEW-8 a11y) the results region is a polite live region and groups are h2', () => {
    render(<PreviewView onBack={() => {}} />);
    expect(screen.getByTestId('preview-live')).toHaveAttribute('aria-live', 'polite');
    // Group titles are h2 (the view has no h1 — a flat h2 hierarchy, no skipped level).
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(headings.map((h) => h.className)).toContain('preview-group__title');
  });

  it('(PREVIEW-8 a11y) the DESTRUCTIVE badge carries a screen-reader text association', () => {
    render(<PreviewView onBack={() => {}} />);
    expect(screen.getByTestId('preview-destructive')).toHaveTextContent(/permanently deletes the branch/i);
  });

  it('shows the direct-merge not-previewable notice with the candidate count and NO direct-merge rows', () => {
    mockUsePreview.mockReturnValue({
      projection: projection({ actions: [], counts: { 'enable-auto-merge': 0, 'direct-merge': 0, 'delete-branch': 0, 'resolve-thread': 0 }, directMergePreviewable: false, directMergeCandidatePRIds: [7, 8, 9] }),
      loading: false, error: null, run: vi.fn(),
    });
    render(<PreviewView onBack={() => {}} />);
    const notice = screen.getByTestId('preview-directmerge-notice');
    expect(notice).toHaveTextContent('3 candidate PR(s)');
    expect(notice).toHaveTextContent(/cannot be previewed without contacting GitHub/i);
    expect(screen.queryByTestId('preview-row-direct-merge')).not.toBeInTheDocument();
  });

  it('shows loading and error states', () => {
    mockUsePreview.mockReturnValue({ projection: null, loading: true, error: null, run: vi.fn() });
    const { rerender } = render(<PreviewView onBack={() => {}} />);
    expect(screen.getByTestId('preview-loading')).toBeInTheDocument();

    mockUsePreview.mockReturnValue({ projection: null, loading: false, error: 'BOOM', run: vi.fn() });
    rerender(<PreviewView onBack={() => {}} />);
    expect(screen.getByTestId('preview-error')).toHaveTextContent('BOOM');
  });

  it('back button + Escape call onBack', () => {
    const onBack = vi.fn();
    render(<PreviewView onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onBack).toHaveBeenCalledTimes(2);
  });
});
