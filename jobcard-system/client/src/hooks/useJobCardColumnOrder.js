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
      toast.error('Failed to save column order preference');
    });
  };

  return { columnOrder, handleDragStart, handleDragEnd, handleDragOver, handleDrop };
}
