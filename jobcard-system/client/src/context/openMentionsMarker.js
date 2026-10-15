// The change marker of the signed-in person's unanswered @mentions, as reported by the
// session poll. It lives outside React state, in a tiny subscribable store (the same shape
// as common/modalStack.js). Held in the auth context's value it would re-render every
// useAuth() consumer whenever a mention arrived or was answered, though only the attention
// provider reads it. That one reads it with useSyncExternalStore.

let marker = null;
const listeners = new Set();

// An equal marker is a no-op, so an unchanged poll notifies nobody.
export function setOpenMentionsMarker(next) {
  if (marker === next) return;
  marker = next;
  listeners.forEach(listener => listener());
}

export function getOpenMentionsMarker() {
  return marker;
}

export function subscribeOpenMentionsMarker(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
