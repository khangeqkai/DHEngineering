import { useEffect, useCallback, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { pushModal, removeModal, isTopModal } from './modalStack';
import { handleDialogTab } from './dialogKeys';

// Selector for elements that can receive keyboard focus via Tab.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function BottomSheet({
  isOpen,
  onClose,
  title,
  headerSlot,
  size = 'compact',
  headerActions,
  unsaved = false,
  saved = false,
  // Optional second window docked to the left of this one (the job card's comments).
  // Absent, the output is exactly the plain window; present, both share one row that
  // takes the large window's footprint. The window keeps its size: the pair shifts
  // right to make room for the aside, and on screens too narrow for both, the aside
  // overlaps the window's left edge instead.
  aside = null,
  children
}) {
  const dialogRef = useRef(null);
  const rowRef = useRef(null);
  const previousFocusRef = useRef(null);
  const modalId = useId();

  const handleKeyDown = useCallback((e) => {
    // Only the top-most open dialog reacts to global keys. When a confirmation
    // is layered over this one, this dialog stays quiet so Escape doesn't also
    // close it and its focus trap doesn't fight the layer on top.
    if (!isTopModal(modalId)) return;

    if (e.key === 'Escape') {
      // A control inside that already dealt with this Escape (closing its own
      // small box or list) marks it handled; closing the whole window as well
      // would throw away everything typed in it.
      if (e.defaultPrevented) return;
      onClose();
      return;
    }

    // Trap Tab focus inside the dialog. Query focusable elements live on each
    // press because the dialog's contents change (tab switches, loading state,
    // per-screen forms), so a cached list would go stale.
    // A missing node is passed on as it is: the helper holds Tab (focusable is not called).
    // With an aside the whole row is the trap, so focus can move into the side window.
    // Anything inside a closed (inert) part of it is not a stop.
    const dialog = rowRef.current || dialogRef.current;
    handleDialogTab(e, {
      container: dialog,
      focusable: () => Array.from(
        dialog.querySelectorAll(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null && !el.closest('[inert]'))
    });
  }, [onClose, modalId]);

  // Focus management — keyed only on open/close so a changing
  // onClose identity can't keep snapping focus back to the dialog mid-edit.
  useEffect(() => {
    if (!isOpen) return undefined;

    // Register as the (now) top-most dialog for the duration it's open.
    pushModal(modalId);
    // Remember what was focused before opening so we can restore it on close.
    previousFocusRef.current = document.activeElement;
    // Move focus into the dialog so the first Tab lands on a real field
    // rather than the close button (first in the DOM) or the page behind.
    dialogRef.current?.focus();

    return () => {
      removeModal(modalId);
      // Hand focus back to wherever it was before the dialog opened.
      previousFocusRef.current?.focus?.();
    };
  }, [isOpen, modalId]);

  // Keydown handling (Escape close + Tab trap) — re-bound if the handler changes.
  useEffect(() => {
    if (!isOpen) return undefined;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  // Background clicks never close the dialog — only Escape or the close button
  // do (consistent across every full-screen window in the app), so an accidental
  // click outside can't discard an open form.
  const popup = (
    <div
      ref={dialogRef}
      className={`modal-popup modal-${size}${unsaved ? ' modal-unsaved' : ''}${saved ? ' modal-saved' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabIndex={-1}
    >
      <div className="modal-header">
        {headerSlot ? (
          headerSlot
        ) : (
          <h2 id="modal-title">{title}</h2>
        )}
        {headerActions && (
          <div className="modal-header-actions">{headerActions}</div>
        )}
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      <div className="modal-content">
        {children}
      </div>
    </div>
  );

  return createPortal(
    <div className="modal-overlay">
      {aside ? (
        <div ref={rowRef} className="modal-row">
          {aside}
          {popup}
        </div>
      ) : popup}
    </div>,
    document.body
  );
}

// Sub-components for structured content
BottomSheet.Body = function BottomSheetBody({ children }) {
  return <div className="modal-body">{children}</div>;
};

BottomSheet.Footer = function BottomSheetFooter({ children }) {
  return <div className="modal-footer">{children}</div>;
};
