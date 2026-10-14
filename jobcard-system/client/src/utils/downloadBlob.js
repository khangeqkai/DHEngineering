// Hands a file to the browser as a download and reports whether the browser took it.
// A download that fires after an await is no longer inside the user's click, so a strict
// browser can refuse it — silently. A refusal means no file exists, so callers must not
// report it as saved. The object URL is revoked a little later, not at once: revoking it
// in the same tick can cancel a download the browser has only just started.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  let accepted = false;
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    accepted = a.dispatchEvent(new MouseEvent('click', { bubbles: false, cancelable: true }));
  } catch {
    accepted = false;
  }
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return accepted;
}
