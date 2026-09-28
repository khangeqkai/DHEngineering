// The `code` on the time-entry edit route's refusals that no retry can get past,
// read by both sides (see CLAUDE.md "Shared rule files"). The stop-timer form keys
// on them to close itself instead of offering Save and Resume buttons that can
// never work again — every other refusal leaves it open for another try.
//   - RUN_NOT_YOURS: the run now belongs to someone else (a manager re-credited it
//     while the form was open), and a worker may only write their own runs.
//   - RUN_STILL_RUNNING: the run has no finish time — it was resumed already (from
//     another screen, or by a resume whose reply never arrived).
//   - RUN_ALREADY_FILLED_IN: a worker's save on a run that is no longer waiting for
//     its stop form (already saved, e.g. a Save retried after a lost reply); only
//     management corrects a run after that. The form treats this one as its save
//     having gone through — it closes and starts any queued Stop & Start timer.
const RUN_NOT_YOURS = 'RUN_NOT_YOURS';
const RUN_STILL_RUNNING = 'RUN_STILL_RUNNING';
const RUN_ALREADY_FILLED_IN = 'RUN_ALREADY_FILLED_IN';

module.exports = { RUN_NOT_YOURS, RUN_STILL_RUNNING, RUN_ALREADY_FILLED_IN };
