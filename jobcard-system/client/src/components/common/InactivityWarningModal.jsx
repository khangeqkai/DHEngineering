import { useEffect, useRef, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { TriangleAlert } from 'lucide-react';
import { pushModal, removeModal, isTopModal } from './modalStack';
import { useAuth } from '../../context/AuthContext';

export default function InactivityWarningModal({
  isOpen,
  secondsRemaining,
  onStayLoggedIn
}) {
  const modalRef = useRef(null);
  const buttonRef = useRef(null);
  const modalId = useId();
  const { getUnsavedWorkLabel } = useAuth();
  // Captured once, the moment the countdown appears, and held for as long as it's up —
  // not read on every render. The component re-renders every second as secondsRemaining
  // ticks down, and getUnsavedWorkLabel reads a live registry that screens add to and
  // remove from as their unsaved work appears and disappears, so reading it on every
  // tick would let this sentence appear or vanish mid-countdown. aria-describedby points
  // at it, so a screen reader's description must not change underneath it.
  //
  // Captured during the opening render rather than in an effect: an effect runs after
  // the dialog has already been painted and announced, so the sentence would pop in a
  // frame late and change the description right after the announcement — the same fault
  // at the other end of the countdown. React re-runs this render before committing.
  const [captured, setCaptured] = useState({ open: false, label: null });
  if (isOpen !== captured.open) {
    setCaptured({ open: isOpen, label: isOpen ? getUnsavedWorkLabel() : null });
  }
  const unsavedWorkLabel = captured.label;

  // Join the shared modal stack while open. This warning can appear on top of an
  // open job card or edit form (each a dialog that traps Tab/Escape); registering
  // makes it the top-most layer, so the form behind stops grabbing the keyboard —
  // otherwise Escape would close that form and Enter could save it.
  useEffect(() => {
    if (!isOpen) return undefined;
    pushModal(modalId);
    return () => removeModal(modalId);
  }, [isOpen, modalId]);

  // Focus trap and keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    // Focus the button when modal opens
    buttonRef.current?.focus();

    const handleKeyDown = (e) => {
      // Only the top-most dialog reacts to global keys.
      if (!isTopModal(modalId)) return;

      // Escape key - stay logged in
      if (e.key === 'Escape') {
        e.preventDefault();
        onStayLoggedIn();
        return;
      }

      // Tab key - trap focus within modal
      if (e.key === 'Tab') {
        // Since we only have one focusable element (the button),
        // prevent Tab from leaving the modal
        e.preventDefault();
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onStayLoggedIn, modalId]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="inactivity-modal-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="inactivity-title"
      aria-describedby={unsavedWorkLabel ? 'inactivity-description inactivity-unsaved-warning' : 'inactivity-description'}
      ref={modalRef}
    >
      <div className="inactivity-modal">
        <div className="inactivity-modal-icon" aria-hidden="true">
          <TriangleAlert size={48} />
        </div>
        <h2 id="inactivity-title">Session Timeout Warning</h2>
        <p id="inactivity-description">You will be logged out due to inactivity in:</p>
        <div className="inactivity-countdown" aria-live="polite">{secondsRemaining}</div>
        <p className="inactivity-subtext">seconds</p>
        {/* Sits after the count, not inside it: between the sentence and the number it
            split "logged out in: … seconds" into three pieces that no longer read as one
            phrase. Here it lands against the button that prevents the loss it describes.
            Reading order for a screen reader is unaffected — aria-describedby on the
            dialog lists these two ids in the order they should be spoken, which is not
            the order they appear on screen. */}
        {unsavedWorkLabel && (
          <p id="inactivity-unsaved-warning" className="inactivity-unsaved">
            You have an unsaved {unsavedWorkLabel}. It will be lost unless you continue.
          </p>
        )}
        <button
          ref={buttonRef}
          className="btn btn-primary btn-lg"
          onClick={onStayLoggedIn}
        >
          Stay Logged In
        </button>
      </div>
    </div>,
    document.body
  );
}
