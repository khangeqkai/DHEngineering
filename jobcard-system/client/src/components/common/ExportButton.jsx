import { useState, useRef, useEffect, useCallback } from 'react';
import { Download, ChevronDown, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import './ExportButton.css';

export default function ExportButton({ onExportView, onExportAll, viewLabel = 'Export Current View', allLabel = 'Export All' }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleExport = useCallback(async (exportFn) => {
    setOpen(false);
    setLoading(true);
    try {
      const result = await exportFn();
      if (result === false) {
        toast.error('No data to export');
      } else if (result !== 'canceled') {
        toast.success('Export complete');
      }
    } catch (err) {
      toast.error(`Export failed: ${err?.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="export-btn-wrapper" ref={ref}>
      <button
        className="btn btn-secondary"
        onClick={() => setOpen(prev => !prev)}
        disabled={loading}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {loading ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
        {loading ? 'Exporting...' : 'Export'}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="export-dropdown" role="menu">
          {onExportView && (
            <button className="export-dropdown-item" role="menuitem" onClick={() => handleExport(onExportView)}>
              {viewLabel}
            </button>
          )}
          {onExportAll && (
            <button className="export-dropdown-item" role="menuitem" onClick={() => handleExport(onExportAll)}>
              {allLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
