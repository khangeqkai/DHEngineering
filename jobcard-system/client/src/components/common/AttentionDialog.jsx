import { useEffect, useRef, useState, useCallback, useContext, createContext } from 'react';
import { ChevronRight } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useModalLayer, isTopModal, useIsTopModal, PINNED_LAYERS } from './modalStack';
import { handleDialogKey } from './dialogKeys';
import { formatDate, formatTime, isToday } from '../../utils/formatters';
import './AttentionDialog.css';

// The id the window holds on the shared modal stack, so the provider can tell "another
// window is open" from "only this one is".
export const ATTENTION_MODAL_ID = 'attention-dialog';

// How a section asks the shell to place focus again when it swaps its own controls in place
// (the forgotten-clock question moving from its time box to "still working?") without
// `contentKey` changing. The shell stays the only place that moves focus.
const AttentionRefocusContext = createContext(() => {});
export const useAttentionRefocus = () => useContext(AttentionRefocusContext);

const CONTROLS = 'input, button';
const enabledControls = (root) => (root
  ? Array.from(root.querySelectorAll(CONTROLS)).filter(el => !el.disabled)
  : []);

// The blocking "Needs your attention" window: a shell that holds its sections (children)
// and a Sign out button. No close button, no click-outside, Escape does nothing, Tab stays
// inside — answering what is asked, or signing out, is the way out. `contentKey` changes
// whenever the set of controls (or their enabled state) does; a section that swaps its own
// controls in place calls `useAttentionRefocus()` instead. Focus already on an enabled
// control in the body is left alone; otherwise it goes to the first enabled control in the
// body, or to the window itself when there is none — never to Sign out, where one stray
// Enter would end the session.
export default function AttentionDialog({ children, contentKey, onSignOut }) {
  const dialogRef = useRef(null);
  const bodyRef = useRef(null);
  const [refocusTick, setRefocusTick] = useState(0);
  const refocus = useCallback(() => setRefocusTick(t => t + 1), []);

  // Pinned (see PINNED_LAYERS in modalStack.js).
  const layer = useModalLayer(ATTENTION_MODAL_ID, true, { pinnedLayer: PINNED_LAYERS.attention });

  // Re-runs when this window becomes the top one, so one opened under the inactivity
  // warning leaves the warning's button alone and takes focus once the warning is gone.
  const isTop = useIsTopModal(ATTENTION_MODAL_ID, true);

  useEffect(() => {
    if (!isTop) return;
    const body = bodyRef.current;
    const active = document.activeElement;
    if (body && active && body.contains(active) && !active.disabled) return;
    const target = enabledControls(body)[0] || dialogRef.current;
    target?.focus();
  }, [contentKey, isTop, refocusTick]);

  // Escape does nothing; Tab stays inside the window.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isTopModal(ATTENTION_MODAL_ID)) return;
      handleDialogKey(e, {
        container: dialogRef.current,
        focusable: () => enabledControls(dialogRef.current)
      });
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  return createPortal(
    <div className="attention-overlay" style={{ zIndex: layer }}>
      <div
        className="attention-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="attention-title"
        ref={dialogRef}
        tabIndex={-1}
      >
        <h2 id="attention-title" className="attention-title">Needs your attention</h2>
        <div className="attention-body" ref={bodyRef}>
          <AttentionRefocusContext.Provider value={refocus}>{children}</AttentionRefocusContext.Provider>
        </div>
        <div className="attention-footer">
          <button type="button" className="btn btn-secondary" onClick={onSignOut}>Sign out</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// When a question was asked: the time if today, otherwise a short date.
function askedAt(iso) {
  if (Number.isNaN(new Date(iso).getTime())) return '';
  return isToday(iso)
    ? formatTime(iso, { hour: '2-digit', minute: '2-digit' })
    : formatDate(iso, { day: 'numeric', month: 'short' });
}

// The "Questions for you" section: one pressable row per job with open mentions. Rows
// are pressable unless `waitReason` says why not ('clock' or 'checking'; null: pressable).
const WAIT_NOTES = { clock: 'Answer your clock first.', checking: 'One moment…' };

export function MentionsSection({ mentions, waitReason, onOpen }) {
  const disabled = !!waitReason;
  return (
    <section className="attention-section" aria-labelledby="attention-mentions-title">
      <h3 id="attention-mentions-title" className="attention-section-title">Questions for you</h3>
      <p className="attention-note">Open each one and reply — any reply counts. This closes once they're all answered.</p>
      {waitReason && <p className="attention-note">{WAIT_NOTES[waitReason]}</p>}
      <ul className="attention-rows">
        {mentions.map(row => (
          <li key={row.jobcardId}>
            <button
              type="button"
              className="attention-row"
              disabled={disabled}
              onClick={() => onOpen(row)}
            >
              <span className="attention-row-main">
                <span className="attention-row-job">
                  {row.jobNumber}
                  {row.description && <span className="attention-row-desc">{` — ${row.description}`}</span>}
                </span>
                <span className="attention-row-first">{row.firstByName}: “{row.firstText}”</span>
              </span>
              <span className="attention-row-meta">
                <span>asked {askedAt(row.oldestAt)}</span>
                {row.count > 1 && <span>{row.count} questions</span>}
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
