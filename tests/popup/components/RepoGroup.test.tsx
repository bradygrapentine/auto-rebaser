import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RepoGroup } from '../../../src/popup/components/RepoGroup';
import type { PRGroup } from '../../../src/popup/hooks/useGroupedPRs';
import type { PRRecord } from '../../../src/core/types';

/**
 * Test wrapper that holds local expansion state — RepoGroup is now controlled
 * by PRListView, but the existing test suite asserts it behaves like an
 * uncontrolled component.
 */
function StatefulRepoGroup(props: {
  group: PRGroup;
  defaultExpanded?: boolean;
  userLogin?: string;
}) {
  const [expanded, setExpanded] = useState(props.defaultExpanded ?? false);
  return (
    <RepoGroup
      group={props.group}
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
      userLogin={props.userLogin}
    />
  );
}

function makePR(overrides: Partial<PRRecord> & { id: number; number: number }): PRRecord {
  return {
    title: `PR ${overrides.number}`,
    repo: 'org/repo',
    url: `https://github.com/org/repo/pull/${overrides.number}`,
    state: 'current',
    lastUpdated: 0,
    ...overrides,
  };
}

function makeGroup(opts: {
  hasAttention?: boolean;
  prs?: PRRecord[];
}): PRGroup {
  return {
    repo: 'org/repo',
    hasAttention: opts.hasAttention ?? false,
    prs: opts.prs ?? [makePR({ id: 1, number: 42 })],
  };
}

describe('RepoGroup', () => {
  it('strips owner prefix when it matches userLogin (case-insensitive)', () => {
    const group = makeGroup({});
    render(<StatefulRepoGroup group={group} userLogin="ORG" />);
    const name = screen.getByText('repo', { selector: '.repo-group__name' });
    expect(name).toBeInTheDocument();
    expect(screen.queryByText('org/repo', { selector: '.repo-group__name' })).not.toBeInTheDocument();
  });

  it('keeps owner prefix when it differs from userLogin', () => {
    const group = makeGroup({});
    render(<StatefulRepoGroup group={group} userLogin="someone-else" />);
    expect(screen.getByText('org/repo', { selector: '.repo-group__name' })).toBeInTheDocument();
  });

  it('keeps owner prefix when userLogin is omitted', () => {
    const group = makeGroup({});
    render(<StatefulRepoGroup group={group} />);
    expect(screen.getByText('org/repo', { selector: '.repo-group__name' })).toBeInTheDocument();
  });

  it('shows the repo name and PR count', () => {
    const group = makeGroup({
      prs: [makePR({ id: 1, number: 1 }), makePR({ id: 2, number: 2 }), makePR({ id: 3, number: 3 })],
    });
    render(<StatefulRepoGroup group={group} />);
    expect(screen.getByRole('button', { name: /org\/repo/ })).toBeInTheDocument();
    // Count rendered as text node "3" with parentheses applied via CSS pseudo-elements.
    expect(screen.getByText('3', { selector: '.repo-group__count' })).toBeInTheDocument();
  });

  it('starts collapsed by default — PR rows are not visible', () => {
    const group = makeGroup({ prs: [makePR({ id: 1, number: 42, title: 'Hidden PR' })] });
    render(<StatefulRepoGroup group={group} />);
    expect(screen.queryByText('Hidden PR')).not.toBeInTheDocument();
  });

  it('starts expanded when defaultExpanded=true', () => {
    const group = makeGroup({ prs: [makePR({ id: 1, number: 42, title: 'Visible PR' })] });
    render(<StatefulRepoGroup group={group} defaultExpanded />);
    expect(screen.getByText(/Visible PR/)).toBeInTheDocument();
  });

  it('toggles on header click', () => {
    const group = makeGroup({ prs: [makePR({ id: 1, number: 42, title: 'Toggle PR' })] });
    render(<StatefulRepoGroup group={group} />);
    expect(screen.queryByText(/Toggle PR/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /org\/repo/ }));
    expect(screen.getByText(/Toggle PR/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /org\/repo/ }));
    expect(screen.queryByText(/Toggle PR/)).not.toBeInTheDocument();
  });

  it('shows attention dot when hasAttention=true and group is collapsed', () => {
    const group = makeGroup({ hasAttention: true });
    render(<StatefulRepoGroup group={group} />);
    expect(screen.getByLabelText(/needs attention/i)).toBeInTheDocument();
  });

  it('hides attention dot when group is expanded (status is now visible inline)', () => {
    const group = makeGroup({ hasAttention: true });
    render(<StatefulRepoGroup group={group} defaultExpanded />);
    expect(screen.queryByLabelText(/needs attention/i)).not.toBeInTheDocument();
  });

  it('does not show attention dot when hasAttention=false', () => {
    const group = makeGroup({ hasAttention: false });
    render(<StatefulRepoGroup group={group} />);
    expect(screen.queryByLabelText(/needs attention/i)).not.toBeInTheDocument();
  });

  it('toggles aria-expanded correctly', () => {
    const group = makeGroup({});
    render(<StatefulRepoGroup group={group} />);
    const btn = screen.getByRole('button', { name: /org\/repo/ });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });
});
