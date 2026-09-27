// The one name -> code rule for a tag's stored `value` (the slug a job line item
// actually saves). Both the live tags route (a new/renamed option) and the seed
// script (freshly-seeded options) derive a tag's value this same way, so a tag
// created on the spot never ends up with a different value shape than a seeded one.

function nameToValue(name) {
  return name.toUpperCase().replace(/[\s/]+/g, '_').replace(/[^A-Z0-9_]/g, '');
}

module.exports = { nameToValue };
