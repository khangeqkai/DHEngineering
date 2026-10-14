// A part's place in its job's list as the screens number it (1, 2, 3 …), not its stored
// item_number — that is only a sort order and keeps gaps after a part is removed. The one
// place that works the number out, so every reply that names a part by number agrees.
const { jobItemQueries } = require('../db/database');

// Map of part id -> position (1-based) for every part on the job.
function partPositions(jobcardId) {
  const positions = new Map();
  (jobItemQueries.getByJobcard.all(jobcardId) || []).forEach((p, i) => positions.set(p.id, i + 1));
  return positions;
}

module.exports = { partPositions };
