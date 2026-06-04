// Tracks the stack of open modal/dialog instances in open order so that only
// the top-most one reacts to global keys (Escape to close, Tab focus trap).
// Without this, a confirmation layered over an edit form would let a single
// Escape close both, and the form's focus trap would fight the confirmation's.

const stack = [];

export function pushModal(id) {
  // Guard against duplicate pushes (e.g. an effect re-running).
  if (!stack.includes(id)) stack.push(id);
}

export function removeModal(id) {
  const index = stack.indexOf(id);
  if (index !== -1) stack.splice(index, 1);
}

export function isTopModal(id) {
  return stack.length > 0 && stack[stack.length - 1] === id;
}
