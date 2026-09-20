import { useState, useCallback, useRef, useEffect } from 'react';

// How long the box stays away between one answer and the next question. Long enough that
// the click answering the first cannot land on the second, and that the box visibly goes
// and comes back rather than appearing to reword itself under the reader.
const GAP_MS = 250;

export function useConfirmDialog() {
  const [dialogState, setDialogState] = useState({
    isOpen: false,
    title: 'Confirm',
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    confirmVariant: 'danger'
  });

  // There is one box, but a question can arrive while it is already up — and not because
  // anyone did anything odd. The pricing screen asks from its own countdown rather than
  // from a click, so "close and lose your changes?" and "change an invoiced job?" collide
  // on any job that is invoiced and has both kinds of edit waiting. With a single pending
  // answer the later question simply overwrote the earlier one: the wording swapped
  // mid-read, and the close that raised the first question was never answered at all, so
  // the card sat there refusing to shut with nothing on screen to explain it.
  //
  // So they queue. Whoever asked first is answered first, and every question gets its own
  // answer.
  const onScreen = useRef(null);  // the { options, resolve } being asked right now
  const waiting = useRef([]);     // asked while the box was busy, in the order asked
  const gapTimer = useRef(null);

  const present = useCallback((question) => {
    onScreen.current = question;
    const { title, message, confirmLabel, cancelLabel, confirmVariant, altLabel } = question.options;
    setDialogState({
      isOpen: true,
      title: title || 'Confirm',
      message,
      confirmLabel: confirmLabel || 'Confirm',
      cancelLabel: cancelLabel || 'Cancel',
      confirmVariant: confirmVariant || 'danger',
      altLabel: altLabel || null
    });
  }, []);

  // Pass altLabel for a third middle button — used where the choice is genuinely
  // three-way (do this / do that / neither). It resolves 'alt', which is truthy,
  // so a caller that never asks for one can keep treating the answer as yes/no.
  const showConfirm = useCallback((options) => {
    return new Promise((resolve) => {
      const question = { options, resolve };
      // Busy either way: a question on screen, or the gap before the next one appears.
      if (onScreen.current || gapTimer.current) {
        waiting.current.push(question);
        return;
      }
      present(question);
    });
  }, [present]);

  const answer = useCallback((value) => {
    // A double-click lands here twice. Without this the second press would pull another
    // question off the queue and start a second gap, stranding the first.
    if (!onScreen.current) return;
    const asked = onScreen.current;
    onScreen.current = null;
    setDialogState(prev => ({ ...prev, isOpen: false }));
    asked.resolve(value);
    const next = waiting.current.shift();
    if (!next) return;
    gapTimer.current = setTimeout(() => {
      gapTimer.current = null;
      present(next);
    }, GAP_MS);
  }, [present]);

  const handleCancel = useCallback(() => answer(false), [answer]);
  const handleConfirm = useCallback(() => answer(true), [answer]);
  const handleAlt = useCallback(() => answer('alt'), [answer]);

  // Answer everything still outstanding with "no" and empty the queue. The screen that
  // owns the box calls this when it goes away: a question nobody can see can never be
  // answered, and one left sitting here would park every later question behind it for
  // the rest of the session.
  const cancelConfirms = useCallback(() => {
    clearTimeout(gapTimer.current);
    gapTimer.current = null;
    const asked = onScreen.current;
    const queued = waiting.current;
    onScreen.current = null;
    waiting.current = [];
    setDialogState(prev => (prev.isOpen ? { ...prev, isOpen: false } : prev));
    asked?.resolve(false);
    queued.forEach(question => question.resolve(false));
  }, []);

  useEffect(() => cancelConfirms, [cancelConfirms]);

  return {
    dialogState,
    showConfirm,
    handleCancel,
    handleConfirm,
    handleAlt,
    cancelConfirms
  };
}
