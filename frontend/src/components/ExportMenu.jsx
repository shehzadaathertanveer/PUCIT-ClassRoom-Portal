import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ChevronDownIcon from '@heroicons/react/24/solid/ChevronDownIcon';

/**
 * Dropdown menu that escapes its parent's clipping.
 *
 * The classroom and labroom toolbars both live inside `.lm-scroll-x`, which sets
 * `overflow-y: hidden` so the button row scrolls sideways without growing. A menu
 * positioned absolutely inside that container is clipped to a few pixels and looks
 * like nothing happened when it opened. Rendering through a portal into document.body
 * with fixed positioning takes the menu out of that clipping context entirely.
 *
 * On narrow screens the menu becomes a bottom sheet, which is reachable with a
 * thumb instead of hanging off the right edge.
 */
export default function ExportMenu({
  items,
  label = 'Download',
  icon: Icon,
  buttonClassName = '',
  busy = false,
  busyLabel = 'Preparing...',
  menuWidth = 'w-64'
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState({ top: 0, left: 0, width: 260 });
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 640
  );
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onResize = () => setIsNarrow(window.innerWidth < 640);
    const onScroll = () => setOpen(false);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  // Position before paint so the menu never flashes at the wrong spot.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const gutter = 8;
    const width = Math.min(288, Math.max(240, window.innerWidth - gutter * 2));
    // Prefer dropping below the button, but flip above when there is not room,
    // so the menu is never rendered off the bottom of a short viewport.
    const estimatedHeight = items.length * 56 + 12;
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropAbove = spaceBelow < estimatedHeight && rect.top > spaceBelow;

    setPlacement({
      top: dropAbove ? Math.max(gutter, rect.top - estimatedHeight - 6) : rect.bottom + 6,
      left: Math.max(gutter, Math.min(rect.right - width, window.innerWidth - width - gutter)),
      width
    });
  }, [open, items.length]);

  // Pointer-down outside dismissal, so a click that starts outside never lands on
  // the menu item underneath.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      if (triggerRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const pick = (item) => {
    close();
    item.onClick?.();
  };

  const menu = (
    <div
      ref={menuRef}
      role="menu"
      className={
        isNarrow
          ? 'fixed inset-x-2 bottom-3 z-[100] rounded-2xl border border-white/10 bg-[#0b1220] p-2 shadow-2xl'
          : 'fixed z-[100] rounded-2xl border border-white/10 bg-[#0b1220] p-1.5 shadow-2xl'
      }
      style={
        isNarrow
          ? undefined
          : { top: placement.top, left: placement.left, width: placement.width }
      }
    >
      {isNarrow && (
        <p className="px-3 pt-1 pb-2 text-[10px] uppercase tracking-wider font-semibold text-slate-500">
          Choose export type
        </p>
      )}
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => pick(item)}
          className="block w-full text-left rounded-xl px-3 py-2.5 text-slate-200 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent min-h-[44px]"
        >
          <span className="block text-[13px] font-semibold text-emerald-300">{item.label}</span>
          {item.hint && <span className="block text-[11px] text-slate-400 leading-snug mt-0.5">{item.hint}</span>}
        </button>
      ))}
    </div>
  );

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${buttonClassName} disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        {Icon && <Icon className="w-4 h-4 shrink-0" />}
        <span className="whitespace-nowrap">{busy ? busyLabel : label}</span>
        <ChevronDownIcon className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[90]" onClick={close} aria-hidden="true" />
          {menu}
        </>,
        document.body
      )}
    </div>
  );
}