import { useState, useCallback, useRef, useEffect } from 'react';

export default function useTableResize(columns) {
  const [columnWidths, setColumnWidths] = useState(() => {
    const widths = {};
    columns.forEach(col => {
      if (col.width) widths[col.key] = col.width;
    });
    return widths;
  });

  const resizing = useRef(null);
  const widthsRef = useRef(columnWidths);
  widthsRef.current = columnWidths;

  const onMouseDown = useCallback((e, columnKey) => {
    e.preventDefault();
    resizing.current = {
      key: columnKey,
      startX: e.clientX,
      startWidth: widthsRef.current[columnKey] || 150
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!resizing.current) return;
      const { key, startX, startWidth } = resizing.current;
      const diff = e.clientX - startX;
      const newWidth = Math.max(60, startWidth + diff);
      setColumnWidths(prev => ({ ...prev, [key]: newWidth }));
    };

    const onMouseUp = () => {
      resizing.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  return { columnWidths, onMouseDown };
}
