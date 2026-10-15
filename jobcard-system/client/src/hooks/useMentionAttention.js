import { useCallback, useEffect, useRef, useState } from 'react';
import { useOpenMentions } from './useOpenMentions';

const NO_JOB = { id: null, noteId: null, open: false };

// Everything the "Needs your attention" window needs about the person's @mentions, apart
// from the clock question: the open-mentions list (useOpenMentions), the job opened from a
// row (a window of the provider's own, at its comment), the re-read of the list after that
// job closes, and whether the mentions are already up on screen
// (that one lives in the provider, as state, since decideAttention reads it during render).
// Signing out clears all of it. The provider decides what is shown (decideAttention) and
// renders the windows.
export function useMentionAttention(userId, signature, forgetSignature) {
  const { mentions, refresh, dropJob } = useOpenMentions(userId, signature, forgetSignature);
  // The job opened from a row. `seq` makes every opening a fresh window.
  const [mentionJob, setMentionJob] = useState({ ...NO_JOB, seq: 0 });
  // True while the mentions are re-read after the job opened from a row has closed.
  const [rereadingMentions, setRereadingMentions] = useState(false);
  const rereadTokenRef = useRef(0);
  // Opens a mention row's job at its comment.
  const openMentionJob = useCallback((row) => {
    setMentionJob(prev => ({ id: row.jobcardId, noteId: row.firstNoteId, open: true, seq: prev.seq + 1 }));
  }, []);

  // The job opened from a row has closed (its saves are done): read what is still owed.
  const closeMentionJob = useCallback(() => {
    setMentionJob(prev => ({ ...prev, open: false }));
    const token = ++rereadTokenRef.current;
    setRereadingMentions(true);
    // The row list is held back until this read settles (it never rejects).
    refresh().finally(() => {
      if (token === rereadTokenRef.current) setRereadingMentions(false);
    });
  }, [refresh]);

  // Drop that job once it has finished closing, so it stops running (polling, timers).
  useEffect(() => {
    if (mentionJob.open || !mentionJob.id) return;
    setMentionJob(prev => (prev.open ? prev : { ...NO_JOB, seq: prev.seq }));
  }, [mentionJob]);

  useEffect(() => {
    if (userId) return;
    rereadTokenRef.current++;
    setRereadingMentions(false);
    setMentionJob(prev => (prev.id ? { ...NO_JOB, seq: prev.seq } : prev));
  }, [userId]);

  return {
    mentions,
    rereadingMentions,
    mentionJob,
    openMentionJob,
    closeMentionJob,
    dropMentionJob: dropJob
  };
}
