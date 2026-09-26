import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { mergeColumnOrder } from '../components/JobCardList.constants';

export default function useJobCardColumnOrder() {
  const { user, updatePreferences } = useAuth();
  const [columnOrder, setColumnOrder] = useState(() => mergeColumnOrder(user?.jobcardColumnOrder));
  const [draggedCol, setDraggedCol] = useState(null);

  useEffect(() => {
    if (user?.jobcardColumnOrder) {
      setColumnOrder(mergeColumnOrder(user.jobcardColumnOrder));
    }
  }, [user?.jobcardColumnOrder]);

  const handleDragStart = (e, colId) => {
    setDraggedCol(colId);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
      if (e.target) e.target.style.opacity = '0.5';
    }, 0);
  };

  const handleDragEnd = (e) => {
    if (e.target) e.target.style.opacity = '1';
    setDraggedCol(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetColId) => {
    e.preventDefault();
    if (!draggedCol || draggedCol === targetColId) return;

    const draggedIdx = columnOrder.indexOf(draggedCol);
    const targetIdx = columnOrder.indexOf(targetColId);
    if (draggedIdx === -1 || targetIdx === -1) return;

    const newOrder = columnOrder.filter(c => c !== draggedCol);
    const insertAt = draggedIdx < targetIdx
      ? newOrder.indexOf(targetColId) + 1
      : newOrder.indexOf(targetColId);
    newOrder.splice(insertAt, 0, draggedCol);

    setColumnOrder(newOrder);
    updatePreferences({ jobcardColumnOrder: newOrder }).catch(() => {
      toast.error('Failed to save column order preference', { id: 'column-order-failed' });
    });
  };

  // Keyboard/touch equivalent of the drag handlers above: swap a column with
  // its immediate neighbour in the given direction. Drag-and-drop never fires
  // on a touch screen and isn't reachable from the keyboard at all, so this
  // is the only way those users can reorder columns — same persistence call
  // and the same failure handling as handleDrop.
  // `isVisible(colId)` (optional) tells this which columns are actually shown
  // in the table right now — not permitted for this role, or hidden via the
  // Columns menu. Without it, swapping with one of those looks like nothing
  // happened, since the column traded places with isn't on screen either way.
  // It walks past any such column to the next one that is, and trades places
  // with that one instead of the immediate neighbour.
  const moveColumn = (colId, direction, isVisible) => {
    const idx = columnOrder.indexOf(colId);
    if (idx === -1) return;
    let targetIdx = idx + (direction === 'earlier' ? -1 : 1);
    while (
      targetIdx >= 0 &&
      targetIdx < columnOrder.length &&
      isVisible &&
      !isVisible(columnOrder[targetIdx])
    ) {
      targetIdx += direction === 'earlier' ? -1 : 1;
    }
    if (targetIdx < 0 || targetIdx >= columnOrder.length) return;

    const newOrder = [...columnOrder];
    [newOrder[idx], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[idx]];

    setColumnOrder(newOrder);
    updatePreferences({ jobcardColumnOrder: newOrder }).catch(() => {
      toast.error('Failed to save column order preference', { id: 'column-order-failed' });
    });
  };

  return { columnOrder, handleDragStart, handleDragEnd, handleDragOver, handleDrop, moveColumn };
}
