// The stop form's "what did you do?" answer, and what counts as junk. A note is
// refused when it has no letters at all ("123", "..."), when it is one key held down
// ("aaaa", "x", "...."), or when it has fewer than two letters. Short real answers
// pass ("QC", "Weld", "Setup"). There is no word count. The stop form checks it before
// sending and the server checks it again, so the form can't be bypassed.

const STOP_NOTE_MESSAGE = 'Say a little more about what you did';

function stopNoteMessage(text) {
  const note = String(text == null ? '' : text).trim();
  const letters = note.match(/\p{L}/gu) || [];
  if (letters.length < 2) return STOP_NOTE_MESSAGE;
  // One character repeated, ignoring capitals and spaces ("aaaa", "A A A").
  const chars = Array.from(note.replace(/\s+/g, '').toLowerCase());
  if (chars.every(c => c === chars[0])) return STOP_NOTE_MESSAGE;
  return null;
}

module.exports = { STOP_NOTE_MESSAGE, stopNoteMessage };
