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

// The one cleaning rule for a person's stored name: surrounding whitespace removed (all
// Unicode whitespace — tabs, line breaks, non-breaking spaces), inner runs of whitespace
// collapsed to one space, and a name that is blank after that stored as null. Applied when
// a name is saved (the user routes, the seed) and once at startup to names already stored
// (cleanUserNames in db/legacyMigrations.js), so every stored name is already clean.
function cleanName(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim().replace(/\s+/g, ' ');
  return cleaned === '' ? null : cleaned;
}

// The one rule for which name a person is shown under: their name if it is not empty, else
// their username. It does no trimming, because a stored name is already clean (see
// cleanName). Takes anything carrying `name` and `username` (a user row, req.user, an
// employee from the users list). The SQL copy of the same rule, for queries that name a
// person in the row itself, is DISPLAY_NAME_SQL in db/displayNameSql.js. Two copies, JS and
// SQL, kept identical; they are the only places the rule may be written.
function displayName(person) {
  if (!person) return '';
  const name = typeof person.name === 'string' ? person.name : '';
  return name || person.username || '';
}

module.exports = { nameMatchKey, sameName, NAME_MAX, cleanName, displayName };
