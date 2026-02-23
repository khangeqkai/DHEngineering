import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, FolderClosed, FileText, Image, ChevronRight, X } from 'lucide-react';
import { useQuickActionFiles } from '../useQuickActionFiles';
import './FilesTab.css';

const FOLDERS = [
  { key: 'qa-forms', label: 'QA Forms' },
  { key: 'job-files', label: 'Job Files' },
  { key: 'customer-property', label: 'Customer Property' }
];

export default function FilesTab({ jobCardId }) {
  const jobCard = useMemo(() => ({ id: jobCardId }), [jobCardId]);
  const files = useQuickActionFiles(jobCard);
  const [expandedFolders, setExpandedFolders] = useState(new Set());

  const { loadQaFormFiles, loadJobFiles, loadCustomerPropertyFiles } = files;

  const loadFolder = useCallback((key) => {
    if (key === 'qa-forms') loadQaFormFiles();
    else if (key === 'job-files') loadJobFiles();
    else loadCustomerPropertyFiles();
  }, [loadQaFormFiles, loadJobFiles, loadCustomerPropertyFiles]);

  const expandedRef = useRef(expandedFolders);
  expandedRef.current = expandedFolders;

  const handleToggle = useCallback((key) => {
    const wasExpanded = expandedRef.current.has(key);
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    if (!wasExpanded) loadFolder(key);
  }, [loadFolder]);

  // Auto-expand first folder on mount
  useEffect(() => {
    setExpandedFolders(new Set(['qa-forms']));
    loadQaFormFiles();
  }, [loadQaFormFiles]);

  const getFolderData = (key) => {
    if (key === 'qa-forms') return { files: files.qaFormFiles, loading: files.qaFormFilesLoading };
    if (key === 'job-files') return { files: files.jobFiles, loading: files.jobFilesLoading };
    return { files: files.customerPropertyFiles, loading: files.customerPropertyLoading };
  };

  return (
    <div className="files-tab">
      <div className="files-folder-list">
        {FOLDERS.map(folder => {
          const isExpanded = expandedFolders.has(folder.key);
          const data = getFolderData(folder.key);
          const fileCount = data.files.length;
          const FolderIcon = isExpanded ? FolderOpen : FolderClosed;

          return (
            <div key={folder.key} className={`files-folder ${isExpanded ? 'expanded' : ''}`}>
              <button
                type="button"
                className="files-folder-header"
                onClick={() => handleToggle(folder.key)}
              >
                <ChevronRight size={16} className="files-folder-chevron" />
                <FolderIcon size={18} className="files-folder-icon" />
                <span className="files-folder-name">{folder.label}</span>
                {!isExpanded && fileCount > 0 && (
                  <span className="files-folder-badge">{fileCount}</span>
                )}
              </button>

              {isExpanded && (
                <div className="files-folder-content">
                  {data.loading ? (
                    <div className="files-loading">
                      <div className="files-loading-bar" />
                    </div>
                  ) : data.files.length === 0 ? (
                    <p className="files-empty">No files</p>
                  ) : (
                    <div className="files-list">
                      {data.files.map((file) => {
                        const key = `${folder.key}:${file.name}`;
                        const isImage = file.mimeType?.startsWith('image/');
                        const thumb = files.thumbnails.get(key);
                        const isLoading = files.loadingFiles.has(key);
                        const FileIcon = isImage ? Image : FileText;

                        return (
                          <button
                            key={file.name}
                            type="button"
                            className="files-item"
                            onClick={() => files.handleViewFile(file, folder.key)}
                            disabled={isLoading}
                            title={file.name}
                          >
                            <div className="files-item-preview">
                              {isImage && thumb ? (
                                <img src={thumb} alt={file.name} className="files-item-thumb" />
                              ) : (
                                <FileIcon size={18} />
                              )}
                            </div>
                            <span className="files-item-name">{file.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {files.lightboxPhoto && createPortal(
        <div className="qap-lightbox" onClick={files.closeLightbox}>
          <button className="qap-lightbox-close" onClick={files.closeLightbox}>
            <X size={24} />
          </button>
          <img
            src={files.lightboxPhoto}
            alt="Full size"
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body
      )}

      {files.viewerUrl && createPortal(
        <div className="qap-doc-viewer">
          <button className="qap-lightbox-close" onClick={files.closeViewer}>
            <X size={24} />
          </button>
          <iframe src={files.viewerUrl} className="qap-doc-viewer-frame" title="Document viewer" />
        </div>,
        document.body
      )}
    </div>
  );
}
