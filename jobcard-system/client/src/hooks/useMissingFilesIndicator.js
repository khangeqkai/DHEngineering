import { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '../services/api';

// How long to wait before retrying a row whose check failed (a connection blip),
// so a row never sits on the loading hint forever when the visible set is static.
const RETRY_DELAY_MS = 3000;

// Tracks which job cards declared a drawing / customer property / quality forms
// but have no matching file attached, so the job list can mark those rows.
//
// Checking is done per page, not for every job at once: the list asks to check
// only the rows currently on screen (`ensure`), results are remembered, and a
// page already seen never re-checks. Three states per row:
//   - not in `checkedIds`        → not looked at yet (show a loading hint)
//   - in `checkedIds`, no warning → checked, all files present
//   - in `warningsById`          → checked, has a gap (show the marker)
export function useMissingFilesIndicator() {
  const [warningsById, setWarningsById] = useState(new Map());
  const [checkedIds, setCheckedIds] = useState(new Set());
  // Refs mirror the decision-relevant state so dedup choices don't depend on a
  // re-render landing first: which ids are known, and which are mid-flight.
  const checkedRef = useRef(new Set());
  const inFlightRef = useRef(new Set());
  // Ids asked to re-check while their check was still running. The in-flight
  // result is stale (it predates whatever the re-check is reacting to, e.g. a
  // just-attached file), so we must not let it win — these get re-fetched once
  // the in-flight call returns.
  const dirtyRef = useRef(new Set());
  // Retry timers, cleared on unmount.
  const mountedRef = useRef(true);
  const timersRef = useRef(new Set());

  useEffect(() => {
    mountedRef.current = true;
    const timers = timersRef.current;
    return () => {
      mountedRef.current = false;
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  }, []);

  // Fetch and merge results for a set of ids (assumed already marked in flight).
  const fetchFor = useCallback(async (ids) => {
    try {
      const res = await api.getAttachmentWarnings(ids);
      const checked = res?.checked || ids;
      const flagged = res?.flagged || [];
      const flaggedMap = new Map(flagged.map(f => [f.jobcardId, f]));

      // Skip any id flagged dirty mid-flight — its result is stale and it will
      // be re-fetched below, so stamping it "checked" now would be wrong.
      const apply = checked.filter(id => !dirtyRef.current.has(id));
      for (const id of apply) checkedRef.current.add(id);

      setWarningsById(prev => {
        const next = new Map(prev);
        // Refresh every applied id: set or clear its warning, so a gap that has
        // since been filled disappears rather than lingering.
        for (const id of apply) {
          if (flaggedMap.has(id)) next.set(id, flaggedMap.get(id));
          else next.delete(id);
        }
        return next;
      });
      setCheckedIds(new Set(checkedRef.current));
    } catch {
      // Leave these ids unchecked and schedule one retry, so a momentary blip
      // doesn't strand the row on the loading hint until the page changes.
      if (mountedRef.current) {
        const t = setTimeout(() => {
          timersRef.current.delete(t);
          const retry = ids.filter(id => !checkedRef.current.has(id) && !inFlightRef.current.has(id));
          if (retry.length) {
            for (const id of retry) inFlightRef.current.add(id);
            fetchFor(retry);
          }
        }, RETRY_DELAY_MS);
        timersRef.current.add(t);
      }
    } finally {
      for (const id of ids) inFlightRef.current.delete(id);
      // Honor any re-check requested while these were in flight, with fresh data.
      const redo = ids.filter(id => dirtyRef.current.has(id));
      if (redo.length) {
        for (const id of redo) {
          dirtyRef.current.delete(id);
          checkedRef.current.delete(id);
          inFlightRef.current.add(id);
        }
        setCheckedIds(new Set(checkedRef.current));
        fetchFor(redo);
      }
    }
  }, []);

  // Check any of these ids we haven't already checked (and aren't checking).
  const ensure = useCallback((ids) => {
    const fresh = (ids || []).filter(
      id => id && !checkedRef.current.has(id) && !inFlightRef.current.has(id)
    );
    if (fresh.length === 0) return;
    for (const id of fresh) inFlightRef.current.add(id);
    fetchFor(fresh);
  }, [fetchFor]);

  // Force a re-check of these ids (after a job is edited or a file attached).
  // For an id whose first check is still running, mark it dirty so the stale
  // in-flight result is discarded and a fresh check runs when that call returns;
  // otherwise fetch it now.
  const refresh = useCallback((ids) => {
    const list = (ids || []).filter(Boolean);
    if (list.length === 0) return;
    const now = [];
    for (const id of list) {
      if (inFlightRef.current.has(id)) {
        dirtyRef.current.add(id);
      } else {
        checkedRef.current.delete(id);
        inFlightRef.current.add(id);
        now.push(id);
      }
    }
    setCheckedIds(new Set(checkedRef.current));
    if (now.length) fetchFor(now);
  }, [fetchFor]);

  return { warningsById, checkedIds, ensure, refresh };
}
