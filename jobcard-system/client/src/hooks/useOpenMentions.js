import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';

// The signed-in person's unanswered @mentions, one row per job, oldest first.
// Read at sign-in, whenever the session poll reports a new signature, on refresh() (after a
// job opened from a row has closed) and after dropJob() (a reply was posted on a job, from
// any job window), which removes that job's row at once and reads again only when there is
// something to settle — a row was showing for that job, or a read is already on its way (it
// may carry a question for that job that the reply has just answered). Otherwise the poll's
// signature covers it: a question asked since the last read, then answered by this reply,
// changes the signature and so brings its own read. Only the newest read is ever applied, so
// an older read still on its way (possibly made before the reply was saved) is thrown away; a
// reply for a person who has since signed out is dropped.
// A failed read keeps the list as it was and calls onReadFailed, which forgets the poll's
// signature, so the next successful poll reads again — the retry rides the poll, never a
// loop of its own. refresh() returns a promise that always resolves, and only once the list
// is as up to date as it will get: a read that was overtaken by a newer one waits for the
// newest read to settle first, so a caller holding the rows back never lets go while a
// fresher list is still on its way.
export function useOpenMentions(userId, signature, onReadFailed) {
  const [mentions, setMentions] = useState([]);
  // The rows as last set, for dropJob to tell at once whether that job had one.
  const mentionsRef = useRef(mentions);
  mentionsRef.current = mentions;
  // How many reads are on their way right now.
  const readsInFlightRef = useRef(0);
  const requestIdRef = useRef(0);
  // The newest read's promise, for an overtaken read to wait on (cleared at sign-out).
  const latestReadRef = useRef(null);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const onReadFailedRef = useRef(onReadFailed);
  onReadFailedRef.current = onReadFailed;

  const refresh = useCallback(() => {
    const id = ++requestIdRef.current;
    const askedFor = userIdRef.current;
    if (!askedFor) return Promise.resolve();
    const run = (async () => {
      let result = null;
      let failed = false;
      readsInFlightRef.current++;
      try {
        result = await api.getOpenMentions();
      } catch {
        failed = true;
      } finally {
        readsInFlightRef.current--;
      }
      if (askedFor !== userIdRef.current) return;
      if (id === requestIdRef.current) {
        if (failed) onReadFailedRef.current?.();
        else {
          setMentions(Array.isArray(result) ? result : []);
        }
        return;
      }
      // Overtaken: settled only when the newest read has settled (it never rejects).
      const newer = latestReadRef.current;
      if (newer && newer !== run) await newer;
    })();
    latestReadRef.current = run;
    return run;
  }, []);

  // A reply was posted on a job: the server answers every open mention of the writer on
  // that job, so its row (if any) goes at once. The list is read again only when there is
  // something to settle: the row was showing (the rest of the list may have moved too), or
  // an older read is still on its way (made before the reply was saved, it may carry a
  // question for this job) — the new read overtakes it, so it is thrown away rather than
  // bringing the answered row back. With neither, the list already matches the server apart
  // from what the poll's signature will report, so an ordinary comment costs no read.
  const dropJob = useCallback((jobcardId) => {
    const hadRow = mentionsRef.current.some(row => row.jobcardId === jobcardId);
    if (hadRow) setMentions(rows => rows.filter(row => row.jobcardId !== jobcardId));
    if (hadRow || readsInFlightRef.current > 0) refresh();
  }, [refresh]);

  // The user the last read was made for: a signature forgotten after a failed read (null,
  // same person) is not itself a reason to read — the next poll's signature is.
  const readForUserRef = useRef(null);
  useEffect(() => {
    if (!userId) {
      requestIdRef.current++;
      latestReadRef.current = null;
      readForUserRef.current = null;
      setMentions([]);
      return;
    }
    if (signature === null && readForUserRef.current === userId) return;
    readForUserRef.current = userId;
    // The server's marker for "none open" is '0': nothing to read, the list is empty.
    if (signature === '0') {
      requestIdRef.current++;
      setMentions([]);
      return;
    }
    refresh();
  }, [userId, signature, refresh]);

  return { mentions, refresh, dropJob };
}
