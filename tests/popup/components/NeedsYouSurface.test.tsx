import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { NeedsYouSurface } from '../../../src/popup/components/NeedsYouSurface';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../../src/core/automations-types';
import type { PRRecord } from '../../../src/core/types';
import type { PRRecordPhaseTwo, AutomationSettings } from '../../../src/core/automations-types';

function pr(overrides: Partial<PRRecord & PRRecordPhaseTwo> = {}): PRRecord & PRRecordPhaseTwo {
  return {
    id: 1,
    number: 1,
    title: 't',
    repo: 'org/r',
    url: 'https://github.com/org/r/pull/1',
    state: 'current',
    lastUpdated: 0,
    ...overrides,
  } as PRRecord & PRRecordPhaseTwo;
}

const settings: AutomationSettings = { ...DEFAULT_AUTOMATION_SETTINGS };

describe('NeedsYouSurface', () => {
  it('renders an item with a deep-link action for an actionable PR', () => {
    render(<NeedsYouSurface prs={[pr({ id: 7, number: 7, state: 'conflict' })]} settings={settings} />);
    expect(screen.getByTestId('needs-you-surface')).toBeTruthy();
    expect(screen.getAllByTestId('needs-you-item')).toHaveLength(1);
    const action = screen.getByTestId('needs-you-action') as HTMLAnchorElement;
    expect(action.getAttribute('href')).toBe('https://github.com/org/r/pull/1');
    expect(action.textContent).toBe('open conflicts');
    // Clicking the action must not bubble to the row (stopPropagation).
    fireEvent.click(action);
  });

  it('renders nothing when no PR is actionable', () => {
    render(<NeedsYouSurface prs={[pr({ state: 'current' }), pr({ id: 2, state: 'updated' })]} settings={settings} />);
    expect(screen.queryByTestId('needs-you-surface')).toBeNull();
  });

  it('only includes actionable PRs (selective, not blanket)', () => {
    render(
      <NeedsYouSurface
        prs={[pr({ id: 1, state: 'current' }), pr({ id: 2, number: 2, state: 'rebase-rejected' })]}
        settings={settings}
      />,
    );
    const items = screen.getAllByTestId('needs-you-item');
    expect(items).toHaveLength(1);
    expect(screen.getByTestId('needs-you-action').textContent).toBe('resolve conflict');
  });

  it('renders persisted ciFailures (soft-join from T2), render-capped at 2 + N more', () => {
    render(
      <NeedsYouSurface
        prs={[
          pr({
            id: 3,
            number: 3,
            state: 'conflict',
            ciFailures: [
              { name: 'build', url: null },
              { name: 'lint', url: null },
              { name: 'e2e', url: null },
            ],
          }),
        ]}
        settings={settings}
      />,
    );
    expect(screen.getByTestId('needs-you-ci').textContent).toBe('build, lint +1 more');
  });
});
