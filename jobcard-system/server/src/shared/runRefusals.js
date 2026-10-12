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
// The two codes of the "a forgotten clock stops itself and asks its worker" flow:
//   - FINISH_ALREADY_CONFIRMED: the confirm-finish answer arrived for a clock that is
//     no longer waiting for one (answered already, or settled by the office). The
//     screen treats it as the answer having gone through.
//   - FINISH_UNCONFIRMED: a new clock was refused because its worker still owes an
//     answer about their last automatically finished clock.
const FINISH_ALREADY_CONFIRMED = 'FINISH_ALREADY_CONFIRMED';
const FINISH_UNCONFIRMED = 'FINISH_UNCONFIRMED';
// A Stop was pressed on a clock the server had already stopped by itself (a forgotten
// clock): the screen drops its running timer and shows the worker's question instead of
// an error.
const RUN_STOPPED_ITSELF = 'RUN_STOPPED_ITSELF';
// The worker answered "still working" to the question about a clock that stopped itself,
// but a new clock could not be started on that job (it is archived, the part is gone, or
// they already have another clock running), so nothing was saved. The screen offers the
// other answer instead.
const RESTART_REFUSED = 'RESTART_REFUSED';
// A resume was refused because normal hours have already ended: a clock restarted from
// its old start would be cut again at once. The stop form stays for Save.
const RESUME_AFTER_HOURS = 'RESUME_AFTER_HOURS';
// A hand edit that sends a finish says which stored finish its form was opened on, when
// the worker had confirmed it, and whether it was still unconfirmed (each compared only
// if sent). The stored finish is a different time now, the worker has answered since
// (even with the same time), or the unconfirmed mark has gone, so nothing was written. The edit
// form stays open with everything typed and refreshes only its finish box.
const FINISH_CHANGED = 'FINISH_CHANGED';

module.exports = { RUN_NOT_YOURS, RUN_STILL_RUNNING, RUN_ALREADY_FILLED_IN, FINISH_ALREADY_CONFIRMED, FINISH_UNCONFIRMED, RUN_STOPPED_ITSELF, RESTART_REFUSED, RESUME_AFTER_HOURS, FINISH_CHANGED };
