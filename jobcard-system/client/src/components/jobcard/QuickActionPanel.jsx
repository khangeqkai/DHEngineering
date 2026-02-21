import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { ScanLine, Camera, Play, Square, Eye, X, ArrowLeft, Check, FileText, Image } from 'lucide-react';
import { api } from '../../services/api';
import { useTimer } from './useTimer';
import { useCamera } from './useCamera';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import ConfirmDialog from '../common/ConfirmDialog';
import './QuickActionPanel.css';

function base64ToBlob(base64, mimeType = 'application/pdf') {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
}

const STATUS_LABELS = {
  QUOTE: 'Quote',
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  ON_HOLD: 'On Hold',
  DONE: 'Done',
  INVOICED: 'Invoiced'
};

function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function QuickActionPanel({ isOpen, onClose, jobCard, onViewDetails, onTimerChange }) {
  const [activeView, setActiveView] = useState('menu');
  const [scannerFiles, setScannerFiles] = useState([]);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [attachingFile, setAttachingFile] = useState(null);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [photosData, setPhotosData] = useState([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [loadingFiles, setLoadingFiles] = useState(new Set());
  const panelRef = useRef(null);

  const timer = useTimer(jobCard?.id);
  const camera = useCamera();
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();

  useEffect(() => {
    if (isOpen) {
      setActiveView('menu');
    } else {
      camera.stopCamera();
      setDocuments([]);
      setPhotosData([]);
      setLightboxPhoto(null);
    }
  }, [isOpen, camera.stopCamera]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (lightboxPhoto) {
          setLightboxPhoto(null);
        } else if (activeView !== 'menu') {
          if (activeView === 'camera') {
            camera.stopCamera();
          }
          setActiveView('menu');
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeView, onClose, camera.stopCamera, lightboxPhoto]);

  const handleBack = useCallback(() => {
    if (activeView === 'camera') {
      camera.stopCamera();
    }
    setActiveView('menu');
  }, [activeView, camera]);

  const loadScannerFiles = useCallback(async () => {
    setScannerLoading(true);
    try {
      const result = await api.getScannerFiles(10);
      setScannerFiles(result.files || []);
    } catch (err) {
      toast.error('Failed to load scanner files');
      setScannerFiles([]);
    } finally {
      setScannerLoading(false);
    }
  }, []);

  const handleScannerView = useCallback(() => {
    setActiveView('scanner');
    loadScannerFiles();
  }, [loadScannerFiles]);

  const handleAttachFile = useCallback(async (file) => {
    if (!jobCard) return;
    setAttachingFile(file.name);
    try {
      await api.attachScannerFile(jobCard.id, file.path);
      toast.success(`Attached: ${file.name}`);
      loadScannerFiles();
    } catch (err) {
      toast.error(err.message || 'Failed to attach file');
    } finally {
      setAttachingFile(null);
    }
  }, [jobCard, loadScannerFiles]);

  const handleCameraView = useCallback(() => {
    setActiveView('camera');
    camera.startCamera();
  }, [camera]);

  const handleSavePhoto = useCallback(async () => {
    if (!jobCard || camera.photos.length === 0) return;
    setSavingPhoto(true);
    try {
      const current = await api.getJobcard(jobCard.id);
      const existingPhotos = current.photos ? JSON.parse(current.photos) : [];
      const newPhotos = camera.photos.map(p => p.data);
      const allPhotos = [...existingPhotos, ...newPhotos];

      await api.updateJobcard(jobCard.id, { photos: JSON.stringify(allPhotos) });
      toast.success(`${camera.photos.length} photo(s) saved`);
      camera.setPhotos([]);
    } catch (err) {
      toast.error(err.message || 'Failed to save photos');
    } finally {
      setSavingPhoto(false);
    }
  }, [jobCard, camera]);

  const handleStartTimer = useCallback(async () => {
    await timer.startTimerWithConflictCheck(showConfirm);
    // Re-fetch parent indicator regardless — it's idempotent and self-correcting
    if (onTimerChange) onTimerChange();
  }, [timer, showConfirm, onTimerChange]);

  const handleStopTimer = useCallback(async () => {
    if (!timer.activeTimer) return;
    await timer.stopTimer();
    if (onTimerChange) onTimerChange();
  }, [timer, onTimerChange]);

  const handleViewDetails = useCallback(() => {
    camera.stopCamera();
    onClose();
    if (onViewDetails) onViewDetails(jobCard.id);
  }, [jobCard, onClose, onViewDetails, camera]);

  const handleDocumentsView = useCallback(async () => {
    setActiveView('documents');
    setDocumentsLoading(true);
    try {
      const files = await api.getQaDocumentFiles(jobCard.id);
      setDocuments(files || []);
    } catch (err) {
      toast.error('Failed to load QA documents');
      setDocuments([]);
    } finally {
      setDocumentsLoading(false);
    }
  }, [jobCard]);

  const handleViewDocument = useCallback(async (file) => {
    setLoadingFiles(prev => new Set(prev).add(file.name));
    try {
      const fileData = await api.getQaDocumentFileData(jobCard.id, file.name);
      if (!fileData?.data) {
        toast.error('Failed to load file data');
        return;
      }
      const blob = base64ToBlob(fileData.data, fileData.mimeType || 'application/octet-stream');
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      toast.error(err.message || 'Failed to view document');
    } finally {
      setLoadingFiles(prev => { const next = new Set(prev); next.delete(file.name); return next; });
    }
  }, [jobCard]);

  const handlePhotosView = useCallback(async () => {
    setActiveView('photos');
    setPhotosLoading(true);
    try {
      const fullCard = await api.getJobcard(jobCard.id);
      const photos = fullCard.photos
        ? (typeof fullCard.photos === 'string' ? JSON.parse(fullCard.photos) : fullCard.photos)
        : [];
      setPhotosData(photos);
    } catch (err) {
      toast.error('Failed to load photos');
      setPhotosData([]);
    } finally {
      setPhotosLoading(false);
    }
  }, [jobCard]);

  if (!isOpen || !jobCard) return null;

  const getStatusClass = (status) => {
    switch (status) {
      case 'QUOTE': case 'OPEN': return 'badge-pending';
      case 'IN_PROGRESS': return 'badge-in-progress';
      case 'ON_HOLD': return 'badge-cancelled';
      case 'DONE': case 'INVOICED': return 'badge-completed';
      default: return '';
    }
  };

  return createPortal(
    <div className="quick-action-overlay">
      <div
        className="quick-action-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Quick Actions"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="qap-header">
          <div className="qap-header-info">
            {activeView !== 'menu' && (
              <button className="qap-back-btn" onClick={handleBack}>
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="qap-job-info">
              <div className="qap-job-number">{jobCard.jobNumber}</div>
              {jobCard.description && (
                <div className="qap-description">
                  {jobCard.description.substring(0, 80)}
                  {jobCard.description.length > 80 ? '...' : ''}
                </div>
              )}
            </div>
            <div className="qap-header-meta">
              <span className={`badge ${getStatusClass(jobCard.status)}`}>
                {STATUS_LABELS[jobCard.status] || jobCard.status}
              </span>
              {jobCard.dueDate && (
                <span className="qap-due-date">
                  Due: {new Date(jobCard.dueDate).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
          <button className="qap-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="qap-body">
          {activeView === 'menu' && (
            <div className="qap-actions-grid">
              <button
                className="qap-action-btn qap-action-scan"
                onClick={handleScannerView}
              >
                <ScanLine size={28} />
                <span>Scan Document</span>
              </button>

              <button
                className="qap-action-btn qap-action-camera"
                onClick={handleCameraView}
              >
                <Camera size={28} />
                <span>Take Photo</span>
              </button>

              <button
                className={`qap-action-btn ${timer.activeTimer ? 'qap-action-stop' : 'qap-action-start'}`}
                onClick={timer.activeTimer ? handleStopTimer : handleStartTimer}
                disabled={timer.loading}
              >
                {timer.activeTimer ? <Square size={28} /> : <Play size={28} />}
                <span>
                  {timer.activeTimer
                    ? `Stop Timer (${formatElapsed(timer.elapsed)})`
                    : 'Start Timer'}
                </span>
              </button>

              <button
                className="qap-action-btn qap-action-documents"
                onClick={handleDocumentsView}
              >
                <FileText size={28} />
                <span>View Documents</span>
              </button>

              <button
                className="qap-action-btn qap-action-photos"
                onClick={handlePhotosView}
              >
                <Image size={28} />
                <span>View Photos</span>
              </button>

              <button
                className="qap-action-btn qap-action-details"
                onClick={handleViewDetails}
              >
                <Eye size={28} />
                <span>View Details</span>
              </button>
            </div>
          )}

          {activeView === 'scanner' && (
            <div className="qap-scanner-view">
              <h3>Scanner Files</h3>
              {scannerLoading ? (
                <p className="qap-loading">Loading files...</p>
              ) : scannerFiles.length === 0 ? (
                <p className="qap-empty">No scanner files found</p>
              ) : (
                <div className="qap-file-list">
                  {scannerFiles.map((file) => (
                    <div key={file.name} className="qap-file-item">
                      <div className="qap-file-info">
                        <span className="qap-file-name">{file.name}</span>
                        <span className="qap-file-meta">
                          {(file.size / 1024).toFixed(0)} KB
                          {' \u00B7 '}
                          {new Date(file.modified).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleAttachFile(file)}
                        disabled={attachingFile === file.name}
                      >
                        {attachingFile === file.name ? 'Attaching...' : 'Attach'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeView === 'camera' && (
            <div className="qap-camera-view">
              <div className="qap-video-container">
                <video
                  ref={camera.videoRef}
                  autoPlay
                  playsInline
                  className="qap-video"
                />
              </div>
              <div className="qap-camera-controls">
                <button
                  className="btn btn-primary"
                  onClick={camera.capturePhoto}
                  disabled={!camera.cameraReady}
                >
                  <Camera size={16} /> Capture
                </button>
                {camera.photos.length > 0 && (
                  <button
                    className="btn btn-success"
                    onClick={handleSavePhoto}
                    disabled={savingPhoto}
                  >
                    <Check size={16} /> Save {camera.photos.length} Photo{camera.photos.length > 1 ? 's' : ''}
                  </button>
                )}
              </div>
              {camera.photos.length > 0 && (
                <div className="qap-photo-strip">
                  {camera.photos.map((photo) => (
                    <div key={photo.id} className="qap-photo-thumb">
                      <img src={photo.data} alt="Captured" />
                      <button
                        className="qap-photo-remove"
                        onClick={() => camera.removePhoto(photo.id)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeView === 'documents' && (
            <div className="qap-documents-view">
              <h3>QA Documents</h3>
              {documentsLoading ? (
                <p className="qap-loading">Loading documents...</p>
              ) : documents.length === 0 ? (
                <p className="qap-empty">No documents found</p>
              ) : (
                <div className="qap-file-list">
                  {documents.map((file) => (
                    <div key={file.name} className="qap-file-item">
                      <div className="qap-file-info">
                        <span className="qap-file-name">{file.name}</span>
                        <span className="qap-file-meta">
                          {(file.size / 1024).toFixed(0)} KB
                          {' · '}
                          {new Date(file.modified).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleViewDocument(file)}
                        disabled={loadingFiles.has(file.name)}
                      >
                        <Eye size={14} /> View
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeView === 'photos' && (
            <div className="qap-photos-view">
              <h3>Photos</h3>
              {photosLoading ? (
                <p className="qap-loading">Loading photos...</p>
              ) : photosData.length === 0 ? (
                <p className="qap-empty">No photos taken</p>
              ) : (
                <div className="qap-photos-grid">
                  {photosData.map((photo, idx) => (
                    <div
                      key={idx}
                      className="qap-photos-grid-item"
                      onClick={() => setLightboxPhoto(photo)}
                    >
                      <img src={typeof photo === 'string' ? photo : photo.data} alt={`Photo ${idx + 1}`} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {lightboxPhoto && (
          <div className="qap-lightbox" onClick={() => setLightboxPhoto(null)}>
            <button className="qap-lightbox-close" onClick={() => setLightboxPhoto(null)}>
              <X size={24} />
            </button>
            <img
              src={typeof lightboxPhoto === 'string' ? lightboxPhoto : lightboxPhoto.data}
              alt="Full size"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={dialogState.isOpen}
        title={dialogState.title}
        message={dialogState.message}
        confirmLabel={dialogState.confirmLabel}
        cancelLabel={dialogState.cancelLabel}
        confirmVariant={dialogState.confirmVariant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>,
    document.body
  );
}
