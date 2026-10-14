// A per-part file is stored as "{name} [p{code}]" (or "{name} [p{code}] (n)" on a
// name clash), where the code comes from the part's permanent id. The tag is matched
// only at the END of the base name (the extension already removed) — where the upload
// route writes it — so a file whose human name merely contains another part's code
// can't masquerade as that part's attachment. This is the one place that rule is
// written; the files route and the missing-file check / printout both read it.

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Matches "[code]" (plus any " (n)" clash suffix) at the end of a base name.
function partTagRegex(code) {
  return new RegExp(`\\[${escapeRegex(code)}\\](?: \\(\\d+\\))?$`);
}

// Same, with the space before the tag included — for stripping it back off a name.
function partTagWithSpaceRegex(code) {
  return new RegExp(` \\[${escapeRegex(code)}\\](?: \\(\\d+\\))?$`);
}

module.exports = { partTagRegex, partTagWithSpaceRegex };
