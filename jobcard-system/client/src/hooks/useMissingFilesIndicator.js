import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

// Tracks which active job cards declared a drawing / customer property / quality
// forms but have no matching file attached, so the job list can mark those rows
// and name exactly what's missing. Keyed by jobcard id → the warning detail
// ({ items, missingQaForms }), so the row tooltip can spell out the gaps. The set
// only changes when files are uploaded or items are edited, so this is refreshed
// on load and after the modal closes rather than polled continuously.
export function useMissingFilesIndicator() {
  const [flaggedIds, setFlaggedIds] = useState(new Map());

  const refresh = useCallback(async () => {
    try {
      const rows = await api.getAttachmentWarnings();
      setFlaggedIds(new Map((rows || []).map(r => [r.jobcardId, r])));
    } catch {
      setFlaggedIds(new Map());
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { flaggedIds, refresh };
}
