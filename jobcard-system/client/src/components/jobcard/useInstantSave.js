import { useRef, useState, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { warningToastIcon } from '../common/toastIcons';
import { JOB_FIELD_LABEL } from './closeReasons';

// What the shared status line beside a group of instant-save fields shows. There is
// deliberately no 'idle' entry — the line only appears once something in the group
// has actually happened; before that, summarizeFieldStates below returns 'idle' and
// the caller renders nothing.
export const INSTANT_SAVE_STATUS_TEXT = {
  saving: 'Saving…',
  saved: 'Saved',
  failed: 'Not saved'
};

// Rolls several fields' individual save states into the one line a group's aria-live
// region reports (one per area — identity strip, details tab — not one per field,
// which would be unusable read aloud). A field still mid-save wins over everything
// else; failing that, any failure; only once every watched field has actually landed
// does the group read as saved. A field never touched this session has no entry at
// all, which reads as 'idle' here.
export function summarizeFieldStates(fieldStates, names) {
  const values = names.map(n => fieldStates[n]).filter(Boolean);
  if (values.length === 0) return 'idle';
  if (values.includes('saving')) return 'saving';
  if (values.includes('failed')) return 'failed';
  if (values.every(v => v === 'saved')) return 'saved';
  return 'idle';
}

/**
 * Instant save for the job card's single-value fields — priority, due date,
 * description, the customer's PO/quote/previous-job references, quality level and
 * repeat job. Routes every write through the shared save queue (useSaveQueue.js,
 * Contract A) under key `field:<name>` — same key runs in order, different fields
 * never block each other, and the queue itself owns the "reply for a job the user
 * has left" guard and the failure toast.
 *
 * jobCardId is null on a brand-new job. Every call site only reaches saveField once
 * `isEdit && jobCardId` is true — everything stays local-only before that.
 */
export function useInstantSave(jobCardId, saveQueue, { onSaved } = {}) {
  const jobCardIdRef = useRef(jobCardId);
  jobCardIdRef.current = jobCardId;

  // Names confirmed saved at least once this session. The queue only remembers a
  // write while it's queued, in flight or failed — a settled success is removed
  // outright (Contract A) — so the "Saved" a field keeps showing afterwards has to
  // live here instead, separate from the live queued/inFlight/failed state below.
  const [savedNames, setSavedNames] = useState({});

  // options.alsoMarkSaved: extra {field: value} pairs whose baseline should move
  // forward alongside this write on success, WITHOUT being sent over the wire.
  // Used for Quality Level: picking a level changes both qaLevelId (sent) and the
  // display label qualityLevel (derived — the server works out its own copy from
  // qaLevelId the same way, see jobcard-mutations.js). Both changed as one user
  // action, so both baselines move together once the write covering them lands.
  //
  // options.baseline: what the job last confirmed storing for this field. When
  // the value handed in is back to exactly that, there is nothing to send — but
  // a caller still calls this (rather than skipping the call itself) so a stale
  // "failed" mark from an earlier attempt at a DIFFERENT value doesn't survive
  // the user reacting to it by putting the box back the way it was (defect C,
  // root-causes.md). Never re-sends anything — only drops that mark.
  const saveField = useCallback((name, value, options = {}) => {
    const forJobCardId = jobCardIdRef.current;
    if (!forJobCardId) return; // new job — nothing to write to yet

    const { alsoMarkSaved, baseline } = options;
    // Skipping here when a write for this same field is still queued or in
    // flight would let that earlier write land last: change a field, change it
    // straight back, and the "back to what's stored" shortcut used to see
    // nothing left to send — but the first change was still travelling, so it
    // landed after this one was dropped and the server kept the wrong value.
    // Falling through instead queues the revert, so whichever value the user
    // left it on is always the one that lands last.
    if (baseline !== undefined && value === baseline && !saveQueue.isPending(`field:${name}`)) {
      saveQueue.clearFailure(`field:${name}`);
      return;
    }
    saveQueue.enqueue(`field:${name}`, (isCurrent) => api.updateJobcard(forJobCardId, { [name]: value })
      .then((result) => {
        // A reply for a job the user has since left — or for an earlier opening of
        // this same job — must not mark a field as saved on the screen now showing.
        if (!isCurrent()) return;
        setSavedNames(prev => ({ ...prev, [name]: true }));
        onSaved?.(name, value);
        if (alsoMarkSaved) {
          for (const [extraName, extraValue] of Object.entries(alsoMarkSaved)) {
            onSaved?.(extraName, extraValue);
          }
        }
        // Changing the quality level makes the server copy that level's QA
        // templates onto the job, which can come back with a warning (e.g. a
        // template missing on disk) — the same one useJobCardSave.js surfaces
        // from the old whole-job Save, so it isn't dropped just because this
        // write is narrower.
        if (result?.qaTemplateWarning) {
          toast(result.qaTemplateWarning, { icon: warningToastIcon, duration: 8000 });
        }
      }), { label: JOB_FIELD_LABEL[name] || `the ${name}` });
  }, [saveQueue, onSaved]);

  // Live queued/inFlight/failed state layered over the "ever saved" record — a
  // field currently in the queue always wins (it's the authoritative, recorded
  // fact), otherwise a name that has landed at least once reads 'saved'.
  const fieldStates = useMemo(() => {
    const out = {};
    for (const name of Object.keys(savedNames)) out[name] = 'saved';
    for (const { key, state } of saveQueue.pending()) {
      if (!key.startsWith('field:')) continue;
      out[key.slice('field:'.length)] = state === 'failed' ? 'failed' : 'saving';
    }
    return out;
  }, [savedNames, saveQueue]);

  // JobCardModal returns null when closed rather than unmounting, so this hook's
  // state outlives a close. Without clearing it, opening the next job would greet
  // it with the previous job's "Saved" — the line would be reporting a write that
  // never happened on the job being looked at.
  const resetFieldStates = useCallback(() => setSavedNames({}), []);

  return { saveField, fieldStates, resetFieldStates };
}
