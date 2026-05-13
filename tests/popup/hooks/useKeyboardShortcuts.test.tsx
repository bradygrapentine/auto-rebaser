import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useKeyboardShortcuts } from '../../../src/popup/hooks/useKeyboardShortcuts';

function Harness({
  enabled,
  bindings,
  children,
}: {
  enabled: boolean;
  bindings: Record<string, () => void>;
  children?: React.ReactNode;
}) {
  useKeyboardShortcuts({ enabled, bindings });
  return <div data-testid="harness">{children}</div>;
}

function press(key: string, target?: Element) {
  fireEvent.keyDown(target ?? window, { key });
}

describe('useKeyboardShortcuts', () => {
  it('fires the binding for a matching key', () => {
    const r = vi.fn();
    render(<Harness enabled bindings={{ r }} />);
    press('r');
    expect(r).toHaveBeenCalledTimes(1);
  });

  it('does not fire when enabled=false', () => {
    const r = vi.fn();
    render(<Harness enabled={false} bindings={{ r }} />);
    press('r');
    expect(r).not.toHaveBeenCalled();
  });

  it('does not fire when target is an input', () => {
    const r = vi.fn();
    render(
      <Harness enabled bindings={{ r }}>
        <input data-testid="text" />
      </Harness>,
    );
    const input = document.querySelector('input')!;
    fireEvent.keyDown(input, { key: 'r' });
    expect(r).not.toHaveBeenCalled();
  });

  it('does not fire when target is a textarea', () => {
    const r = vi.fn();
    render(
      <Harness enabled bindings={{ r }}>
        <textarea />
      </Harness>,
    );
    const ta = document.querySelector('textarea')!;
    fireEvent.keyDown(ta, { key: 'r' });
    expect(r).not.toHaveBeenCalled();
  });

  it('does not fire when modifier key held (Ctrl/Cmd/Alt)', () => {
    const r = vi.fn();
    render(<Harness enabled bindings={{ r }} />);
    fireEvent.keyDown(window, { key: 'r', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'r', metaKey: true });
    fireEvent.keyDown(window, { key: 'r', altKey: true });
    expect(r).not.toHaveBeenCalled();
  });

  it('ignores keys with no binding', () => {
    const r = vi.fn();
    render(<Harness enabled bindings={{ r }} />);
    press('z');
    expect(r).not.toHaveBeenCalled();
  });

  it('preventDefault is called on bound keys', () => {
    const r = vi.fn();
    render(<Harness enabled bindings={{ r }} />);
    const ev = new KeyboardEvent('keydown', { key: 'r', cancelable: true });
    window.dispatchEvent(ev);
    expect(r).toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(true);
  });

  it('Escape binding fires on Escape key', () => {
    const esc = vi.fn();
    render(<Harness enabled bindings={{ Escape: esc }} />);
    press('Escape');
    expect(esc).toHaveBeenCalledTimes(1);
  });

  // Firefox-popup regression cover (Cowork v2 smoke): bubble-phase window
  // listener was being swallowed by Firefox. We now register on both
  // `document` and `window` in capture phase, deduped per event.
  it('registers in capture phase on both document and window', () => {
    const docAdd = vi.spyOn(document, 'addEventListener');
    const winAdd = vi.spyOn(window, 'addEventListener');
    const r = vi.fn();
    render(<Harness enabled bindings={{ r }} />);
    expect(docAdd).toHaveBeenCalledWith('keydown', expect.any(Function), { capture: true });
    expect(winAdd).toHaveBeenCalledWith('keydown', expect.any(Function), { capture: true });
    docAdd.mockRestore();
    winAdd.mockRestore();
  });

  it('fires the binding exactly once even though listeners are on both targets', () => {
    const r = vi.fn();
    render(<Harness enabled bindings={{ r }} />);
    // Dispatch a real KeyboardEvent so both document+window observe it.
    const ev = new KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true });
    document.body.dispatchEvent(ev);
    expect(r).toHaveBeenCalledTimes(1);
  });
});
