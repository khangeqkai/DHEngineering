import { useRef, useState, useCallback } from 'react';
import { toastJobWriteFailure } from './jobWriteFailure';
import { api } from '../../services/api';
import { isJobClosedError } from '../../utils/jobLock';

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

// How long a save from an earlier window is waited for before a new save of the same
// box goes ahead anyway (see boundedTail).
const OLD_WINDOW_WAIT_MS = 20000;

// One promise-chain tail per job and key, shared by every window: a window is a fresh
// instance each time the job is opened, but a write still travelling from the one just
// closed must stay ahead of the next write for the same box, or the older save could land
// last and overwrite the newer one. `chainOwner` says which window asked for each tail.
const chains = {};
const chainOwner = {};

// The chains belong to whoever is signed in. A save from the previous person's session
// that never answered must not hold the next person's saves (or their "wait for every
// save") on the same job for the bounded wait, so every sign-out forgets them; a reply
// that does still arrive settles on its own, unwatched.
api.onSignedOut(() => {
  for (const ck of Object.keys(chains)) {
    delete chains[ck];
    delete chainOwner[ck];
  }
});

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
 *   - { state: 'queued' }   -> asked for, but a write for the SAME key (or a key
 *                              named in options.after) is still running ahead of it.
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
export function useSaveQueue(jobCardId, { onJobClosed, isWindowUp, jobNumber } = {}) {
  const jobCardIdRef = useRef(jobCardId);
  jobCardIdRef.current = jobCardId;
  // Named in a failure message: a failure can arrive after this window has closed and
  // another job is on screen, so the message has to say which job it was.
  const jobNumberRef = useRef(jobNumber);
  jobNumberRef.current = jobNumber;

  // Identifies this window among the ones that came before it (see chainOwner above).
  const ownerRef = useRef({});

  // key -> { label, state }. A settled-successful key is deleted outright — only
  // something still queued, in flight, or failed has anything to show.
  const [entries, setEntries] = useState({});

  // How many writes for this job the server has actually confirmed. The map above can
  // only ever describe what is still outstanding, because a settled success is deleted
  // from it — so "nothing outstanding" cannot, on its own, tell a write that landed
  // from a write that was never sent at all (a box typed back to what was already
  // stored, a still-local row deleted before it became real, or a card nobody has
  // touched). This counter is the positive fact, and the only honest basis for saying
  // "that saved". It belongs to this window alone, so it counts this opening's landings
  // and no one else's.
  const [landedCount, setLandedCount] = useState(0);

  // Same-key writes always run in the order they were asked for while different keys
  // never wait on each other — the exact shape every hand-rolled version of this used to
  // build for itself. Keyed by job AND key (`${jobCardId}|${key}`): the same job reopened
  // still orders behind its own travelling save, while another job's identical field name
  // never waits on it.
  const chainKey = (jobId, key) => `${jobId}|${key}`;
  // A tail from an EARLIER window is still waited for (so an older save can't land after
  // a newer one), but only up to OLD_WINDOW_WAIT_MS: a save whose answer never comes (a
  // dead connection) must not hold every later save of that box forever after the job is
  // reopened.
  const boundedTail = useCallback((ck) => {
    const tail = chains[ck];
    if (!tail || chainOwner[ck] === ownerRef.current) return tail;
    return Promise.race([tail, new Promise(resolve => setTimeout(resolve, OLD_WINDOW_WAIT_MS))]);
  }, []);

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
    const forJobNumber = jobNumberRef.current;
    const ownKey = chainKey(forJobCardId, key);
    const prior = boundedTail(ownKey);
    // options.after: other keys whose writes already asked for must land (or fail)
    // before this one starts — for two fields one action changes together, so the
    // server applies them in click order — while each key keeps its OWN record, so
    // one field's failure is never hidden, or copied, by the other's write.
    const ahead = [prior, ...(options.after || []).map(k => boundedTail(chainKey(forJobCardId, k)))].filter(Boolean);

    // Recorded the instant it's asked for, even if it turns out to run right
    // away — queued when something it must wait for is still ahead of it,
    // otherwise its turn starts immediately.
    setEntry(key, { label, state: ahead.length ? 'queued' : 'inFlight' });

    const task = () => {
      // Either this is the first write for the key, or the one ahead of it has
      // just settled (successfully or not) and it's this one's turn now — either
      // way the write actually starts here, which is the only place 'inFlight'
      // is set once a key has been queued behind something else.
      setEntry(key, { label, state: 'inFlight' });
      // Handed to `run` as isWindowUp. Two separate questions: may this reply change the
      // window's own screen (marks, rows, reloads, closing)? Only while it is up. Must
      // the person hear that their own write failed or was refused? Always, window or not.
      return run(isWindowUp).then(
        (result) => {
          // Only this window's own record is touched; once it has closed, there is
          // nothing on screen left to update.
          setEntry(key, null);
          // NOT_LANDED means nothing was stored (a refused create/remove that
          // already reported itself) — clear the key so it stops
          // reading as outstanding, but don't count it as a landing: nothing was
          // actually saved, so the green flash must not arm for it.
          if (result !== NOT_LANDED) setLandedCount(n => n + 1);
          return result;
        },
        (err) => {
          // The job was invoiced and archived from another PC while this screen
          // still had it open — the write was already on its way when that
          // happened, so it reaches the server as any other write would and is
          // refused the same way (closedJobGuard). onJobClosed (JobCardModal.jsx)
          // is the one place that shows the shared sentence and reloads the job
          // so the screen catches up and goes read-only, instead of leaving
          // every other box on screen still offering edits that would only fail
          // the same way. It runs even when the window has gone, because the
          // refused write is lost work the person must be told about; it decides
          // for itself whether there is still a window to reload.
          if (isJobClosedError(err)) {
            if (isWindowUp()) setEntry(key, { label, state: 'failed' });
            onJobClosed?.();
          } else {
            // Only the on-screen flag asks the window; the toast does not, because a
            // write that fails after the window closed is still typed work the person
            // would otherwise never learn was lost.
            if (isWindowUp()) setEntry(key, { label, state: 'failed' });
            // Never re-sent automatically — house rule. This only flags the key
            // and waits on the caller to enqueue it again (typically the user
            // editing it again). A stable id per key means a repeat failure
            // replaces the toast instead of stacking a new one on top of it. The job is
            // in both the message and the id: the failure may land after this window has
            // closed and another job's is open, whose own failure for the same box must
            // neither be mistaken for this one nor replace it.
            const message = err?.message || `Couldn't save ${label}`;
            toastJobWriteFailure({ jobNumber: forJobNumber, jobCardId: forJobCardId }, message, `save-queue-${key}`);
          }
          throw err;
        }
      );
    };

    // Every tail in `chains` is already a never-rejecting promise (see `tracked`).
    const chained = ahead.length ? Promise.all(ahead).then(task) : task();
    // Swallowed separately from `chained` below: nothing outside this hook reads
    // enqueue's own return value for its resolution (every caller does its own
    // work inside `run`'s .then), so this exists only to keep the promise chain
    // itself from ever surfacing as an unhandled rejection.
    const tracked = chained.catch(() => {}).finally(() => {
      if (chains[ownKey] === tracked) {
        delete chains[ownKey];
        delete chainOwner[ownKey];
      }
    });
    chains[ownKey] = tracked;
    chainOwner[ownKey] = ownerRef.current;
    return tracked;
  }, [setEntry, boundedTail, isWindowUp]);

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

  // Resolves once every write queued so far — for every key of the current job, whatever its state —
  // has settled, success or failure. Never rejects: a caller waiting on this (e.g.
  // a status change that must not run ahead of a part save already in flight) needs
  // to know the field is quiet either way, not to fail itself because one of those
  // saves failed. A write enqueued AFTER this is called is not waited on — it
  // belongs to the next look at "what's in flight now", not this one.
  // Only the current job's chains: another job's travelling save is none of this job's business.
  const whenSettled = useCallback(() => {
    const mine = `${jobCardIdRef.current}|`;
    return Promise.allSettled(Object.keys(chains)
      .filter(k => k.startsWith(mine)).map(boundedTail));
  }, [boundedTail]);

  // For a write that fails outside the queue's own tracking (a part that is gone, a
  // refused add or remove): told the same way a queued write's failure is, naming this
  // window's job. Each window is one job, so the refs still hold the right one even when
  // this is called from a catch that runs after the window has closed.
  const reportFailure = useCallback((message, idKey) => {
    toastJobWriteFailure({ jobNumber: jobNumberRef.current, jobCardId: jobCardIdRef.current }, message, idKey);
  }, []);

  return { enqueue, reportFailure, stateOf, isPending, pending, clearFailure, landedCount, whenSettled };
}
