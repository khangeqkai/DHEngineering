import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, FolderClosed, FileText, Image, ChevronRight, X } from 'lucide-react';
import { useJobFiles, CATEGORIES, CATEGORY_LABELS } from '../useJobFiles';
import './FilesTab.css';

export default function FilesTab({ jobCardId, attachmentWarnings = null }) {
  const [expandedFolders, setExpandedFolders] = useState(new Set(['qa-form-files']));
  const files = useJobFiles(jobCardId);

  // Load the default-expanded folder on open (others load on first expand).
  const loadFiles = files.loadFiles;
  useEffect(() => {
    loadFiles('qa-form-files');
  }, [loadFiles]);

  const expandedRef = useRef(expandedFolders);
  expandedRef.current = expandedFolders;
  const handleToggle = useCallback((category) => {
    const wasExpanded = expandedRef.current.has(category);
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
    if (!wasExpanded) loadFiles(category);
  }, [loadFiles]);

  const renderCategory = (category) => {
    const isExpanded = expandedFolders.has(category);
    const list = files.filesByCategory[category] || [];
    const loading = !!files.loadingByCategory[category];
    const count = files.counts[category];
    const FolderIcon = isExpanded ? FolderOpen : FolderClosed;

    return (
      <div key={category} className={`files-folder ${isExpanded ? 'expanded' : ''}`}>
        <button
          type="button"
          className="files-folder-header"
          onClick={() => handleToggle(category)}
        >
          <ChevronRight size={16} className="files-folder-chevron" />
          <FolderIcon size={18} className="files-folder-icon" />
          <span className="files-folder-name">{CATEGORY_LABELS[category]}</span>
          {!isExpanded && count > 0 && (
            <span className="files-folder-badge">{count}</span>
          )}
          {category === 'qa-form-files' && attachmentWarnings?.missingQaForms && (
            <span className="files-folder-warning" title="This job's quality form hasn't been generated into this folder yet">
              ⚠ Quality form missing
            </span>
          )}
        </button>

        {isExpanded && (
          <div className="files-folder-content">
            {loading ? (
              <div className="files-loading"><div className="files-loading-bar" /></div>
            ) : list.length === 0 ? (
              <p className="files-empty">No files</p>
            ) : (
              <div className="files-list">
                {list.map(file => {
                  const isImage = file.mimeType?.startsWith('image/');
                  const thumb = files.thumbnails.get(`${category}/${file.name}`);
                  const FileIcon = isImage ? Image : FileText;
                  return (
                    <button
                      key={file.name}
                      type="button"
                      className="files-item"
                      onClick={() => files.handleViewFile(file, category)}
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
  };

  return (
    <div className="files-tab">
      <div className="files-folder-list">
        {CATEGORIES.map(renderCategory)}
      </div>

      {files.lightboxPhoto && createPortal(
        <div className="files-lightbox" onClick={files.closeLightbox}>
          <button className="files-lightbox-close" onClick={files.closeLightbox}>
            <X size={24} />
          </button>
          <img src={files.lightboxPhoto} alt="Full size" onClick={(e) => e.stopPropagation()} />
        </div>,
        document.body
      )}

      {files.viewerUrl && createPortal(
        <div className="files-doc-viewer">
          <button className="files-lightbox-close" onClick={files.closeViewer}>
            <X size={24} />
          </button>
          <iframe src={files.viewerUrl} className="files-doc-viewer-frame" title="Document viewer" />
        </div>,
        document.body
      )}
    </div>
  );
}
