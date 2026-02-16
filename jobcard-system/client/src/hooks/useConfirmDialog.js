import { useState, useCallback, useRef } from 'react';

export function useConfirmDialog() {
  const [dialogState, setDialogState] = useState({
    isOpen: false,
    title: 'Confirm',
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    confirmVariant: 'danger'
  });
  const resolveRef = useRef(null);

  const showConfirm = useCallback(({ title, message, confirmLabel, cancelLabel, confirmVariant }) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialogState({
        isOpen: true,
        title: title || 'Confirm',
        message,
        confirmLabel: confirmLabel || 'Confirm',
        cancelLabel: cancelLabel || 'Cancel',
        confirmVariant: confirmVariant || 'danger'
      });
    });
  }, []);

  const handleCancel = useCallback(() => {
    setDialogState(prev => ({ ...prev, isOpen: false }));
    resolveRef.current?.(false);
  }, []);

  const handleConfirm = useCallback(() => {
    setDialogState(prev => ({ ...prev, isOpen: false }));
    resolveRef.current?.(true);
  }, []);

  return {
    dialogState,
    showConfirm,
    handleCancel,
    handleConfirm
  };
}
