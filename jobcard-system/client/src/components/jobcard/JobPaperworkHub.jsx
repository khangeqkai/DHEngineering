import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  FolderOpen, Upload, Camera, X, ArrowLeft, Check, Printer, Save,
  FileText, Image as ImageIcon, ClipboardCheck, Package, FileStack
} from 'lucide-react';
import { useCamera } from './useCamera';
import { useJobFiles, CATEGORY_LABELS, ACCEPT_ATTR } from './useJobFiles';
import { usePacketPrint } from './usePacketPrint';
import './JobPaperworkHub.css';

// One place for a job's paperwork: the generated job card plus the three file
// folders. View, upload (file or camera) per folder, print a single item, or weld
// a ticked selection into one combined packet to print or save. Available to every
// user (workers included), so it lives on a header button, not an admin-only tab.

// Order the packet (and the folder sections) follow: drawings, forms, property.
const ORDER = ['job-files', 'qa-form-files', 'customer-property-files'];
// Most files that can go in one combined packet (matches the server's cap). The
// job card itself rides separately and doesn't count toward this.
const MAX_PACKET_FILES = 20;
const SECTION_ICONS = {
  'job-files': FileText,
  'qa-form-files': ClipboardCheck,
  'customer-property-files': Package
};

const keyOf = (category, filename) => `${category}::${filename}`;

export default function JobPaperworkHub({ jobcardId, jobNumber, onFilesChanged, attachmentWarnings = null }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('hub'); // 'hub' | 'camera'
  const [cameraCategory, setCameraCategory] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [cardTicked, setCardTicked] = useState(true);
  const seenRef = useRef(new Set());
  const pendingUploadCat = useRef(null);
  const fileInputRef = useRef(null);
  const overlayRef = useRef(null);

  const files = useJobFiles(jobcardId);
  const camera = useCamera();
  const packet = usePacketPrint(jobcardId, jobNumber);

  const loadFiles = files.loadFiles;
  // Load every folder when the hub opens.
  useEffect(() => {
    if (open && jobcardId) {
      ORDER.forEach(cat => loadFiles(cat));
    }
  }, [open, jobcardId, loadFiles]);

  // Pre-tick newly-seen files (so the packet starts with everything ticked) while
  // never re-ticking something the user has since unticked.
  useEffect(() => {
    setSelected(prev => {
      let changed = false;
      const next = new Set(prev);
      for (const cat of ORDER) {
        for (const f of files.filesByCategory[cat] || []) {
          const k = keyOf(cat, f.name);
          if (!seenRef.current.has(k)) {
            seenRef.current.add(k);
            next.add(k);
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [files.filesByCategory]);

  const toggle = useCallback((cat, name) => {
    setSelected(prev => {
      const next = new Set(prev);
      const k = keyOf(cat, name);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }, []);

  // Build the ordered {category, filename} list from the current ticks.
  const selectedItems = () => {
    const items = [];
    for (const cat of ORDER) {
      for (const f of files.filesByCategory[cat] || []) {
        if (selected.has(keyOf(cat, f.name))) items.push({ category: cat, filename: f.name });
      }
    }
    return items;
  };

  const totalCount = ORDER.reduce((sum, c) => sum + (files.counts[c] || 0), 0);
  const tickedFileCount = selectedItems().length;
  const tickedCount = tickedFileCount + (cardTicked ? 1 : 0);
  const overFileLimit = tickedFileCount > MAX_PACKET_FILES;

  const closeAll = useCallback(() => {
    camera.stopCamera();
    files.reset();
    seenRef.current = new Set();
    setSelected(new Set());
    setCardTicked(true);
    setView('hub');
    setCameraCategory(null);
    setOpen(false);
  }, [camera, files]);

  // Escape to close + Tab to trap focus inside the overlay (keyboard users can't
  // tab out to the page behind it).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (files.viewerUrl) { files.closeViewer(); return; }
        if (files.lightboxPhoto) { files.closeLightbox(); return; }
        if (view === 'camera') { camera.stopCamera(); setView('hub'); setCameraCategory(null); return; }
        closeAll();
        return;
      }
      if (e.key === 'Tab' && overlayRef.current) {
        const focusable = overlayRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const visible = Array.from(focusable).filter(el => !el.disabled && el.offsetParent !== null);
        if (visible.length === 0) return;
        const first = visible[0];
        const last = visible[visible.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, view, files, camera, closeAll]);

  // Move focus into the panel when it opens so Tab is trapped from the first press.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const el = overlayRef.current?.querySelector('button, input, select, textarea');
      el?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  const afterChange = useCallback((cat) => {
    files.loadFiles(cat);
    onFilesChanged?.();
  }, [files, onFilesChanged]);

  // --- Upload (file picker) ---
  const pickFiles = (cat) => { pendingUploadCat.current = cat; fileInputRef.current?.click(); };
  const onFilesChosen = async (e) => {
    const chosen = e.target.files;
    const cat = pendingUploadCat.current;
    await files.uploadPickedFiles(chosen, cat, () => { if (fileInputRef.current) fileInputRef.current.value = ''; });
    afterChange(cat);
  };

  // --- Camera ---
  const openCamera = (cat) => { setCameraCategory(cat); setView('camera'); camera.startCamera(); };
  const saveCameraPhotos = async () => {
    if (camera.photos.length === 0) return;
    await files.savePhotos(camera.photos, cameraCategory, () => camera.setPhotos([]));
    afterChange(cameraCategory);
  };
  const leaveCamera = () => { camera.stopCamera(); setView('hub'); setCameraCategory(null); };

  // --- Print / save ---
  const printPacket = () => packet.printPacket({ items: selectedItems(), includeJobCard: cardTicked });
  const savePacket = () => packet.savePacket({ items: selectedItems(), includeJobCard: cardTicked });
  const printOne = (cat, name) => packet.printPacket({ items: [{ category: cat, filename: name }], includeJobCard: false });
  const printCardOnly = () => packet.printPacket({ items: [], includeJobCard: true });

  const renderSection = (cat) => {
    const list = files.filesByCategory[cat] || [];
    const loading = !!files.loadingByCategory[cat];
    const Icon = SECTION_ICONS[cat];
    const showQaWarning = cat === 'qa-form-files' && attachmentWarnings?.missingQaForms;
    return (
      <div className="hub-section" key={cat}>
        <div className="hub-section-head">
          <Icon size={16} className="hub-section-icon" />
          <span className="hub-section-name">{CATEGORY_LABELS[cat]}</span>
          {showQaWarning && (
            <span className="hub-warning" title="A completed quality form hasn't been brought back yet">⚠ Form missing</span>
          )}
          <div className="hub-section-actions">
            <button type="button" className="hub-add-btn" onClick={() => pickFiles(cat)} disabled={files.uploading}>
              <Upload size={13} /> {files.uploading ? 'Adding…' : 'Add file'}
            </button>
            <button type="button" className="hub-add-btn" onClick={() => openCamera(cat)}>
              <Camera size={13} /> Camera
            </button>
          </div>
        </div>
        {loading ? (
          <div className="hub-loading"><div className="hub-loading-bar" /></div>
        ) : list.length === 0 ? (
          <p className="hub-empty">No files yet</p>
        ) : (
          <ul className="hub-file-list">
            {list.map(f => {
              const isImage = f.mimeType?.startsWith('image/');
              const thumb = files.thumbnails.get(`${cat}/${f.name}`);
              const FileIcon = isImage ? ImageIcon : FileText;
              const checked = selected.has(keyOf(cat, f.name));
              return (
                <li key={f.name} className="hub-file-row">
                  <label className="hub-tick">
                    <input type="checkbox" checked={checked} onChange={() => toggle(cat, f.name)} />
                  </label>
                  <button type="button" className="hub-file-main" onClick={() => files.handleViewFile(f, cat)} title={f.name}>
                    <span className="hub-thumb">
                      {isImage && thumb ? <img src={thumb} alt={f.name} /> : <FileIcon size={16} />}
                    </span>
                    <span className="hub-file-name">{f.name}</span>
                  </button>
                  <button type="button" className="hub-row-print" onClick={() => printOne(cat, f.name)} disabled={packet.building} title="Print this one">
                    <Printer size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  return (
    <>
      <input type="file" ref={fileInputRef} accept={ACCEPT_ATTR} multiple style={{ display: 'none' }} onChange={onFilesChosen} />
      <button type="button" className="btn btn-secondary btn-sm hub-trigger" onClick={() => setOpen(true)}>
        <FolderOpen size={14} /> Files{totalCount > 0 ? ` (${totalCount})` : ''}
      </button>

      {open && createPortal(
        <div className="hub-overlay" ref={overlayRef} onClick={(e) => { if (e.target.classList.contains('hub-overlay')) closeAll(); }}>
          <div className="hub-panel" role="dialog" aria-modal="true" aria-label="Job paperwork">
            <div className="hub-head">
              {view === 'camera' ? (
                <button className="hub-back" onClick={leaveCamera}><ArrowLeft size={16} /> Back</button>
              ) : (
                <div className="hub-title"><FileStack size={18} /> {jobNumber || 'Paperwork'}</div>
              )}
              <button className="hub-close" onClick={closeAll}><X size={18} /></button>
            </div>

            {view === 'hub' && (
              <>
                <div className="hub-body">
                  <p className="hub-hint">Everything's ticked to print. Untick anything you don't want in the packet.</p>

                  <div className="hub-section hub-card-section">
                    <label className="hub-tick">
                      <input type="checkbox" checked={cardTicked} onChange={() => setCardTicked(v => !v)} />
                    </label>
                    <div className="hub-card-main">
                      <FileStack size={16} className="hub-section-icon" />
                      <span className="hub-section-name">Job Card</span>
                      <span className="hub-generated">generated</span>
                    </div>
                    <button type="button" className="hub-row-print" onClick={printCardOnly} disabled={packet.building} title="Print just the job card">
                      <Printer size={14} />
                    </button>
                  </div>

                  {ORDER.map(renderSection)}
                </div>

                <div className="hub-footer">
                  <span className="hub-count">
                    {tickedCount} ticked
                    {overFileLimit && (
                      <span className="hub-count-warn"> · untick {tickedFileCount - MAX_PACKET_FILES} (max {MAX_PACKET_FILES} files per packet)</span>
                    )}
                  </span>
                  <div className="hub-footer-actions">
                    <button type="button" className="btn btn-secondary" onClick={savePacket} disabled={packet.building || tickedCount === 0 || overFileLimit}>
                      <Save size={15} /> Save as PDF
                    </button>
                    <button type="button" className="btn btn-primary" onClick={printPacket} disabled={packet.building || tickedCount === 0 || overFileLimit}>
                      <Printer size={15} /> {packet.building ? 'Preparing…' : 'Print packet'}
                    </button>
                  </div>
                </div>
              </>
            )}

            {view === 'camera' && (
              <div className="hub-body">
                <div className="hub-camera-sub">Adding to {CATEGORY_LABELS[cameraCategory]}</div>
                {camera.cameraError ? (
                  <div className="hub-camera-error">
                    <Camera size={32} />
                    <p>{camera.cameraError}</p>
                    <div className="hub-camera-error-actions">
                      <button className="btn btn-secondary" onClick={leaveCamera}><ArrowLeft size={16} /> Go back</button>
                      <button className="btn btn-primary" onClick={() => camera.startCamera()}>Try again</button>
                    </div>
                  </div>
                ) : (
                  <div className="hub-camera">
                    <div className="hub-video-wrap"><video ref={camera.videoRef} autoPlay playsInline className="hub-video" /></div>
                    <div className="hub-camera-actions">
                      <button className="btn btn-primary" onClick={camera.capturePhoto} disabled={!camera.cameraReady}>
                        <Camera size={16} /> Capture
                      </button>
                      {camera.photos.length > 0 && (
                        <button className="btn btn-success" onClick={saveCameraPhotos} disabled={files.savingPhotos}>
                          <Check size={16} /> Save {camera.photos.length} to {CATEGORY_LABELS[cameraCategory]}
                        </button>
                      )}
                    </div>
                    {camera.photos.length > 0 && (
                      <div className="hub-photo-strip">
                        {camera.photos.map(p => (
                          <div key={p.id} className="hub-photo-thumb">
                            <img src={p.data} alt="Captured" />
                            <button className="hub-photo-remove" onClick={() => camera.removePhoto(p.id)}><X size={12} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {files.lightboxPhoto && (
            <div className="hub-lightbox" onClick={files.closeLightbox}>
              <button className="hub-lightbox-close" onClick={files.closeLightbox}><X size={24} /></button>
              <img src={files.lightboxPhoto} alt="Full size" onClick={(e) => e.stopPropagation()} />
            </div>
          )}
          {files.viewerUrl && (
            <div className="hub-doc-viewer">
              <button className="hub-lightbox-close" onClick={files.closeViewer}><X size={24} /></button>
              <iframe src={files.viewerUrl} className="hub-doc-frame" title="Document viewer" />
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
