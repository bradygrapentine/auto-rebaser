import { useEffect } from 'react';

export type ShortcutBindings = Record<string, () => void>;

interface Options {
  enabled: boolean;
  bindings: ShortcutBindings;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Attaches a window-level keydown listener that dispatches single-key
 * shortcuts to the bindings map. Bindings are keyed by `event.key` (so
 * 'r', 'Escape', '?'). Modifier keys (Ctrl/Cmd/Alt) suppress the
 * shortcut so the user can still use browser shortcuts.
 *
 * Skipped when:
 *   - `enabled` is false
 *   - the event target is an editable element (input/textarea/select/contentEditable)
 *
 * Bindings change reactively each render; the listener reads the latest
 * bindings via a ref so callers don't have to memoize them.
 */
export function useKeyboardShortcuts({ enabled, bindings }: Options): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      const action = bindings[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, bindings]);
}
