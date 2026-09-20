import { useState, useRef, useEffect, useCallback } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import Spinner from './Spinner';
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
    // A loading toast shows for the length of the export, not just after it finishes,
    // and is then resolved into whichever outcome actually happened.
    const toastId = toast.loading('Exporting…');
    try {
      const result = await exportFn();
      if (result === false) {
        toast.error('No data to export', { id: toastId });
      } else if (result === 'canceled') {
        toast.dismiss(toastId);
      } else {
        toast.success('Export complete', { id: toastId });
      }
    } catch (err) {
      toast.error(err?.message || 'Something went wrong exporting this file', { id: toastId });
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
        {loading ? <Spinner size={16} /> : <Download size={16} />}
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
