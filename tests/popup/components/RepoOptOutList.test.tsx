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

  describe('datalist autocomplete', () => {
    it('renders datalist with suggestions in given order', () => {
      render(
        <RepoOptOutList
          label="Skip"
          repos={[]}
          onChange={() => {}}
          suggestions={['octo/cat', 'mona/lisa']}
        />
      );
      const options = document.querySelectorAll('datalist option');
      expect(options).toHaveLength(2);
      expect(options[0]).toHaveAttribute('value', 'octo/cat');
      expect(options[1]).toHaveAttribute('value', 'mona/lisa');
    });

    it('wires list= on the input to the datalist id', () => {
      render(
        <RepoOptOutList
          label="Skip"
          repos={[]}
          onChange={() => {}}
          suggestions={['octo/cat']}
        />
      );
      const input = screen.getByLabelText('Skip input');
      const datalist = document.querySelector('datalist');
      expect(datalist).not.toBeNull();
      expect(input.getAttribute('list')).toBe(datalist!.id);
    });

    it('filters out already-added repos from datalist', () => {
      render(
        <RepoOptOutList
          label="Skip"
          repos={['octo/cat']}
          onChange={() => {}}
          suggestions={['octo/cat', 'mona/lisa']}
        />
      );
      const options = document.querySelectorAll('datalist option');
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveAttribute('value', 'mona/lisa');
    });

    it('saves free-text repo not in suggestions', () => {
      const onChange = vi.fn();
      render(
        <RepoOptOutList
          label="Skip"
          repos={[]}
          onChange={onChange}
          suggestions={['octo/cat']}
        />
      );
      fireEvent.change(screen.getByLabelText('Skip input'), {
        target: { value: 'brand/new' },
      });
      fireEvent.click(screen.getByText('Add'));
      expect(onChange).toHaveBeenCalledWith(['brand/new']);
    });

    it('shows inline error for malformed input', () => {
      const onChange = vi.fn();
      render(
        <RepoOptOutList
          label="Skip"
          repos={[]}
          onChange={onChange}
          suggestions={['octo/cat']}
        />
      );
      fireEvent.change(screen.getByLabelText('Skip input'), {
        target: { value: 'bad-name' },
      });
      fireEvent.click(screen.getByText('Add'));
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent('Use owner/repo format');
    });
  });

});
