// The one rule for "are these two typed names the same name?" — capitals, surrounding
// spaces and repeated inner spaces are ignored, so "acme  coatings" and "Acme Coatings"
// count as one. The server's duplicate-name checks (customers, suppliers, quality
// levels, dropdown options) and the job screen's "typed an existing customer's name
// exactly" match all read it here, so a name the screen treats as new is never one the
// server then refuses as a duplicate, or the other way round.
function nameMatchKey(name) {
  return String(name === null || name === undefined ? '' : name).trim().replace(/\s+/g, ' ').toLowerCase();
}

function sameName(a, b) {
  return nameMatchKey(a) === nameMatchKey(b);
}

module.exports = { nameMatchKey, sameName };
