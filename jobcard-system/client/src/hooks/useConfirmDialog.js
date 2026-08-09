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

  // Pass altLabel for a third middle button — used where the choice is genuinely
  // three-way (do this / do that / neither). It resolves 'alt', which is truthy,
  // so a caller that never asks for one can keep treating the answer as yes/no.
  const showConfirm = useCallback(({ title, message, confirmLabel, cancelLabel, confirmVariant, altLabel }) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialogState({
        isOpen: true,
        title: title || 'Confirm',
        message,
        confirmLabel: confirmLabel || 'Confirm',
        cancelLabel: cancelLabel || 'Cancel',
        confirmVariant: confirmVariant || 'danger',
        altLabel: altLabel || null
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

  const handleAlt = useCallback(() => {
    setDialogState(prev => ({ ...prev, isOpen: false }));
    resolveRef.current?.('alt');
  }, []);

  return {
    dialogState,
    showConfirm,
    handleCancel,
    handleConfirm,
    handleAlt
  };
}
