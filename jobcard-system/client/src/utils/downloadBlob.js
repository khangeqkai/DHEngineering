// Hands a file to the browser as a download. A page cannot tell whether the browser went on
// to save it — a blocked or cancelled download gives no signal — so this reports nothing
// and callers must not treat it as proof. The anchor is attached while it is clicked
// (some browsers ignore a click on a detached one). The object URL is revoked a little
// later, not at once: revoking it in the same tick can cancel a download the browser has
// only just started.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
