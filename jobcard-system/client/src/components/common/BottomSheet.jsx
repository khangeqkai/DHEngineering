import { useEffect, useCallback, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { pushModal, removeModal, isTopModal } from './modalStack';

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
  children
}) {
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const modalId = useId();

  const handleKeyDown = useCallback((e) => {
    // Only the top-most open dialog reacts to global keys. When a confirmation
    // is layered over this one, this dialog stays quiet so Escape doesn't also
    // close it and its focus trap doesn't fight the layer on top.
    if (!isTopModal(modalId)) return;

    if (e.key === 'Escape') {
      onClose();
      return;
    }

    // Trap Tab focus inside the dialog. Query focusable elements live on each
    // press because the dialog's contents change (tab switches, loading state,
    // per-screen forms), so a cached list would go stale.
    if (e.key === 'Tab') {
      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const insideDialog = dialog.contains(active);

      if (e.shiftKey) {
        // active === dialog covers the just-opened state where focus sits on
        // the container itself; !insideDialog recaptures focus that slipped out
        // (safe here because this only runs when we're the top-most dialog).
        if (active === first || active === dialog || !insideDialog) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !insideDialog) {
        e.preventDefault();
        first.focus();
      }
    }
  }, [onClose, modalId]);

  // Focus management + scroll lock — keyed only on open/close so a changing
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
    document.body.style.overflow = 'hidden';

    return () => {
      removeModal(modalId);
      document.body.style.overflow = '';
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
  return createPortal(
    <div className="modal-overlay">
      <div
        ref={dialogRef}
        className={`modal-popup modal-${size}`}
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
