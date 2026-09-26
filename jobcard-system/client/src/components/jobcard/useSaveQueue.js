import { useRef, useState, useCallback } from 'react';
import toast from 'react-hot-toast';

// A `run()` a caller resolves with this instead of its usual result to mean
// "nothing was stored by this attempt, so there is nothing to count as
// landed" — a refused create or remove that already told the user with its
// own toast (useInstantItems.js's createItemFromRow/removeItem catches). Without this,
// `run()` resolving at all (rather than rejecting) read as a save, so a
// refused create counted toward `landedCount` and armed the green saved
// flash for work that was never stored. Rejecting instead isn't right either
// — that's 'failed', which flags the key and waits for the user to retry,
// and these callers deliberately do NOT want that (their own comments
// explain why: the row already shows its own reason, or there's nothing left
// to retry).
export const NOT_LANDED = Symbol('notLanded');

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
    // Handed to `run` so a caller's own reply work can apply the same "still this
    // job, still this opening" test the queue applies below — checking the job id
    // alone lets a reply from before a close-and-reopen of the SAME job land on the
    // fresh screen.
    const isCurrent = () => jobCardIdRef.current === forJobCardId && openingRef.current === forOpening;
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
      return run(isCurrent).then(
        (result) => {
          // A reply for a job the user has since left — or for an earlier opening of
          // this same job — must not touch what is on screen now.
          if (isCurrent()) {
            setEntry(key, null);
            // NOT_LANDED means nothing was stored (a refused create/remove that
            // already reported itself) — clear the key so it stops
            // reading as outstanding, but don't count it as a landing: nothing was
            // actually saved, so the green flash must not arm for it.
            if (result !== NOT_LANDED) setLandedCount(n => n + 1);
          }
          return result;
        },
        (err) => {
          if (isCurrent()) {
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

  // Exact match, or a prefix followed by the key separator itself — never a
  // bare prefix. A bare-prefix match let 'assignee:1' collide with
  // 'assignee:12' (a plain startsWith saw "1" at the front of "12" and called
  // it a match), which meant worker #1's own guard could be tripped by worker
  // #12's write. Requiring the separator after the prefix still lets a caller
  // ask about a whole key family ('item:item:abc' catching a sub-key like
  // 'item:item:abc:qty') without that boundary bug. Only 'queued'/'inFlight'
  // count as pending — a settled failure isn't still travelling, so it must
  // not block a guard like creditAssignee/dropAssignee that exists
  // specifically to stand aside from something still in the air.
  const isPending = useCallback((keyOrPrefix) => {
    return Object.entries(entries).some(([k, v]) =>
      (k === keyOrPrefix || k.startsWith(`${keyOrPrefix}:`)) && v.state !== 'failed');
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

  // Resolves once every write queued so far — for every key, whatever its state —
  // has settled, success or failure. Never rejects: a caller waiting on this (e.g.
  // a status change that must not run ahead of a part save already in flight) needs
  // to know the field is quiet either way, not to fail itself because one of those
  // saves failed. A write enqueued AFTER this is called is not waited on — it
  // belongs to the next look at "what's in flight now", not this one.
  const whenSettled = useCallback(() => Promise.allSettled(Object.values(chains.current)), []);

  return { enqueue, stateOf, isPending, pending, reset, clearFailure, landedCount, whenSettled };
}
