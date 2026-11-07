import { useState, useRef, useEffect, useCallback } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import Spinner from './Spinner';
import './ExportButton.css';

export default function ExportButton({ onExportView, onExportAll, viewLabel = 'Save what is showing', allLabel = 'Save everything' }) {
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
    // and is then resolved into whichever outcome actually happened. Updated in place
    // (same id) as the export moves through its stages, rather than sitting on one
    // static "Exporting…" for however long it takes.
    const toastId = toast.loading('Saving Excel file…');
    const onProgress = (message) => toast.loading(message, { id: toastId });
    try {
      const result = await exportFn(onProgress);
      if (result === false) {
        toast.error('Nothing to save yet.', { id: toastId });
      } else if (result === 'canceled') {
        toast.dismiss(toastId);
      } else {
        toast.success('Excel file saved', { id: toastId });
      }
    } catch (err) {
      toast.error(err?.message || 'Couldn\'t save the Excel file. Try again.', { id: toastId });
    } finally {
      setLoading(false);
    }
  }, []);

  // Only one choice: a menu with a single item is a wasted click, so it is one button
  // labelled "Save to Excel", with the hover title saying what it saves.
  const onlyChoice = onExportView && !onExportAll ? { fn: onExportView, title: 'Saves what is showing — a search narrows the file' }
    : onExportAll && !onExportView ? { fn: onExportAll, title: 'Saves everything' }
    : null;
  if (onlyChoice) {
    return (
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => handleExport(onlyChoice.fn)}
        disabled={loading}
        title={onlyChoice.title}
      >
        {loading ? <Spinner size={16} /> : <Download size={16} />}
        {loading ? 'Saving…' : 'Save to Excel'}
      </button>
    );
  }

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
        {loading ? 'Saving…' : 'Save to Excel'}
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
