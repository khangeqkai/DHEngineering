// The message shown under a form field that failed a submit-time check.
// role="alert" matters: these checks used to fire a pop-up, which screen readers
// announced. Marking the field instead is better for sighted users but silent
// without this, so the message announces itself the moment it appears.
//
// `id` is what lets the field point back at this message with aria-describedby.
// Without it the message is announced once when it appears and is then lost —
// someone who tabs away and comes back to the field is told nothing about why
// it failed. The field supplies the id; this only has to wear it.
export default function FieldError({ message, id }) {
  if (!message) return null;
  return <div className="field-error-message" role="alert" id={id}>{message}</div>;
}
