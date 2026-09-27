// The "look it up or bail with 404" step every route handler used to type out by
// hand: fetch a row, and if it isn't there, send the 404 this route has always
// sent. This is a PLAIN function, called at the exact spot the open-coded lookup
// sat before — never router.param, which would run before a route's own
// authenticate/requireManagement/requirePermission middleware and would leak
// whether a record exists to a caller who was never allowed to ask.
//
// The caller still does its own fetch (`someQuery.get(id)`, a `.find()`, or a
// compound match) exactly as before; this only owns the "row missing" branch, so
// every site keeps its own status code and message text untouched.
function findOr404(res, row, message) {
  if (!row) {
    res.status(404).json({ error: message });
    return null;
  }
  return row;
}

module.exports = { findOr404 };
