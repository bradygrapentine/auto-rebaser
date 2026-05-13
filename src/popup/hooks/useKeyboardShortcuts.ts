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
 * Attaches a keydown listener in CAPTURE phase on both `document` and
 * `window`, dispatching single-key shortcuts to the bindings map.
 * Bindings are keyed by `event.key` (so 'r', 'Escape', '?'). Modifier
 * keys (Ctrl/Cmd/Alt) suppress the shortcut so the user can still use
 * browser shortcuts.
 *
 * Capture phase + dual-target registration is required for Firefox
 * popups (the Cowork v2 smoke surfaced `?` / `r` / `s` / `Esc` all
 * being swallowed when only a bubble-phase `window` listener was used).
 * The handler dedupes via a per-event guard so each keydown fires
 * exactly once even when both listeners would otherwise see it.
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
    const seen = new WeakSet<KeyboardEvent>();
    const handler = (event: KeyboardEvent) => {
      if (seen.has(event)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      const action = bindings[event.key];
      if (!action) return;
      seen.add(event);
      event.preventDefault();
      action();
    };
    document.addEventListener('keydown', handler, { capture: true });
    window.addEventListener('keydown', handler, { capture: true });
    return () => {
      document.removeEventListener('keydown', handler, { capture: true });
      window.removeEventListener('keydown', handler, { capture: true });
    };
  }, [enabled, bindings]);
}
