// One archive/restore action, shared by every entity that is archived rather than
// deleted (companies, contacts, machines, suppliers, tags, users). Each route still
// owns its own row lookup, refusals and response shape; this only owns the part
// that used to be typed out identically everywhere: 404 when the row is missing, a
// no-op when the row already sits in the target state, otherwise the write plus the
// one archive/unarchive trail entry every route already left.
const logger = require('../utils/logger');
const { recordHistory, actorName } = require('../db/database');

// spec = {
//   entityType,           // history entity type ('company', 'machine', …)
//   load: () => row|null, // prepared-statement lookup
//   notFound,             // 404 message the route uses today
//   isArchived: (row) => boolean,
//   refuse?: (row) => { status, error } | null, // a route's own reason to say no
//   archive: boolean,     // true = archive, false = restore
//   write: (row) => void, // the prepared statement(s) + any side effect (e.g. user session kill)
//   respond: (row) => body, // the success body the route sends today
//   snapshot: (row) => object // required — names the record in the trail entry
// }
function setArchived(req, res, spec) {
  const { entityType, archive } = spec;
  // The trail entry's only change is "status Active → Archived", so without a
  // snapshot the activity log can't say WHICH record was archived. Every caller
  // must name it; a missing one is a coding mistake, refused before anything runs.
  if (typeof spec.snapshot !== 'function') {
    throw new Error(`setArchived(${entityType}): a snapshot naming the record is required`);
  }
  const verb = archive ? 'archive' : 'restore';
  try {
    const row = spec.load();
    if (!row) return res.status(404).json({ error: spec.notFound });

    const refusal = spec.refuse ? spec.refuse(row) : null;
    if (refusal) return res.status(refusal.status).json({ error: refusal.error });

    // Already in the target state: nothing to write, nothing to log.
    const alreadyThere = archive ? spec.isArchived(row) : !spec.isArchived(row);
    if (alreadyThere) {
      return res.json(spec.respond(row));
    }

    spec.write(row);
    const freshRow = spec.load();

    recordHistory(
      entityType,
      row.id,
      archive ? 'archive' : 'unarchive',
      req.user.userId,
      actorName(req),
      { status: archive ? { from: 'Active', to: 'Archived' } : { from: 'Archived', to: 'Active' } },
      spec.snapshot(row)
    );

    res.json(spec.respond(freshRow));
  } catch (err) {
    logger.error({ err }, `Failed to ${verb} ${entityType}`);
    res.status(500).json({ error: `Failed to ${verb} ${entityType}` });
  }
}

module.exports = { setArchived };
