// A drawings / customer-property line-item field is stored as a comma-separated
// list of tag slugs, where the explicit "no drawing / nothing supplied" answer is
// the sentinel slug 'N_A'. This is the one place that splits such a field and
// decides what it means — the job printout, the missing-file check, the
// create/update validator and the screen's tag picker all read it through here
// instead of splitting the string or comparing to 'N_A' themselves.

const NA_ANSWER = 'N_A';

// Comma-split, trim, drop blanks. '' / null / undefined -> [].
function splitAnswer(raw) {
  return String(raw || '').split(',').map(v => v.trim()).filter(Boolean);
}

// True when the field carries nothing at all, or carries only the explicit
// "N/A" answer.
function isNaAnswer(raw) {
  const values = splitAnswer(raw);
  return values.length === 0 || (values.length === 1 && values[0] === NA_ANSWER);
}

// True when the field declares some real value — anything other than empty or
// the explicit "N/A" answer.
function declaresAnswer(raw) {
  return splitAnswer(raw).some(v => v !== NA_ANSWER);
}

// True when an already-split list combines the "N/A" answer with something
// else — the one combination a line is never allowed to save.
function hasMixedNa(values) {
  return Array.isArray(values) && values.includes(NA_ANSWER) && values.length > 1;
}

module.exports = { NA_ANSWER, splitAnswer, isNaAnswer, declaresAnswer, hasMixedNa };
