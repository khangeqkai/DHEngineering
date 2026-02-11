import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export default function BottomSheet({
  isOpen,
  onClose,
  title,
  size = 'compact',
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

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-popup modal-${size}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
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
