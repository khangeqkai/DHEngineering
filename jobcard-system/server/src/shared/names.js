// The one rule for "are these two typed names the same name?" — capitals, surrounding
// spaces and repeated inner spaces are ignored, so "acme  coatings" and "Acme Coatings"
// count as one. The server's duplicate-name checks (customers, suppliers, dropdown
// options) and the job screen's "typed an existing customer's name exactly" match
// all read it here, so a name the screen treats as new is never one the server then
// refuses as a duplicate, or the other way round.
function nameMatchKey(name) {
  return String(name === null || name === undefined ? '' : name).trim().replace(/\s+/g, ' ').toLowerCase();
}

function sameName(a, b) {
  return nameMatchKey(a) === nameMatchKey(b);
}

// The longest name a customer may be given. A customer's name becomes a folder on
// disk followed by a ~34-character permanent-id code, and a folder name may be at
// most 255 characters — 150 leaves plenty of room. Read by the server's name checks
// and by the Customers page's name box.
const NAME_MAX = 150;

module.exports = { nameMatchKey, sameName, NAME_MAX };
