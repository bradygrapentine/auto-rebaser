import { useEffect, useRef, useState, useLayoutEffect } from 'react';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (next: T) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  testId?: string;
}

export function Select<T extends string>({
  value, options, onChange, ariaLabel, disabled, className, testId,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number; width: number; openUp: boolean }>(
    { left: 0, top: 0, width: 0, openUp: false },
  );
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  // Position the menu in viewport coordinates so it escapes any ancestor
  // overflow:hidden / overflow:auto (e.g. the .settings scroll container).
  // Open upward when there's not enough room below the trigger.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const estimatedMenuHeight = Math.min(260, options.length * 26 + 8);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < estimatedMenuHeight && rect.top > estimatedMenuHeight;
    setMenuPos({
      left: rect.left,
      top: openUp ? rect.top - estimatedMenuHeight - 2 : rect.bottom + 2,
      width: rect.width,
      openUp,
    });
  }, [open, options.length]);

  return (
    <div
      ref={wrapRef}
      className={`select-wrap${open ? ' select-wrap--open' : ''} ${className ?? ''}`}
      data-testid={testId}
    >
      <button
        ref={triggerRef}
        type="button"
        className="select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="select-trigger__label">{current?.label ?? ''}</span>
        <span aria-hidden className="select-trigger__chev">▾</span>
      </button>
      {open && (
        <ul
          ref={menuRef}
          role="listbox"
          className="select-menu select-menu--fixed"
          aria-label={ariaLabel}
          style={{
            position: 'fixed',
            left: menuPos.left,
            top: menuPos.top,
            width: menuPos.width,
          }}
        >
          {options.map((o) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              data-value={o.value}
              className={`select-option${o.value === value ? ' select-option--active' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
