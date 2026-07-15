import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { normalizeHiddenColumns } from '../components/JobCardList.constants';

// Owns which job-list columns the current user has hidden. The set is saved to
// their account (alongside column order) so it follows them between machines.
export default function useJobCardColumnVisibility() {
  const { user, updatePreferences } = useAuth();
  const [hiddenColumns, setHiddenColumns] = useState(
    () => normalizeHiddenColumns(user?.jobcardHiddenColumns)
  );

  useEffect(() => {
    setHiddenColumns(normalizeHiddenColumns(user?.jobcardHiddenColumns));
  }, [user?.jobcardHiddenColumns]);

  // Show the change straight away, then save it. If the save can't reach the
  // server, roll the columns back to `previous` so the screen never drifts out
  // of step with what's actually stored on the account.
  const persist = useCallback((next, previous) => {
    setHiddenColumns(next);
    updatePreferences({ jobcardHiddenColumns: next }).catch(() => {
      toast.error('Failed to save column preference');
      setHiddenColumns(previous);
    });
  }, [updatePreferences]);

  const toggleColumn = useCallback((id) => {
    const next = hiddenColumns.includes(id)
      ? hiddenColumns.filter(c => c !== id)
      : [...hiddenColumns, id];
    persist(next, hiddenColumns);
  }, [hiddenColumns, persist]);

  const resetColumns = useCallback(() => {
    persist([], hiddenColumns);
  }, [hiddenColumns, persist]);

  return { hiddenColumns, toggleColumn, resetColumns };
}
