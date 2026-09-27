// A supplier's phone/email are hidden from non-management the same way a customer
// contact's are (see customerFields in jobcard-helpers.js). suppliers.js's own
// toApiFormat and search.js's formatSupplier both need this rule, and neither can
// import the other's function cleanly (suppliers.js exports a router, and search.js
// reads raw rows shaped slightly differently) — so it lives here, in its own small
// file, and both callers use it instead of keeping their own copy.

// `row` is a raw DB row carrying snake_case contact_phone/contact_email columns.
function supplierContactFields(row, canManage) {
  return {
    contactPhone: canManage ? row.contact_phone : null,
    contactEmail: canManage ? row.contact_email : null
  };
}

module.exports = { supplierContactFields };
