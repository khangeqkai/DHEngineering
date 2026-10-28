import { useEffect, useLayoutEffect, useRef, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import { useModalLayer, isTopModal, useFocusWhenTop, anyModalOpenExcept } from './modalStack';
import { handleDialogKey } from './dialogKeys';

export default function ConfirmDialog({
  isOpen,
  title = 'Confirm',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'danger',
  altLabel = null,
  onConfirm,
  onCancel,
  onAlt,
  pinnedLayer = null
}) {
  const confirmButtonRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const altButtonRef = useRef(null);
  const dialogRef = useRef(null);
  const modalId = useId();
  // Registers as the (now) top-most dialog while open, and takes its drawing layer.
  const layer = useModalLayer(modalId, isOpen, { pinnedLayer });
  // Opened over another window (the job window, the attention window): a lighter backdrop,
  // since the two add up. Read once per opening, after the layer hook has joined the stack.
  const [layered, setLayered] = useState(false);
  useLayoutEffect(() => {
    if (isOpen) setLayered(anyModalOpenExcept(modalId));
  }, [isOpen, modalId]);

  // Focus the cancel button when modal opens (safer default) — once it is the top window.
  useFocusWhenTop(modalId, isOpen, () => cancelButtonRef.current?.focus());

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      // Only the top-most open dialog reacts to global keys.
      if (!isTopModal(modalId)) return;

      // A missing node is passed on as it is: the helper holds Tab (focusable is not called), and Escape still cancels.
      handleDialogKey(e, {
        container: dialogRef.current,
        escape: onCancel,
        focusable: () => [cancelButtonRef.current, altButtonRef.current, confirmButtonRef.current].filter(Boolean)
      });
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onCancel, modalId]);

  if (!isOpen) return null;

  const confirmButtonClass = `btn btn-${confirmVariant}`;

  return createPortal(
    <div
      className={`confirm-dialog-overlay${layered ? ' confirm-dialog-overlay--layered' : ''}`}
      style={{ zIndex: layer }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      <div className="confirm-dialog" ref={dialogRef}>
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog-buttons">
          <button
            type="button"
            ref={cancelButtonRef}
            className="btn btn-secondary"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          {altLabel && (
            <button
              type="button"
              ref={altButtonRef}
              className="btn btn-secondary"
              onClick={onAlt}
            >
              {altLabel}
            </button>
          )}
          <button
            type="button"
            ref={confirmButtonRef}
            className={confirmButtonClass}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
