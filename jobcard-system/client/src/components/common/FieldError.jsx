// The message shown under a form field that failed a submit-time check.
// role="alert" matters: these checks used to fire a pop-up, which screen readers
// announced. Marking the field instead is better for sighted users but silent
// without this, so the message announces itself the moment it appears.
export default function FieldError({ message }) {
  if (!message) return null;
  return <div className="field-error-message" role="alert">{message}</div>;
}
