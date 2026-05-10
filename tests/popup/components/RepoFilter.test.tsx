import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RepoFilter } from '../../../src/popup/components/RepoFilter';

function setup(overrides: Partial<Parameters<typeof RepoFilter>[0]> = {}) {
  const defaults: Parameters<typeof RepoFilter>[0] = {
    repos: ['acme/api', 'acme/web', 'octo/notes'],
    selected: [],
    onChange: vi.fn(),
  };
  return { ...defaults, ...overrides };
}

describe('RepoFilter', () => {
  it('renders nothing when there are no repos and no selection', () => {
    const { container } = render(<RepoFilter {...setup({ repos: [] })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('pill shows "filter" when nothing is selected', () => {
    render(<RepoFilter {...setup()} />);
    expect(screen.getByTestId('repo-filter-pill')).toHaveTextContent(/^filter/);
  });

  it('pill shows count when repos are selected', () => {
    render(<RepoFilter {...setup({ selected: ['acme/api', 'acme/web'] })} />);
    expect(screen.getByTestId('repo-filter-pill')).toHaveTextContent('filter (2)');
  });

  it('opens menu on click and lists repos sorted', () => {
    render(<RepoFilter {...setup()} />);
    fireEvent.click(screen.getByTestId('repo-filter-pill'));
    const menu = screen.getByTestId('repo-filter-menu');
    expect(menu).toBeInTheDocument();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);
    const labels = checkboxes.map((c) => c.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Filter to acme/api',
      'Filter to acme/web',
      'Filter to octo/notes',
    ]);
  });

  it('checking a repo fires onChange with the new selection', () => {
    const onChange = vi.fn();
    render(<RepoFilter {...setup({ onChange })} />);
    fireEvent.click(screen.getByTestId('repo-filter-pill'));
    fireEvent.click(screen.getByRole('checkbox', { name: /filter to acme\/api/i }));
    expect(onChange).toHaveBeenCalledWith(['acme/api']);
  });

  it('unchecking a selected repo removes it', () => {
    const onChange = vi.fn();
    render(<RepoFilter {...setup({ selected: ['acme/api', 'acme/web'], onChange })} />);
    fireEvent.click(screen.getByTestId('repo-filter-pill'));
    fireEvent.click(screen.getByRole('checkbox', { name: /filter to acme\/api/i }));
    expect(onChange).toHaveBeenCalledWith(['acme/web']);
  });

  it('"clear all" appears only when something is selected and clears the filter', () => {
    const onChange = vi.fn();
    const { rerender } = render(<RepoFilter {...setup()} />);
    fireEvent.click(screen.getByTestId('repo-filter-pill'));
    expect(screen.queryByTestId('repo-filter-clear')).not.toBeInTheDocument();

    rerender(<RepoFilter {...setup({ selected: ['acme/api'], onChange })} />);
    // Menu is still open from the previous click; rerender preserves component state.
    fireEvent.click(screen.getByTestId('repo-filter-clear'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('preserves a selected repo that is no longer in the repos list (orphan)', () => {
    render(
      <RepoFilter {...setup({ repos: ['acme/api'], selected: ['acme/api', 'gone/repo'] })} />,
    );
    fireEvent.click(screen.getByTestId('repo-filter-pill'));
    expect(screen.getByRole('checkbox', { name: /filter to gone\/repo/i })).toBeInTheDocument();
  });

  it('Esc closes the menu', () => {
    render(<RepoFilter {...setup()} />);
    fireEvent.click(screen.getByTestId('repo-filter-pill'));
    expect(screen.getByTestId('repo-filter-menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('repo-filter-menu')).not.toBeInTheDocument();
  });

  it('outside click closes the menu', () => {
    render(
      <div>
        <button data-testid="outside">outside</button>
        <RepoFilter {...setup()} />
      </div>,
    );
    fireEvent.click(screen.getByTestId('repo-filter-pill'));
    expect(screen.getByTestId('repo-filter-menu')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('repo-filter-menu')).not.toBeInTheDocument();
  });
});
