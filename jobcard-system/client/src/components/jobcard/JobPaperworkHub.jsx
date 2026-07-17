import { useState, useEffect, useRef, useCallback, useId, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import {
  FolderOpen, Upload, Camera, X, ArrowLeft, Check, Minus, Printer, Save,
  FileStack, Eye, ChevronDown
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useCamera } from './useCamera';
import { useJobFiles, CATEGORY_LABELS, ACCEPT_ATTR } from './useJobFiles';
import { usePacketPrint } from './usePacketPrint';
import HubFileRow from './HubFileRow';
import { api } from '../../services/api';
import { pushModal, removeModal, isTopModal } from '../common/modalStack';
import './JobPaperworkHub.css';

// One place for a job's paperwork: the generated job card plus the three file
// folders. View, upload (file or camera) per folder, print a single item, or weld
// a ticked selection into one combined packet to print or save. Available to every
// user (workers included), so it lives on a header button, not an admin-only tab.

// Order the packet (and the folder sections) follow: job files, customer
// property, then QA forms last.
const ORDER = ['job-files', 'customer-property-files', 'qa-form-files'];
// Most files that can go in one combined packet (matches the server's cap). The
// job card itself rides separately and doesn't count toward this.
const MAX_PACKET_FILES = 20;

const keyOf = (category, filename) => `${category}::${filename}`;

// Returned quality forms are stored with a hidden tag on the end of the name
// (e.g. "Completed Form 1 [20260614153027].pdf") so the system can tell a
// completed form apart from a blank template. Strip that trailing tag for
// display so the list reads cleanly as "Completed Form 1.pdf". The real name is
// still used everywhere else (selection, view, print).
function cleanQaName(name) {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base.replace(/ \[[^\]]+\](?: \(\d+\))?$/, '')}${ext}`;
}

// A friendly one-word "what kind of file" line shown under each name.
function fileKindLabel(f) {
  if ((f.mimeType || '').startsWith('image/')) return 'Image';
  const dot = f.name.lastIndexOf('.');
  const ext = dot > 0 ? f.name.slice(dot + 1).toUpperCase() : '';
  if (ext === 'PDF') return 'PDF document';
  return ext ? `${ext} file` : 'File';
}

// The one selection control used everywhere (rows, groups, the job card and the
// master switch) so the whole panel reads consistently. `state` is a tri-state:
// 'all' shows a tick, 'some' shows a dash (a group only partly picked), 'none' is
// empty. A plain boolean works too for single items.
function PickCircle({ state }) {
  const s = state === true ? 'all' : state === false ? 'none' : state;
  return (
    <span className={`hub-check hub-check--${s}`} aria-hidden="true">
      {s === 'all' && <Check size={13} strokeWidth={3} />}
      {s === 'some' && <Minus size={13} strokeWidth={3} />}
    </span>
  );
}

function JobPaperworkHub({ jobcardId, jobNumber, onFilesChanged, attachmentWarnings = null, parts = [] }, ref) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('hub'); // 'hub' | 'camera'
  const [cameraCategory, setCameraCategory] = useState(null);
  // When opened from a part's Attach button: the part any file added here should
  // belong to, plus which section to highlight. Null = opened plainly (whole-job).
  const [attachTarget, setAttachTarget] = useState(null); // { itemId, itemNumber, category }
  const [selected, setSelected] = useState(() => new Set());
  const [cardTicked, setCardTicked] = useState(true);
  const [pickMenuOpen, setPickMenuOpen] = useState(false); // per-part "Select all" menu (only when 2+ parts)
  const [cardPreview, setCardPreview] = useState(null); // generated job-card HTML, shown in the viewer
  const [cardPreviewLoading, setCardPreviewLoading] = useState(false);
  const seenRef = useRef(new Set());
  const pendingUploadCat = useRef(null);
  const fileInputRef = useRef(null);
  const overlayRef = useRef(null);
  const modalId = useId();

  // Join the shared modal stack while open. This window opens on top of the job
  // card (itself a dialog that traps Tab/Escape); registering makes this the
  // top-most layer, so the card behind stops grabbing the keyboard.
  useEffect(() => {
    if (!open) return undefined;
    pushModal(modalId);
    return () => removeModal(modalId);
  }, [open, modalId]);

  const files = useJobFiles(jobcardId);
  const camera = useCamera();
  const packet = usePacketPrint(jobcardId, jobNumber);

  // Only saved parts (with a permanent "item:" id) can own a file.
  const assignableParts = parts.filter(p => typeof p.id === 'string' && p.id.startsWith('item:'));

  // Let the job card screen open this panel already pointed at a part, so the
  // per-part Attach button lands here instead of a bare file dialog.
  useImperativeHandle(ref, () => ({
    openForPart(itemId, itemNumber, category) {
      setAttachTarget({ itemId, itemNumber, category });
      setView('hub');
      setOpen(true);
    }
  }), []);

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

  // --- Selection helpers (whole-group + whole-job pick/clear) ---
  const sectionFileKeys = useCallback(
    (cat) => (files.filesByCategory[cat] || []).map(f => keyOf(cat, f.name)),
    [files.filesByCategory]
  );

  const sectionState = useCallback((cat) => {
    const keys = sectionFileKeys(cat);
    if (keys.length === 0) return 'empty';
    const picked = keys.filter(k => selected.has(k)).length;
    return picked === 0 ? 'none' : picked === keys.length ? 'all' : 'some';
  }, [sectionFileKeys, selected]);

  const toggleSection = useCallback((cat) => {
    const keys = sectionFileKeys(cat);
    const fullySelected = sectionState(cat) === 'all';
    setSelected(prev => {
      const next = new Set(prev);
      if (fullySelected) keys.forEach(k => next.delete(k));
      else keys.forEach(k => next.add(k));
      return next;
    });
  }, [sectionFileKeys, sectionState]);

  const allFileKeys = useCallback(() => ORDER.flatMap(sectionFileKeys), [sectionFileKeys]);

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

  const totalFileCount = allFileKeys().length;
  const totalSelectable = totalFileCount + 1; // + the job card
  const tickedFileCount = selectedItems().length;
  const tickedCount = tickedFileCount + (cardTicked ? 1 : 0);
  const overFileLimit = tickedFileCount > MAX_PACKET_FILES;
  // Whole-job pick state: card + every file, for the master Select all / Clear all.
  const masterState = tickedCount === 0 ? 'none'
    : tickedCount === totalSelectable ? 'all' : 'some';

  const selectAll = () => { setCardTicked(true); setSelected(new Set(allFileKeys())); };
  const clearAll = () => { setCardTicked(false); setSelected(new Set()); };
  const toggleMaster = () => { if (masterState === 'all') clearAll(); else selectAll(); };

  // Every file (across all folders) tied to one part, for the per-part "Select all
  // Part N" option when a job has more than one part.
  const partFileKeys = useCallback((partId) => {
    const keys = [];
    for (const cat of ORDER) {
      for (const f of files.filesByCategory[cat] || []) {
        if (f.itemId === partId) keys.push(keyOf(cat, f.name));
      }
    }
    return keys;
  }, [files.filesByCategory]);

  // Pick exactly one part's files (plus the job card, which the packet leads with).
  const selectPart = (partId) => { setCardTicked(true); setSelected(new Set(partFileKeys(partId))); };

  const closeAll = useCallback(() => {
    camera.stopCamera();
    files.reset();
    seenRef.current = new Set();
    setSelected(new Set());
    setCardTicked(true);
    setPickMenuOpen(false);
    setCardPreview(null);
    setView('hub');
    setCameraCategory(null);
    setAttachTarget(null);
    setOpen(false);
  }, [camera, files]);

  // Escape to close + Tab to trap focus inside the overlay (keyboard users can't
  // tab out to the page behind it).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      // Only the top-most dialog reacts to global keys.
      if (!isTopModal(modalId)) return;
      if (e.key === 'Escape') {
        if (pickMenuOpen) { setPickMenuOpen(false); return; }
        if (cardPreview) { setCardPreview(null); return; }
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
  }, [open, view, files, camera, closeAll, cardPreview, pickMenuOpen, modalId]);

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

  // If this section is the one a part's Attach button pointed us at, new files
  // added here belong to that part; otherwise they're whole-job.
  const ownerForCategory = (cat) => (attachTarget && attachTarget.category === cat ? attachTarget.itemId : null);
  // Once a file is added to the targeted section, drop the target so later,
  // unrelated uploads default back to whole-job.
  const clearTargetIfMatches = (cat) => { if (attachTarget && attachTarget.category === cat) setAttachTarget(null); };

  // --- Upload (file picker) ---
  const pickFiles = (cat) => { pendingUploadCat.current = cat; fileInputRef.current?.click(); };
  const onFilesChosen = async (e) => {
    const chosen = e.target.files;
    const cat = pendingUploadCat.current;
    await files.uploadPickedFiles(chosen, cat, () => { if (fileInputRef.current) fileInputRef.current.value = ''; }, ownerForCategory(cat));
    afterChange(cat);
    clearTargetIfMatches(cat);
  };

  // --- Camera ---
  const openCamera = (cat) => { setCameraCategory(cat); setView('camera'); camera.startCamera(); };
  const saveCameraPhotos = async () => {
    if (camera.photos.length === 0) return;
    await files.savePhotos(camera.photos, cameraCategory, () => camera.setPhotos([]), ownerForCategory(cameraCategory));
    afterChange(cameraCategory);
    clearTargetIfMatches(cameraCategory);
  };
  const leaveCamera = () => { camera.stopCamera(); setView('hub'); setCameraCategory(null); };

  // Re-tag a file to a part (or whole-job) then refresh the per-part missing-file hints.
  const handleAssign = async (cat, name, itemId) => {
    const ok = await files.assignFile(cat, name, itemId);
    if (ok) onFilesChanged?.();
  };

  // --- Print / save ---
  const printPacket = () => packet.printPacket({ items: selectedItems(), includeJobCard: cardTicked });
  const savePacket = () => packet.savePacket({ items: selectedItems(), includeJobCard: cardTicked });
  const printOne = (cat, name) => packet.printPacket({ items: [{ category: cat, filename: name }], includeJobCard: false });
  const printCardOnly = () => packet.printPacket({ items: [], includeJobCard: true });
  // Preview the job card the same way the other files preview: fetch the freshly
  // generated page and show it in the document viewer.
  const previewCard = async () => {
    setCardPreviewLoading(true);
    try {
      const { html } = await api.printJobCard(jobcardId);
      if (html) setCardPreview(html);
      else toast.error('Could not build the job card preview');
    } catch (err) {
      toast.error(err.message || 'Could not build the job card preview');
    } finally {
      setCardPreviewLoading(false);
    }
  };

  // The generated job card lives pinned at the top of the Job Files group (it is
  // part of the job's paperwork, not its own category), but stays independently
  // tickable with its own preview/print.
  const renderJobCardRow = () => (
    <li className={`hub-file-row${cardTicked ? '' : ' off'}`}>
      <button
        type="button"
        className="hub-row-toggle"
        onClick={() => setCardTicked(v => !v)}
        aria-pressed={cardTicked}
        title={cardTicked ? 'Tap to leave the job card out' : 'Tap to add the job card'}
      >
        <PickCircle state={cardTicked} />
        <span className="hub-thumb"><FileStack size={18} /></span>
        <span className="hub-namecell">
          <span className="hub-file-name">Job Card <span className="hub-pin-tag">pinned</span></span>
          <span className="hub-file-sub">Generated automatically</span>
        </span>
      </button>
      <div className="hub-row-tools">
        <button type="button" className="hub-icon-btn" onClick={previewCard} disabled={cardPreviewLoading} title="Preview the job card">
          <Eye size={15} />
        </button>
        <button type="button" className="hub-icon-btn" onClick={printCardOnly} disabled={packet.building} title="Print just the job card">
          <Printer size={15} />
        </button>
      </div>
    </li>
  );

  const renderSection = (cat) => {
    const list = files.filesByCategory[cat] || [];
    const loading = !!files.loadingByCategory[cat];
    const isJobFiles = cat === 'job-files';
    const showQaWarning = cat === 'qa-form-files' && attachmentWarnings?.missingQaForms;
    const state = sectionState(cat);
    const pickedHere = list.filter(f => selected.has(keyOf(cat, f.name))).length;
    const canToggleGroup = list.length > 0;
    // The "For:" picker (which part a file belongs to) only makes sense for the two
    // folders that drive the missing-attachment warning, and only if the job has
    // saved parts to choose from.
    const showOwnerPicker = (cat === 'job-files' || cat === 'customer-property-files') && assignableParts.length > 0;
    const targeted = attachTarget && attachTarget.category === cat;
    return (
      <div className={`hub-group${targeted ? ' hub-group--targeted' : ''}`} key={cat}>
        {targeted && (
          <div className="hub-group-hint">Adding to Part {attachTarget.itemNumber} — use Add or Photo below</div>
        )}
        <div className="hub-group-head">
          {/* Quiet section label. Clicking it picks/clears the whole group. */}
          <button
            type="button"
            className="hub-group-label-btn"
            onClick={() => toggleSection(cat)}
            disabled={!canToggleGroup}
            title={canToggleGroup ? (state === 'all' ? 'Clear this whole group' : 'Pick this whole group') : undefined}
          >
            <span className="hub-group-label">{CATEGORY_LABELS[cat]}</span>
            {canToggleGroup && <span className="hub-group-meta">{pickedHere}/{list.length}</span>}
          </button>
          {showQaWarning && (
            <span className="hub-group-warn" title="A completed quality form hasn't been brought back yet">· form missing</span>
          )}
          <span className="hub-group-spacer" />
          <button type="button" className="hub-pillbtn" onClick={() => pickFiles(cat)} disabled={files.uploading} title="Add a file">
            <Upload size={14} /> Add
          </button>
          <button type="button" className="hub-pillbtn" onClick={() => openCamera(cat)} title="Take a photo">
            <Camera size={14} /> Photo
          </button>
        </div>
        <div className="hub-card">
          <ul className="hub-file-list">
            {isJobFiles && renderJobCardRow()}
            {!loading && list.map(f => (
              <HubFileRow
                key={f.name}
                nameText={cat === 'qa-form-files' ? cleanQaName(f.name) : (f.displayName || f.name)}
                subText={fileKindLabel(f)}
                isImage={f.mimeType?.startsWith('image/')}
                thumb={files.thumbnails.get(`${cat}/${f.name}`)}
                checked={selected.has(keyOf(cat, f.name))}
                onToggle={() => toggle(cat, f.name)}
                viewing={files.loadingFiles.has(`${cat}/${f.name}`)}
                onView={() => files.handleViewFile(f, cat)}
                onPrint={() => printOne(cat, f.name)}
                printDisabled={packet.building}
                showOwnerPicker={showOwnerPicker}
                parts={assignableParts}
                currentItemId={f.itemId}
                assigning={files.assigningKeys.has(`${cat}/${f.name}`)}
                onAssign={(itemId) => handleAssign(cat, f.name, itemId)}
              />
            ))}
          </ul>
          {loading && <div className="hub-loading"><div className="hub-loading-bar" /></div>}
          {!loading && list.length === 0 && !isJobFiles && (
            <p className="hub-empty">Nothing here yet — use Add or Photo above</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <input type="file" ref={fileInputRef} accept={ACCEPT_ATTR} multiple style={{ display: 'none' }} onChange={onFilesChosen} />
      <button type="button" className="btn btn-secondary btn-sm hub-trigger" onClick={() => setOpen(true)}>
        <FolderOpen size={14} /> Files{totalFileCount > 0 ? ` (${totalFileCount})` : ''}
      </button>

      {open && createPortal(
        <div className="hub-overlay" ref={overlayRef}>
          <div className="hub-panel" role="dialog" aria-modal="true" aria-label="Job paperwork">
            <div className="hub-head">
              {view === 'camera' ? (
                <button className="hub-back" onClick={leaveCamera}><ArrowLeft size={16} /> Back</button>
              ) : (
                <div className="hub-title">
                  <span className="hub-title-badge"><FolderOpen size={20} /></span>
                  <span className="hub-title-text">
                    <b>{jobNumber || 'Paperwork'}</b>
                    <span>Paperwork</span>
                  </span>
                </div>
              )}
              <button className="hub-close" onClick={closeAll}><X size={18} /></button>
            </div>

            {view === 'hub' && (
              <>
                {/* Toolbar: a plain-language line + one switch to pick or clear everything. */}
                <div className="hub-toolbar">
                  <span className="hub-toolbar-count">
                    <strong>{tickedCount}</strong> of {totalSelectable} documents selected
                  </span>
                  {assignableParts.length >= 2 ? (
                    // More than one part: "Select all" opens a menu so you can pick
                    // everything, or just one part's files, or clear it all.
                    <div className="hub-selectall-wrap">
                      <button
                        type="button"
                        className="hub-selectall"
                        onClick={() => setPickMenuOpen(o => !o)}
                        aria-haspopup="true"
                        aria-expanded={pickMenuOpen}
                      >
                        <Check size={15} /> Select
                        <ChevronDown size={14} />
                      </button>
                      {pickMenuOpen && (
                        <>
                          <button
                            type="button"
                            className="hub-pickmenu-backdrop"
                            aria-hidden="true"
                            tabIndex={-1}
                            onClick={() => setPickMenuOpen(false)}
                          />
                          <div className="hub-pickmenu" role="menu">
                            <button type="button" role="menuitem" className="hub-pickmenu-item" onClick={() => { selectAll(); setPickMenuOpen(false); }}>
                              <span>Everything</span>
                              <span className="hub-pickmenu-count">{totalSelectable}</span>
                            </button>
                            <div className="hub-pickmenu-sep" />
                            {assignableParts.map(p => {
                              const n = partFileKeys(p.id).length;
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  role="menuitem"
                                  className="hub-pickmenu-item"
                                  disabled={n === 0}
                                  onClick={() => { selectPart(p.id); setPickMenuOpen(false); }}
                                >
                                  <span>All of Part {p.itemNumber}</span>
                                  <span className="hub-pickmenu-count">{n === 0 ? 'none' : n}</span>
                                </button>
                              );
                            })}
                            <div className="hub-pickmenu-sep" />
                            <button type="button" role="menuitem" className="hub-pickmenu-item" onClick={() => { clearAll(); setPickMenuOpen(false); }}>
                              <span>Clear all</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <button type="button" className="hub-selectall" onClick={toggleMaster}>
                      {masterState === 'all'
                        ? <><X size={15} /> Clear all</>
                        : <><Check size={15} /> Select all</>}
                    </button>
                  )}
                </div>

                <div className="hub-body">
                  {ORDER.map(renderSection)}
                </div>

                <div className="hub-footer">
                  {overFileLimit ? (
                    <span className="hub-count hub-count-warn">
                      Too many — untick {tickedFileCount - MAX_PACKET_FILES} (max {MAX_PACKET_FILES} files per packet)
                    </span>
                  ) : (
                    <span className="hub-count">{tickedCount === 0 ? 'Pick documents to print' : 'Combined into one printout'}</span>
                  )}
                  <div className="hub-footer-actions">
                    <button type="button" className="btn btn-secondary" onClick={savePacket} disabled={packet.building || tickedCount === 0 || overFileLimit}>
                      <Save size={15} /> Save PDF{tickedCount > 0 ? ` (${tickedCount})` : ''}
                    </button>
                    <button type="button" className="btn btn-primary" onClick={printPacket} disabled={packet.building || tickedCount === 0 || overFileLimit}>
                      <Printer size={15} /> {packet.building ? 'Preparing…' : `Print${tickedCount > 0 ? ` (${tickedCount})` : ''}`}
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
            <div className="hub-lightbox">
              <button className="hub-lightbox-close" onClick={files.closeLightbox}><X size={24} /></button>
              <img src={files.lightboxPhoto} alt="Full size" />
            </div>
          )}
          {files.viewerUrl && (
            <div className="hub-doc-viewer">
              <button className="hub-lightbox-close" onClick={files.closeViewer}><X size={24} /></button>
              <iframe src={files.viewerUrl} className="hub-doc-frame" title="Document viewer" />
            </div>
          )}
          {cardPreview && (
            <div className="hub-doc-viewer">
              <button className="hub-lightbox-close" onClick={() => setCardPreview(null)}><X size={24} /></button>
              <iframe srcDoc={cardPreview} className="hub-doc-frame" title="Job card preview" />
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

export default forwardRef(JobPaperworkHub);
