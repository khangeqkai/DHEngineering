import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function BottomSheet({
  isOpen,
  onClose,
  title,
  size = 'compact',
  closeOnOverlayClick = true,
  headerActions,
  children
}) {
  const handleEscape = useCallback((e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  const handleOverlayClick = closeOnOverlayClick ? onClose : undefined;

  return createPortal(
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div
        className={`modal-popup modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
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
