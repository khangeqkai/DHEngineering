import { useState, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { isActiveRecord } from '../../../../server/src/shared/records';
import { displayNameOf } from './mentionNames';

// The last lists any window loaded. A window mounts fresh each time, so without this its
// pickers would start empty and stay empty until the reply lands; it starts from these
// instead. prefetchJobCardReferenceData() fills them when the job list or the search page
// appears and nothing has been loaded since sign-in, so even the first window after
// launch opens full. After that, each window's own mount refresh keeps them current.
//
// The lists belong to whoever is signed in (a manager's supplier rows carry phone and
// email that a worker's do not), and signing out does not reload the page. So
// clearJobCardReferenceData() empties them at every sign-out, and a reply still in flight
// from the old session is made unable to land. It is registered below with the api's
// sign-out subscription, so every path that drops the pass clears them, with no caller
// having to remember (the page does not reload on sign-out, so the next person would
// otherwise start from the previous person's lists).
const cache = { suppliers: [], employees: [], machines: [] };
// One counter for every load of any list: only the newest reply for a list may land, so
// a slow full load can never overwrite suppliers with an older reply than a later
// reloadSuppliers (which would wipe a just-created supplier), and the reverse.
let seq = 0;
const newestSeq = { suppliers: 0, employees: 0, machines: 0 };
const listeners = new Set();

// The full load currently on the wire, shared by everyone who asks while it runs, so the
// list page and a job window opened a moment later send three requests, not six.
let inFlight = null;
// When a full load last succeeded (ms since epoch); 0 = never, or forgotten at sign-out.
let loadedAt = 0;
// True once a full load has succeeded since sign-in; the prefetch uses it to load only
// the very first time. Cleared at sign-out.
let everLoaded = false;
// Bumped by clear and by a write to the lists: a full load started under an older value
// does not count as fresh.
let generation = 0;
// Bumped by clear only (every sign-out): a reply that started under an older value belongs
// to a session that has ended.
let session = 0;
// A window opening within this long of a successful full load reuses the lists instead of
// asking again. Long enough to cover going list -> job -> back -> another job; short enough
// that a supplier or worker added on another PC shows up on the next open after a short
// wait. Any write in this app other than one to a job clears the freshness at once
// (onDataWritten).
// This is a freshness check made when a window opens, not a timer: nothing runs on a clock.
const FRESH_MS = 30 * 1000;

function publish() {
  listeners.forEach(fn => fn({ ...cache }));
}

/**
 * Forgets everything on sign-out: empties the lists, drops any shared load in flight,
 * and makes every reply already on the wire unable to land (their sequence numbers fall
 * at or below the markers set here), then tells open pickers they are empty.
 */
function clearJobCardReferenceData() {
  generation += 1;
  session += 1;
  inFlight = null;
  loadedAt = 0;
  everLoaded = false;
  newestSeq.suppliers = seq;
  newestSeq.employees = seq;
  newestSeq.machines = seq;
  cache.suppliers = [];
  cache.employees = [];
  cache.machines = [];
  publish();
}

// Fires synchronously from setToken(null), before the caller's setUser(null) re-renders.
// The lists were fetched under the previous person's role (supplier phone and email are
// stripped for non-management), so they must be forgotten before the next sign-in.
api.onSignedOut(clearJobCardReferenceData);

// A write made anywhere in this app marks the lists out of date, however recently they
// were loaded (a supplier, worker or machine change, a tag rename, an account edit, ...):
// the next window to open loads them again instead of reusing them. The one exception is
// a write to a job itself (a field, a part, a timer, a comment read mark, ...): those
// only ever read suppliers, workers and machines, never change them, and counting them
// meant the lists were fetched again on almost every open. Every other write still counts,
// so there is no list of list-changing paths to keep in step. A load already on the wire
// may predate the write, so it is not shared with the next window and does not count as
// fresh; a newer load's reply always wins over it (see seq).
api.onDataWritten((endpoint) => {
  if (endpoint.startsWith('/jobcards')) return;
  generation += 1;
  inFlight = null;
  loadedAt = 0;
});

const activeSorted = (users) => (users || [])
  .filter(isActiveRecord)
  .sort((a, b) => displayNameOf(a).localeCompare(displayNameOf(b)));

function fetchAll() {
  if (inFlight) return inFlight;
  const myGeneration = generation;
  const run = (async () => {
    const mine = ++seq;
    const [suppliersRes, usersRes, machinesRes] = await Promise.all([
      // Include archived suppliers: the pickers filter to active themselves, but a job
      // that already chose a since-archived supplier needs it here to show it "(retired)".
      api.getSuppliers(true),
      api.getEmployees(),
      // Include archived machines too, for the same reason — the time-entry
      // Machines picker (TimeEntryForm.jsx) filters to active itself, but a
      // block already ticked against a since-archived machine needs it here
      // to show it "(retired)" instead of silently hiding it.
      api.getMachines(true)
    ]);
    if (mine > newestSeq.suppliers) {
      newestSeq.suppliers = mine;
      cache.suppliers = suppliersRes || [];
    }
    if (mine > newestSeq.employees) {
      newestSeq.employees = mine;
      cache.employees = activeSorted(usersRes);
    }
    if (mine > newestSeq.machines) {
      newestSeq.machines = mine;
      cache.machines = machinesRes || [];
    }
    // Only a load from this generation counts: one still on the wire from before a
    // sign-out must not tell the next person's prefetch the lists are already there.
    if (myGeneration === generation) {
      loadedAt = Date.now();
      everLoaded = true;
    }
    publish();
  })();
  inFlight = run;
  const done = () => { if (inFlight === run) inFlight = null; };
  run.then(done, done);
  return run;
}

// A window's mount refresh: join a load already running, skip the network when the lists
// were loaded recently, otherwise load. A failed earlier load never set loadedAt, so it
// never counts as fresh.
function refreshIfStale() {
  if (inFlight) return inFlight;
  if (loadedAt && Date.now() - loadedAt < FRESH_MS) return Promise.resolve();
  return fetchAll();
}

/**
 * Fills the cache ahead of any window, so the first one after launch or sign-in opens
 * with its pickers already full. It loads only when nothing has been loaded since
 * sign-in, or joins a load already running; otherwise it does nothing, so the list page
 * and search page can call it on every appearance without reloading three full lists
 * each time nobody opens a job. Freshness for an opening window is that window's own
 * mount refresh. Failures are silent here: nobody has opened anything, and the
 * window's own load says so if it fails too.
 */
export function prefetchJobCardReferenceData() {
  if (inFlight) return inFlight.catch(() => {});
  if (everLoaded) return Promise.resolve();
  return fetchAll().catch(() => {});
}

/**
 * The lists every picker on this screen draws from — suppliers, workers, machines.
 * Each window starts from the last-loaded lists (module cache above) and refreshes them
 * when it mounts (unless they were loaded within the last half minute and nothing in this
 * app has changed them since), so it also picks up a supplier added or archived, a new
 * worker, a retired machine; its own failure toast says so if that refresh fails, and
 * opening the job again is what retries. Pulled out of JobCardModal.jsx purely to keep
 * that file from growing further, the same reason useJobCardTimerActions.js and
 * useJobCardCloseGuard.js exist.
 */
export function useJobCardReferenceData({ isWindowUp }) {
  const [lists, setLists] = useState(() => ({ ...cache }));

  useEffect(() => {
    listeners.add(setLists);
    // A load may have published between this window's first render and now, when it was not yet listening.
    setLists({ ...cache });
    return () => { listeners.delete(setLists); };
  }, []);

  const loadReferenceData = useCallback(async () => {
    try {
      await refreshIfStale();
    } catch {
      // Every picker on this screen — suppliers, workers, machines — may be stale or
      // empty until this lands, which on its own just looks like an app with nothing
      // in it. Say what is missing, and say what gets it back. Nothing is said once
      // the window has closed: the message tells the person to close this card.
      if (!isWindowUp()) return;
      toast.error(
        'Could not load the suppliers, workers and machines. Close this job card and open it again to retry.',
        { id: 'jobcard-reference-load-failed' }
      );
    }
  }, [isWindowUp]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  // Re-fetch suppliers after one is created or linked to a treatment on a line item,
  // so the new name and its updated services show up in the pickers right away.
  const reloadSuppliers = useCallback(async () => {
    const mine = ++seq;
    try {
      const res = await api.getSuppliers(true);
      if (mine <= newestSeq.suppliers) return;
      newestSeq.suppliers = mine;
      cache.suppliers = res || [];
      publish();
    } catch {
      // Non-fatal: the picker keeps its current list until the next load.
    }
  }, []);

  // Re-fetch the workers (the @ mention check asks for this before telling someone a name
  // matches nobody). Touches only the workers list, and resolves to the shared list as it
  // stands once this reply is settled, so the caller checks names against exactly what the
  // pickers show: this reply when it landed, or the newer reply that overtook it. Null when
  // the fetch failed (the cache is untouched) or the session ended meanwhile.
  const reloadEmployees = useCallback(async () => {
    const mine = ++seq;
    const mySession = session;
    try {
      const fresh = activeSorted(await api.getEmployees());
      if (mySession !== session) return null;
      if (mine > newestSeq.employees) {
        newestSeq.employees = mine;
        cache.employees = fresh;
        publish();
      }
      return cache.employees;
    } catch {
      return null;
    }
  }, []);

  return { suppliers: lists.suppliers, employees: lists.employees, machines: lists.machines, reloadSuppliers, reloadEmployees };
}
