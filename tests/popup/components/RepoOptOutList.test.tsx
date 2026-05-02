import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RepoOptOutList } from '../../../src/popup/components/RepoOptOutList';

describe('RepoOptOutList', () => {
  it('renders empty list with label', () => {
    render(<RepoOptOutList label="Skip repos" repos={[]} onChange={() => {}} />);
    expect(screen.getByText('Skip repos')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('renders existing repos as chips', () => {
    render(
      <RepoOptOutList
        label="Skip"
        repos={['octo/r', 'foo/bar']}
        onChange={() => {}}
      />
    );
    expect(screen.getByText('octo/r')).toBeInTheDocument();
    expect(screen.getByText('foo/bar')).toBeInTheDocument();
  });

  it('adds a valid owner/repo on click', () => {
    const onChange = vi.fn();
    render(<RepoOptOutList label="Skip" repos={[]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Skip input'), {
      target: { value: 'octo/r' },
    });
    fireEvent.click(screen.getByText('Add'));
    expect(onChange).toHaveBeenCalledWith(['octo/r']);
  });

  it('adds on Enter key', () => {
    const onChange = vi.fn();
    render(<RepoOptOutList label="Skip" repos={[]} onChange={onChange} />);
    const input = screen.getByLabelText('Skip input');
    fireEvent.change(input, { target: { value: 'a/b' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['a/b']);
  });

  it('rejects invalid input with an error', () => {
    const onChange = vi.fn();
    render(<RepoOptOutList label="Skip" repos={[]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Skip input'), {
      target: { value: 'not-a-repo' },
    });
    fireEvent.click(screen.getByText('Add'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('owner/repo');
  });

  it('rejects duplicate repo', () => {
    const onChange = vi.fn();
    render(
      <RepoOptOutList label="Skip" repos={['a/b']} onChange={onChange} />
    );
    fireEvent.change(screen.getByLabelText('Skip input'), {
      target: { value: 'a/b' },
    });
    fireEvent.click(screen.getByText('Add'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Already in list');
  });

  it('removes a chip on × click', () => {
    const onChange = vi.fn();
    render(
      <RepoOptOutList
        label="Skip"
        repos={['a/b', 'c/d']}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByLabelText('Remove a/b'));
    expect(onChange).toHaveBeenCalledWith(['c/d']);
  });

  it('disables input + buttons when disabled prop set', () => {
    render(
      <RepoOptOutList
        label="Skip"
        repos={['a/b']}
        onChange={() => {}}
        disabled
      />
    );
    expect(screen.getByLabelText('Skip input')).toBeDisabled();
    expect(screen.getByText('Add')).toBeDisabled();
    expect(screen.getByLabelText('Remove a/b')).toBeDisabled();
  });
});
