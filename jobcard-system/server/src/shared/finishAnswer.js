// A workshop PC's clock can run ahead of the server's, so an answer up to this far past the
// server's now still counts as "not in the future" (the hand-entered time form allows the
// same 15 minutes, but that figure lives in middleware/validation.js, not in shared/).
const FUTURE_LEEWAY_MS = 15 * 60 * 1000;

// Why a worker's answer about when they finished can't stand, or null when it can.
// All four are epoch ms; ceilingMs is null when there is no ceiling.
function checkFinishAnswer({ finishMs, startMs, nowMs, ceilingMs }) {
  if (!Number.isFinite(finishMs)) return 'Enter the time you finished.';
  if (finishMs <= startMs) return 'That is not after the time your clock started.';
  if (finishMs > nowMs + FUTURE_LEEWAY_MS) return 'That time has not happened yet.';
  if (ceilingMs !== null && finishMs > ceilingMs) return 'That is later than it could have been — check the day and time.';
  return null;
}

module.exports = { checkFinishAnswer };
