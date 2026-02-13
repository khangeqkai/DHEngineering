import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function InactivityWarningModal({
  isOpen,
  secondsRemaining,
  onStayLoggedIn
}) {
  const modalRef = useRef(null);
  const buttonRef = useRef(null);

  // Focus trap and keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    // Focus the button when modal opens
    buttonRef.current?.focus();

    const handleKeyDown = (e) => {
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
  }, [isOpen, onStayLoggedIn]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="inactivity-modal-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="inactivity-title"
      aria-describedby="inactivity-description"
      ref={modalRef}
    >
      <div className="inactivity-modal">
        <div className="inactivity-modal-icon" aria-hidden="true">&#x26A0;</div>
        <h2 id="inactivity-title">Session Timeout Warning</h2>
        <p id="inactivity-description">You will be logged out due to inactivity in:</p>
        <div className="inactivity-countdown" aria-live="polite">{secondsRemaining}</div>
        <p className="inactivity-subtext">seconds</p>
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
