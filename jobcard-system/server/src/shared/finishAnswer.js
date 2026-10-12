// A workshop PC's clock can run ahead of the server's, so a time up to this far past the
// server's now still counts as "not in the future". This is the one copy of that allowance:
// the worker's finish answer (below) and the hand-entered time form's start and finish checks
// (middleware/validation.js) both read it from here.
const FUTURE_LEEWAY_MS = 15 * 60 * 1000;

// A "still working" answer joins the old run to the new clock only when the finish given is
// this close to now; an older finish is a run of its own and keeps its stop form and sign-off.
const CARRIED_ON_GAP_MS = 30 * 60 * 1000;

// Why a worker's answer about when they finished can't stand, or null when it can.
// All four are epoch ms; ceilingMs is null when there is no ceiling.
function checkFinishAnswer({ finishMs, startMs, nowMs, ceilingMs }) {
  if (!Number.isFinite(finishMs)) return 'Enter the time you finished.';
  if (finishMs <= startMs) return 'That is not after the time your clock started.';
  if (finishMs > nowMs + FUTURE_LEEWAY_MS) return 'That time has not happened yet.';
  if (ceilingMs !== null && finishMs > ceilingMs) return 'That is later than it could have been — check the day and time.';
  return null;
}

module.exports = { checkFinishAnswer, FUTURE_LEEWAY_MS, CARRIED_ON_GAP_MS };
