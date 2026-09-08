// Tracks the stack of open modal/dialog instances in open order so that only
// the top-most one reacts to global keys (Escape to close, Tab focus trap).
// Without this, a confirmation layered over an edit form would let a single
// Escape close both, and the form's focus trap would fight the confirmation's.

//
// The stack also owns the page-scroll lock: the page behind is frozen while ANY
// modal is open and released only when the LAST one closes. Each modal used to set
// and clear the lock itself, so cancelling a confirm layered over the job screen
// released the page while the job screen was still up.

const stack = [];

export function pushModal(id) {
  // Guard against duplicate pushes (e.g. an effect re-running).
  if (!stack.includes(id)) stack.push(id);
  document.body.style.overflow = 'hidden';
}

export function removeModal(id) {
  const index = stack.indexOf(id);
  if (index !== -1) stack.splice(index, 1);
  if (stack.length === 0) document.body.style.overflow = '';
}

export function isTopModal(id) {
  return stack.length > 0 && stack[stack.length - 1] === id;
}
