import { useRef, useState, useCallback } from 'react';
import toast from 'react-hot-toast';

/**
 * One saving record per open job card — Contract A of
 * tasks/instant-save-root-causes.md. Every instant write (a job-level field, a
 * part's own box, a still-local part becoming real, a worker ticked/unticked)
 * enqueues here instead of keeping its own hand-rolled promise-chain registry.
 * There used to be three near-identical copies of this machinery (useInstantSave,
 * useInstantItems, useJobCardForm's assignee toggling), each with its own
 * stale-job guard and its own idea of what "saving" meant — this replaces all
 * three with one recorded fact per key.
 *
 * A key's entry is one of:
 *   - absent            -> stateOf returns 'idle': nothing outstanding.
 *   - { state: 'queued' }   -> asked for, but a write for the SAME key is still
 *                              running ahead of it.
 *   - { state: 'inFlight' } -> this write's turn has actually begun.
 *   - { state: 'failed' }   -> it ran and was refused/errored; stays exactly like
 *                              this, unretried, until the caller enqueues that key
 *                              again (which is what "the user edits it again"
 *                              means everywhere else in this app) — or calls
 *                              clearFailure(key), for the caller that decided
 *                              there is nothing left TO send (the box is back to
 *                              what's already stored).
 *
 * 'queued' and 'inFlight' being different states is the whole point of this file
 * (defect 8): a field written twice in quick succession used to mark itself
 * 'saving' the instant the SECOND write was asked for, even though the first one
 * was still the one actually in flight. If the first write then failed, its
 * failure handler ran last and stamped the field 'failed' for the entire time the
 * second write was genuinely running. Here, a key is only ever 'inFlight' at the
 * moment its own turn starts — which is also the moment any stale 'failed' from
 * the write ahead of it gets overwritten, correctly, back to 'inFlight'.
 */
export function useSaveQueue(jobCardId) {
  const jobCardIdRef = useRef(jobCardId);
  jobCardIdRef.current = jobCardId;

  // Which opening of the job window this record belongs to. Bumped by reset, captured by
  // every write, and checked alongside the job id when the reply comes back — the id on
  // its own cannot tell a reply meant for the previous opening from one meant for this
  // one when the SAME job is closed and immediately reopened. That reply used to be
  // counted as a landing against the fresh opening, which answered an untouched job with
  // the green frame and "all changes saved".
  const openingRef = useRef(0);

  // key -> { label, state }. A settled-successful key is deleted outright — only
  // something still queued, in flight, or failed has anything to show.
  const [entries, setEntries] = useState({});

  // How many writes for this job the server has actually confirmed. The map above can
  // only ever describe what is still outstanding, because a settled success is deleted
  // from it — so "nothing outstanding" cannot, on its own, tell a write that landed
  // from a write that was never sent at all (a box typed back to what was already
  // stored, a still-local row deleted before it became real, or a card nobody has
  // touched). This counter is the positive fact, and the only honest basis for saying
  // "that saved". Cleared with the rest of the queue on open, so it always counts this
  // job's landings and no one else's.
  const [landedCount, setLandedCount] = useState(0);

  // One promise-chain tail per key, so same-key writes always run in the order
  // they were asked for while different keys never wait on each other — the
  // exact shape every hand-rolled version of this used to build for itself.
  const chains = useRef({});

  const setEntry = useCallback((key, patch) => {
    setEntries(prev => {
      if (patch === null) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: { ...prev[key], ...patch } };
    });
  }, []);

  const enqueue = useCallback((key, run, options = {}) => {
    const label = options.label || key;
    const forJobCardId = jobCardIdRef.current;
    const forOpening = openingRef.current;
    const prior = chains.current[key];

    // Recorded the instant it's asked for, even if it turns out to run right
    // away — queued when something for this same key is still ahead of it,
    // otherwise its turn starts immediately.
    setEntry(key, { label, state: prior ? 'queued' : 'inFlight' });

    const task = () => {
      // Either this is the first write for the key, or the one ahead of it has
      // just settled (successfully or not) and it's this one's turn now — either
      // way the write actually starts here, which is the only place 'inFlight'
      // is set once a key has been queued behind something else.
      setEntry(key, { label, state: 'inFlight' });
      return run().then(
        (result) => {
          // A reply for a job the user has since left — or for an earlier opening of
          // this same job — must not touch what is on screen now. Every hand-rolled
          // version of this guard is now just this one.
          if (jobCardIdRef.current === forJobCardId && openingRef.current === forOpening) {
            setEntry(key, null);
            setLandedCount(n => n + 1);
          }
          return result;
        },
        (err) => {
          if (jobCardIdRef.current === forJobCardId && openingRef.current === forOpening) {
            setEntry(key, { label, state: 'failed' });
            // Never re-sent automatically — house rule. This only flags the key
            // and waits on the caller to enqueue it again (typically the user
            // editing it again). A stable id per key means a repeat failure
            // replaces the toast instead of stacking a new one on top of it.
            toast.error(err?.message || `Couldn't save ${label}`, { id: `save-queue-${key}` });
          }
          throw err;
        }
      );
    };

    const chained = prior ? prior.then(task, task) : task();
    // Swallowed separately from `chained` below: nothing outside this hook reads
    // enqueue's own return value for its resolution (every caller does its own
    // work inside `run`'s .then), so this exists only to keep the promise chain
    // itself from ever surfacing as an unhandled rejection.
    const tracked = chained.catch(() => {}).finally(() => {
      if (chains.current[key] === tracked) delete chains.current[key];
    });
    chains.current[key] = tracked;
    return tracked;
  }, [setEntry]);

  // Drops a key's own 'failed' record without sending anything — for a caller
  // that skips a write because the value already matches what's stored (an
  // unchanged box on blur never had anything to send in the first place). Without
  // this, a failed write's mark used to only clear when that key was enqueued
  // again, so a user who reacted to a failure by putting the box back the way it
  // was — sending nothing, since nothing had changed — was stuck reading "Not
  // saved" for the rest of the session even though nothing is actually at risk
  // any more (defect C, root-causes.md). Only ever touches a 'failed' entry: a
  // key that's genuinely queued or in flight is a write actually in progress and
  // must never be cleared out from under it.
  const clearFailure = useCallback((key) => {
    setEntries(prev => {
      if (prev[key]?.state !== 'failed') return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const stateOf = useCallback((key) => entries[key]?.state || 'idle', [entries]);

  // Prefix match, so a caller can ask about a whole item ('item:item:abc') or a
  // whole worker ('assignee:u7') without knowing every field key underneath.
  // Only 'queued'/'inFlight' count as pending — a settled failure isn't still
  // travelling, so it must not block a guard like creditAssignee/dropAssignee
  // that exists specifically to stand aside from something still in the air.
  const isPending = useCallback((keyOrPrefix) => {
    return Object.entries(entries).some(([k, v]) =>
      (k === keyOrPrefix || k.startsWith(keyOrPrefix)) && v.state !== 'failed');
  }, [entries]);

  // Every outstanding key, in whatever state — queued, in flight or failed —
  // for the close question to turn into its two lists (closeReasons.js). This is
  // the "real state instead of inference" Contract A exists to provide.
  const pending = useCallback(() =>
    Object.entries(entries).map(([key, { label, state }]) => ({ key, label, state })),
  [entries]);

  const reset = useCallback(() => {
    setEntries({});
    setLandedCount(0);
    chains.current = {};
    // Anything already in the air belonged to the opening that just ended — see
    // openingRef's declaration above.
    openingRef.current += 1;
  }, []);

  return { enqueue, stateOf, isPending, pending, reset, clearFailure, landedCount };
}
