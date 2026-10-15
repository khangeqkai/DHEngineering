// The SQL copy of the one rule for which name a person is shown under: their name if it
// is not empty, else their username. No trimming, because a stored name is already clean
// (cleanName on save, cleanUserNames at startup). The JS twin is displayName in
// shared/names.js — kept identical; these two are the only places the rule may be written.
// Lives in its own file because the query files need it and helpers.js itself requires
// the query files.
function DISPLAY_NAME_SQL(alias) {
  return `COALESCE(NULLIF(${alias}.name, ''), ${alias}.username)`;
}

module.exports = { DISPLAY_NAME_SQL };
