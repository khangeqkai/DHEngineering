import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { ScanLine, Camera, Play, Square, Eye, X, ArrowLeft, Check, FileText, FolderOpen, ClipboardCheck, Package, Upload } from 'lucide-react';
import { useTimer } from './useTimer';
import { useCamera } from './useCamera';
import { useQuickActionFiles, CATEGORY_LABELS } from './useQuickActionFiles';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import ConfirmDialog from '../common/ConfirmDialog';
import StopTimerForm from './StopTimerForm';
import './QuickActionPanel.css';

const STATUS_LABELS = {
  QUOTE: 'Quote',
  OPEN: 'Open',
  AWAITING_MATERIAL: 'Awaiting Material',
  IN_PROGRESS: 'In Progress',
  TREATMENT: 'Treatment',
  ON_HOLD: 'On Hold',
  DONE: 'Done',
  INVOICED: 'Invoiced'
};

const DOC_TABS = [
  { key: 'qa-forms', label: 'QA Forms' },
  { key: 'job-files', label: 'Job Files' },
  { key: 'customer-property', label: 'Customer Property' }
];

function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function QuickActionPanel({ isOpen, onClose, jobCard, onViewDetails, onTimerChange }) {
  const [activeView, setActiveView] = useState('menu');
  const [selectedCategory, setSelectedCategory] = useState(null); // 'qa-forms' | 'job-files' | 'customer-property'
  const [docTab, setDocTab] = useState('qa-forms');
  const panelRef = useRef(null);

  const timer = useTimer(jobCard?.id);
  const camera = useCamera();
  const files = useQuickActionFiles(jobCard);
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();

  useEffect(() => {
    if (isOpen) {
      setActiveView('menu');
      setSelectedCategory(null);
      setDocTab('qa-forms');
    } else {
      camera.stopCamera();
      files.reset();
    }
  }, [isOpen, camera.stopCamera, files.reset]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (timer.showEntryForm) {
          return;
        } else if (files.viewerUrl) {
          files.closeViewer();
        } else if (files.lightboxPhoto) {
          files.closeLightbox();
        } else if (activeView === 'scanner' || activeView === 'camera') {
          if (activeView === 'camera') camera.stopCamera();
          setActiveView('upload-source');
        } else if (activeView === 'upload-source') {
          setActiveView('upload-category');
        } else if (activeView === 'upload-category') {
          setSelectedCategory(null);
          setActiveView('menu');
        } else if (activeView !== 'menu') {
          setActiveView('menu');
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeView, onClose, camera.stopCamera, files.lightboxPhoto, files.viewerUrl, files.closeViewer, files.closeLightbox, timer.showEntryForm]);

  const handleBack = useCallback(() => {
    if (activeView === 'scanner' || activeView === 'camera') {
      if (activeView === 'camera') camera.stopCamera();
      setActiveView('upload-source');
      return;
    }
    if (activeView === 'upload-source') {
      setActiveView('upload-category');
      return;
    }
    if (activeView === 'upload-category') {
      setSelectedCategory(null);
    }
    setActiveView('menu');
  }, [activeView, camera]);

  const handleUploadView = useCallback(() => {
    setActiveView('upload-category');
  }, []);

  const handleCategorySelect = useCallback((category) => {
    setSelectedCategory(category);
    setActiveView('upload-source');
  }, []);

  const handleScannerView = useCallback(() => {
    setActiveView('scanner');
    files.loadScannerFiles();
  }, [files.loadScannerFiles]);

  const handleAttachFile = useCallback(async (file) => {
    await files.saveScannerFile(file, selectedCategory);
  }, [files.saveScannerFile, selectedCategory]);

  const handleCameraView = useCallback(() => {
    setActiveView('camera');
    camera.startCamera();
  }, [camera]);

  const handleSavePhotos = useCallback(async () => {
    if (camera.photos.length === 0) return;
    const returnView = await files.savePhotos(camera.photos, selectedCategory, () => camera.setPhotos([]));
    if (returnView) {
      setActiveView(returnView);
      camera.startCamera();
    }
  }, [camera.photos, camera.setPhotos, camera.startCamera, files.savePhotos, selectedCategory]);

  const handleStartTimer = useCallback(async () => {
    await timer.startTimerWithConflictCheck(showConfirm);
    if (onTimerChange) onTimerChange();
  }, [timer, showConfirm, onTimerChange]);

  const handleStopTimer = useCallback(async () => {
    if (!timer.activeTimer) return;
    await timer.stopTimer();
    if (onTimerChange) onTimerChange();
  }, [timer, onTimerChange]);

  const handleSubmitEntryForm = useCallback(async () => {
    await timer.submitEntryForm();
  }, [timer]);

  const handleCancelEntryForm = useCallback(async () => {
    await timer.cancelEntryForm();
    if (onTimerChange) onTimerChange();
  }, [timer, onTimerChange]);

  const handleViewDetails = useCallback(() => {
    camera.stopCamera();
    onClose();
    if (onViewDetails) onViewDetails(jobCard.id);
  }, [jobCard, onClose, onViewDetails, camera]);

  const handleDocumentsView = useCallback(() => {
    setActiveView('view-documents');
    setDocTab('qa-forms');
    files.loadQaFormFiles();
  }, [files.loadQaFormFiles]);

  const handleDocTabChange = useCallback((tab) => {
    setDocTab(tab);
    if (tab === 'qa-forms') files.loadQaFormFiles();
    else if (tab === 'job-files') files.loadJobFiles();
    else if (tab === 'customer-property') files.loadCustomerPropertyFiles();
  }, [files.loadQaFormFiles, files.loadJobFiles, files.loadCustomerPropertyFiles]);

  if (!isOpen || !jobCard) return null;

  const getStatusClass = (status) => {
    switch (status) {
      case 'QUOTE': case 'OPEN': return 'badge-pending';
      case 'AWAITING_MATERIAL': return 'badge-awaiting-material';
      case 'IN_PROGRESS': return 'badge-in-progress';
      case 'TREATMENT': return 'badge-treatment';
      case 'ON_HOLD': return 'badge-cancelled';
      case 'DONE': case 'INVOICED': return 'badge-completed';
      default: return '';
    }
  };

  // Get current tab's files/loading state
  const getTabFiles = () => {
    if (docTab === 'qa-forms') return { files: files.qaFormFiles, loading: files.qaFormFilesLoading, source: 'qa-forms' };
    if (docTab === 'job-files') return { files: files.jobFiles, loading: files.jobFilesLoading, source: 'job-files' };
    return { files: files.customerPropertyFiles, loading: files.customerPropertyLoading, source: 'customer-property' };
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
          <button className="qap-close-btn" onClick={onClose} disabled={timer.showEntryForm}>
            <X size={20} />
          </button>
        </div>

        <div className="qap-body">
          {activeView === 'menu' && (
            <div className="qap-actions-grid">
              <button className="qap-action-btn qap-action-upload" onClick={handleUploadView}>
                <Upload size={28} />
                <span>Upload Document</span>
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

              <button className="qap-action-btn qap-action-view-docs" onClick={handleDocumentsView}>
                <FolderOpen size={28} />
                <span>View Documents</span>
              </button>

              <button className="qap-action-btn qap-action-details" onClick={handleViewDetails}>
                <Eye size={28} />
                <span>View Details</span>
              </button>
            </div>
          )}

          {activeView === 'upload-category' && (
            <div className="qap-destination-picker">
              <h3>What are you uploading?</h3>
              <div className="qap-destination-options">
                <button
                  className="qap-destination-btn qap-dest-qa-forms"
                  onClick={() => handleCategorySelect('qa-forms')}
                >
                  <ClipboardCheck size={32} />
                  <span className="qap-dest-label">QA Form</span>
                  <span className="qap-dest-desc">Quality assurance documents</span>
                </button>
                <button
                  className="qap-destination-btn qap-dest-job-files"
                  onClick={() => handleCategorySelect('job-files')}
                >
                  <FileText size={32} />
                  <span className="qap-dest-label">Job Files</span>
                  <span className="qap-dest-desc">Specs, drawings, documents</span>
                </button>
                <button
                  className="qap-destination-btn qap-dest-customer-property"
                  onClick={() => handleCategorySelect('customer-property')}
                >
                  <Package size={32} />
                  <span className="qap-dest-label">Customer Property</span>
                  <span className="qap-dest-desc">Customer-supplied items</span>
                </button>
              </div>
            </div>
          )}

          {activeView === 'upload-source' && (
            <div className="qap-upload-source">
              <h3>Upload to {CATEGORY_LABELS[selectedCategory]} from...</h3>
              <div className="qap-source-options">
                <button className="qap-source-btn qap-source-scanner" onClick={handleScannerView}>
                  <ScanLine size={32} />
                  <span className="qap-source-label">Scanner</span>
                  <span className="qap-source-desc">Pick from scanned files</span>
                </button>
                <button className="qap-source-btn qap-source-camera" onClick={handleCameraView}>
                  <Camera size={32} />
                  <span className="qap-source-label">Camera</span>
                  <span className="qap-source-desc">Take a photo</span>
                </button>
              </div>
            </div>
          )}

          {activeView === 'scanner' && (
            <div className="qap-scanner-view">
              <h3>Scanner Files → {CATEGORY_LABELS[selectedCategory]}</h3>
              {files.scannerLoading ? (
                <p className="qap-loading">Loading files...</p>
              ) : files.scannerFiles.length === 0 ? (
                <p className="qap-empty">No scanner files found</p>
              ) : (
                <div className="qap-file-list">
                  {files.scannerFiles.map((file) => (
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

          {activeView === 'camera' && (
            <div className="qap-camera-view">
              <div className="qap-video-container">
                <video ref={camera.videoRef} autoPlay playsInline className="qap-video" />
              </div>
              <div className="qap-camera-controls">
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
                <div className="qap-photo-strip">
                  {camera.photos.map((photo) => (
                    <div key={photo.id} className="qap-photo-thumb">
                      <img src={photo.data} alt="Captured" />
                      <button className="qap-photo-remove" onClick={() => camera.removePhoto(photo.id)}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeView === 'view-documents' && (() => {
            const tabData = getTabFiles();
            return (
              <div className="qap-documents-view">
                <div className="qap-doc-tabs">
                  {DOC_TABS.map(tab => (
                    <button
                      key={tab.key}
                      className={`qap-doc-tab ${docTab === tab.key ? 'active' : ''}`}
                      onClick={() => handleDocTabChange(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                {tabData.loading ? (
                  <p className="qap-loading">Loading files...</p>
                ) : tabData.files.length === 0 ? (
                  <p className="qap-empty">No files found</p>
                ) : (
                  <div className="qap-file-grid">
                    {tabData.files.map((file) => {
                      const key = `${tabData.source}:${file.name}`;
                      const isImage = file.mimeType?.startsWith('image/');
                      const thumb = files.thumbnails.get(key);
                      const isLoading = files.loadingFiles.has(key);
                      return (
                        <button
                          key={file.name}
                          className="qap-file-card"
                          onClick={() => files.handleViewFile(file, tabData.source)}
                          disabled={isLoading}
                          title={file.name}
                        >
                          {isImage ? (
                            thumb ? (
                              <img src={thumb} alt={file.name} className="qap-file-card-thumb" />
                            ) : (
                              <div className="qap-file-card-loading" />
                            )
                          ) : (
                            <div className="qap-file-card-icon">
                              <FileText size={32} />
                            </div>
                          )}
                          <span className="qap-file-card-name">{file.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

        </div>

        {files.lightboxPhoto && (
          <div className="qap-lightbox" onClick={files.closeLightbox}>
            <button className="qap-lightbox-close" onClick={files.closeLightbox}>
              <X size={24} />
            </button>
            <img
              src={files.lightboxPhoto}
              alt="Full size"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {files.viewerUrl && (
          <div className="qap-doc-viewer">
            <button className="qap-lightbox-close" onClick={files.closeViewer}>
              <X size={24} />
            </button>
            <iframe src={files.viewerUrl} className="qap-doc-viewer-frame" title="Document viewer" />
          </div>
        )}
      </div>

      <StopTimerForm
        isOpen={timer.showEntryForm}
        jobCard={jobCard}
        entryForm={timer.entryForm}
        onItemFieldChange={timer.handleItemFieldChange}
        onItemMachineToggle={timer.handleItemMachineToggle}
        onSubmit={handleSubmitEntryForm}
        onCancel={handleCancelEntryForm}
        loading={timer.loading}
      />

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
