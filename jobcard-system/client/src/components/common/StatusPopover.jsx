import { useEffect, useRef } from 'react';
import PlacedPopover from './PlacedPopover';
import { Undo2 } from 'lucide-react';

// The status picker's drop-down, shared by the job list's status column and the job
// window's status pill, so the two can't drift: the "Put back to …" row on top, then
// each group under its heading (statusMenuModel in jobcard/constants.js builds both).
// The caller draws each row (renderRow(option, lead)) as a .status-popover-item button
// carrying the option's badge, because what picking one does differs between the two
// screens; `lead` is what goes before the badge on the "Put back to …" row (drawn here
// once, so both screens show it the same way), and null on every other row.
//
// The "Put back to …" row is the likely choice on a flagged job, so it sits on top
// under its own heading, on a tinted band, and opening the menu puts the keyboard on
// it — Enter puts the job straight back. Otherwise opening it puts the keyboard on the
// job's current status (the row marked .active);
// Up/Down walk the rows and Home/End jump to the ends. Headings are labels, not rows,
// so the walk only ever lands on a status.
//
// Where it opens (down, or up when there's no room below) is PlacedPopover's job.

export default function StatusPopover({ putBack, groups, renderRow }) {
  const ref = useRef(null);

  useEffect(() => {
    const menu = ref.current;
    if (!menu) return undefined;
    // A frame later: the menu's opener (useDismissableMenu, in the screen that owns
    // this menu) records what had focus once this has mounted, so Escape can return
    // there — moving focus in the same moment would make it remember this row instead.
    const frame = requestAnimationFrame(() => {
      const items = Array.from(menu.querySelectorAll('.status-popover-item'));
      (items.find(el => el.classList.contains('status-popover-item--putback'))
        || items.find(el => el.classList.contains('active'))
        || items[0])?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleKeyDown = (e) => {
    const items = Array.from(ref.current?.querySelectorAll('.status-popover-item') || []);
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement);
    let next = null;
    if (e.key === 'ArrowDown') next = current < items.length - 1 ? current + 1 : 0;
    else if (e.key === 'ArrowUp') next = current > 0 ? current - 1 : items.length - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next === null) return;
    e.preventDefault();
    items[next].focus();
  };

  return (
    <PlacedPopover menuRef={ref} onKeyDown={handleKeyDown}>
      {putBack && (
        <div className="status-popover-group status-popover-putback">
          <div className="status-popover-heading">Before the flag</div>
          {renderRow(putBack, (
            <span className="status-putback-lead">
              <Undo2 size={14} aria-hidden="true" />
              Put back to
            </span>
          ))}
        </div>
      )}
      {groups.map(g => (
        <div key={g.group} className="status-popover-group">
          <div className="status-popover-heading">{g.label}</div>
          {g.options.map(opt => renderRow(opt))}
        </div>
      ))}
    </PlacedPopover>
  );
}
