import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ScanLine, Camera, Upload, FolderOpen, X, ArrowLeft, ChevronDown, FileText,
  ClipboardCheck, Package, FileText as JobFileIcon, Check
} from 'lucide-react';
import { useCamera } from './useCamera';
import { useJobFiles, CATEGORIES, CATEGORY_LABELS } from './useJobFiles';
import './JobFilesMenu.css';

const CATEGORY_ICONS = {
  'qa-form-files': ClipboardCheck,
  'job-files': JobFileIcon,
  'customer-property-files': Package
};

export default function JobFilesMenu({ jobcardId, jobNumber }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState('menu'); // menu | upload-source | scanner | camera | viewing
  const [selectedCategory, setSelectedCategory] = useState(null);
  const menuRef = useRef(null);
  const overlayRef = useRef(null);

  const camera = useCamera();
  const files = useJobFiles(jobcardId);

  // Fetch the folder count badges lazily — only the first time the menu is opened,
  // so simply opening a job card doesn't fire three file-list requests up front.
  const countsLoadedRef = useRef(false);
  useEffect(() => {
    if (menuOpen && !countsLoadedRef.current) {
      countsLoadedRef.current = true;
      files.refreshAllCounts();
    }
  }, [menuOpen, files]);

  // Click outside / Escape closes the dropdown menu (not the overlay)
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape' && view === 'menu') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen, view]);

  // Overlay close logic
  useEffect(() => {
    if (view === 'menu') return;
    const handleEscape = (e) => {
      if (e.key !== 'Escape') return;
      if (files.viewerUrl) { files.closeViewer(); return; }
      if (files.lightboxPhoto) { files.closeLightbox(); return; }
      if (view === 'scanner' || view === 'camera') {
        if (view === 'camera') camera.stopCamera();
        setView('upload-source');
      } else if (view === 'upload-source') {
        setSelectedCategory(null);
        setView('menu');
      } else if (view === 'viewing') {
        setSelectedCategory(null);
        setView('menu');
        files.reset();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [view, camera, files]);

  const closeAll = useCallback(() => {
    camera.stopCamera();
    files.reset();
    setView('menu');
    setSelectedCategory(null);
    setMenuOpen(false);
  }, [camera, files]);

  const startUpload = (category) => {
    setSelectedCategory(category);
    setView('upload-source');
    setMenuOpen(false);
  };

  const startView = (category) => {
    setSelectedCategory(category);
    setView('viewing');
    setMenuOpen(false);
    files.loadFiles(category);
  };

  const handleScannerView = () => {
    setView('scanner');
    files.loadScannerFiles();
  };

  const handleCameraView = () => {
    setView('camera');
    camera.startCamera();
  };

  const handleAttachFile = async (file) => {
    await files.saveScannerFile(file, selectedCategory);
  };

  const handleSavePhotos = async () => {
    if (camera.photos.length === 0) return;
    await files.savePhotos(camera.photos, selectedCategory, () => camera.setPhotos([]));
  };

  const totalCount = CATEGORIES.reduce((sum, c) => sum + (files.counts[c] || 0), 0);

  const renderCount = (category) => {
    const count = files.counts[category];
    if (count === null || count === undefined) return null;
    if (count === 0) return <span className="lif-pill lif-pill-empty">none</span>;
    return <span className="lif-pill lif-pill-count">{count}</span>;
  };

  return (
    <>
      <div className="lif-menu-wrapper" ref={menuRef}>
        <button
          type="button"
          className="lif-trigger-btn"
          onClick={() => setMenuOpen(o => !o)}
        >
          <FolderOpen size={14} /> Files{totalCount > 0 ? ` (${totalCount})` : ''} <ChevronDown size={12} />
        </button>

        {menuOpen && (
          <div className="lif-menu">
            <div className="lif-menu-section-label">Upload to…</div>
            {CATEGORIES.map(cat => (
              <button
                key={`upload-${cat}`}
                className="lif-menu-item"
                onClick={() => startUpload(cat)}
              >
                <Upload size={14} /> {CATEGORY_LABELS[cat]}
              </button>
            ))}
            <div className="lif-menu-divider" />
            <div className="lif-menu-section-label">View files</div>
            {CATEGORIES.map(cat => (
              <button
                key={`view-${cat}`}
                className="lif-menu-item"
                onClick={() => startView(cat)}
              >
                <FolderOpen size={14} /> {CATEGORY_LABELS[cat]} {renderCount(cat)}
              </button>
            ))}
          </div>
        )}
      </div>

      {view !== 'menu' && createPortal(
        <div className="lif-overlay" onClick={(e) => { if (e.target === overlayRef.current) closeAll(); }}>
          <div className="lif-panel" ref={overlayRef} role="dialog" aria-modal="true">
            <div className="lif-panel-header">
              <button
                className="lif-back-btn"
                onClick={() => {
                  if (view === 'scanner' || view === 'camera') {
                    if (view === 'camera') camera.stopCamera();
                    setView('upload-source');
                  } else {
                    closeAll();
                  }
                }}
              >
                <ArrowLeft size={16} /> Back
              </button>
              <div className="lif-panel-title">
                {jobNumber || 'Files'}
                {selectedCategory && <span className="lif-panel-subtitle"> · {CATEGORY_LABELS[selectedCategory]}</span>}
              </div>
              <button className="lif-close-btn" onClick={closeAll}>
                <X size={18} />
              </button>
            </div>

            <div className="lif-panel-body">
              {view === 'upload-source' && (
                <div className="lif-source-grid">
                  <button className="lif-source-btn" onClick={handleScannerView}>
                    <ScanLine size={28} />
                    <span>Scanner</span>
                    <small>Pick from scanned files</small>
                  </button>
                  <button className="lif-source-btn" onClick={handleCameraView}>
                    <Camera size={28} />
                    <span>Camera</span>
                    <small>Take a photo</small>
                  </button>
                </div>
              )}

              {view === 'scanner' && (
                <div className="lif-scanner">
                  {files.scannerLoading ? (
                    <p className="lif-loading">Loading files...</p>
                  ) : files.scannerFiles.length === 0 ? (
                    <p className="lif-empty">No scanner files found</p>
                  ) : (
                    <div className="lif-file-list">
                      {files.scannerFiles.map(file => (
                        <div key={file.name} className="lif-file-row">
                          <div className="lif-file-info">
                            <span className="lif-file-name">{file.name}</span>
                            <span className="lif-file-meta">
                              {(file.size / 1024).toFixed(0)} KB
                              {' · '}
                              {new Date(file.modified).toLocaleDateString()}
                            </span>
                          </div>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleAttachFile(file)}
                            disabled={files.attachingFile === file.name}
                          >
                            {files.attachingFile === file.name ? 'Saving...' : 'Attach'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {view === 'camera' && camera.cameraError && (
                <div className="lif-camera-error">
                  <Camera size={32} />
                  <p className="lif-camera-error-msg">{camera.cameraError}</p>
                  <div className="lif-camera-error-actions">
                    <button className="btn btn-secondary" onClick={() => { camera.stopCamera(); setView('upload-source'); }}>
                      <ArrowLeft size={16} /> Go back
                    </button>
                    <button className="btn btn-primary" onClick={() => camera.startCamera()}>
                      Try again
                    </button>
                  </div>
                </div>
              )}

              {view === 'camera' && !camera.cameraError && (
                <div className="lif-camera">
                  <div className="lif-video-wrap">
                    <video ref={camera.videoRef} autoPlay playsInline className="lif-video" />
                  </div>
                  <div className="lif-camera-actions">
                    <button className="btn btn-primary" onClick={camera.capturePhoto} disabled={!camera.cameraReady}>
                      <Camera size={16} /> Capture
                    </button>
                    {camera.photos.length > 0 && (
                      <button className="btn btn-success" onClick={handleSavePhotos} disabled={files.savingPhotos}>
                        <Check size={16} /> Save to {CATEGORY_LABELS[selectedCategory]}
                      </button>
                    )}
                  </div>
                  {camera.photos.length > 0 && (
                    <div className="lif-photo-strip">
                      {camera.photos.map(photo => (
                        <div key={photo.id} className="lif-photo-thumb">
                          <img src={photo.data} alt="Captured" />
                          <button className="lif-photo-remove" onClick={() => camera.removePhoto(photo.id)}>
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {view === 'viewing' && (() => {
                const viewingFiles = files.filesByCategory[selectedCategory] || [];
                return (
                <div className="lif-viewing">
                  {files.loadingByCategory[selectedCategory] ? (
                    <p className="lif-loading">Loading files...</p>
                  ) : viewingFiles.length === 0 ? (
                    <p className="lif-empty">No files yet</p>
                  ) : (
                    <div className="lif-file-grid">
                      {viewingFiles.map(file => {
                        const isImage = file.mimeType?.startsWith('image/');
                        const thumb = files.thumbnails.get(`${selectedCategory}/${file.name}`);
                        return (
                          <button
                            key={file.name}
                            className="lif-file-card"
                            onClick={() => files.handleViewFile(file, selectedCategory)}
                            title={file.name}
                          >
                            {isImage ? (
                              thumb ? (
                                <img src={thumb} alt={file.name} className="lif-file-card-thumb" />
                              ) : (
                                <div className="lif-file-card-loading" />
                              )
                            ) : (
                              <div className="lif-file-card-icon">
                                <FileText size={28} />
                              </div>
                            )}
                            <span className="lif-file-card-name">{file.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                );
              })()}
            </div>
          </div>

          {files.lightboxPhoto && (
            <div className="lif-lightbox" onClick={files.closeLightbox}>
              <button className="lif-lightbox-close" onClick={files.closeLightbox}>
                <X size={24} />
              </button>
              <img src={files.lightboxPhoto} alt="Full size" onClick={(e) => e.stopPropagation()} />
            </div>
          )}

          {files.viewerUrl && (
            <div className="lif-doc-viewer">
              <button className="lif-lightbox-close" onClick={files.closeViewer}>
                <X size={24} />
              </button>
              <iframe src={files.viewerUrl} className="lif-doc-viewer-frame" title="Document viewer" />
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
