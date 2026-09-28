// What a management edit form sends: only the fields whose value differs from what
// the form opened with. Sending the whole form would put back every field someone
// else changed while it was open — a demoted user's old role, a customer's old
// phone number — with the only trace a trail entry under this person's name. The
// server keeps any field it isn't sent.
export function changedFields(current, opened) {
  return Object.fromEntries(Object.entries(current).filter(([key, value]) => value !== opened[key]));
}
