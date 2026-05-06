import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, FolderClosed, FileText, Image, ChevronRight, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../../services/api';
import { CATEGORIES, CATEGORY_LABELS } from '../useJobFiles';
import './FilesTab.css';

const THUMBNAIL_CAP = 12;

function base64ToBlob(base64, mimeType) {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mimeType || 'application/pdf' });
}

export default function FilesTab({ jobCardId }) {
  const [expandedFolders, setExpandedFolders] = useState(new Set(['qa-form-files']));
  const [filesByCategory, setFilesByCategory] = useState({});
  const [loadingByCategory, setLoadingByCategory] = useState({});
  const [thumbnails, setThumbnails] = useState(new Map());
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [viewerUrl, setViewerUrl] = useState(null);
  const viewerUrlRef = useRef(null);

  const loadCategory = useCallback(async (category) => {
    setLoadingByCategory(prev => ({ ...prev, [category]: true }));
    try {
      const list = await api.listJobcardFiles(jobCardId, category);
      setFilesByCategory(prev => ({ ...prev, [category]: list || [] }));
      setLoadingByCategory(prev => ({ ...prev, [category]: false }));

      // Lazy thumbnail load (off the loading path so the file list renders immediately)
      const imageFiles = (list || []).filter(f => f.mimeType?.startsWith('image/')).slice(0, THUMBNAIL_CAP);
      for (const file of imageFiles) {
        try {
          const data = await api.getJobcardFile(jobCardId, category, file.name);
          if (data?.data) {
            setThumbnails(prev => {
              const next = new Map(prev);
              next.set(`${category}/${file.name}`, `data:${data.mimeType || 'image/jpeg'};base64,${data.data}`);
              return next;
            });
          }
        } catch {}
      }
    } catch (err) {
      toast.error(err.message || `Failed to load ${CATEGORY_LABELS[category]}`);
      setFilesByCategory(prev => ({ ...prev, [category]: [] }));
      setLoadingByCategory(prev => ({ ...prev, [category]: false }));
    }
  }, [jobCardId]);

  useEffect(() => {
    loadCategory('qa-form-files');
  }, [loadCategory]);

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
    if (!wasExpanded) loadCategory(category);
  }, [loadCategory]);

  const handleViewFile = useCallback(async (category, file) => {
    const cachedThumb = file.mimeType?.startsWith('image/') ? thumbnails.get(`${category}/${file.name}`) : null;
    if (cachedThumb) {
      setLightboxPhoto(cachedThumb);
      return;
    }
    try {
      const data = await api.getJobcardFile(jobCardId, category, file.name);
      if (!data?.data) return toast.error('Failed to load file data');
      if (data.mimeType?.startsWith('image/')) {
        setLightboxPhoto(`data:${data.mimeType};base64,${data.data}`);
      } else {
        const blob = base64ToBlob(data.data, data.mimeType);
        const url = URL.createObjectURL(blob);
        if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current);
        viewerUrlRef.current = url;
        setViewerUrl(url);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to view file');
    }
  }, [jobCardId, thumbnails]);

  const closeViewer = useCallback(() => {
    if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current);
    viewerUrlRef.current = null;
    setViewerUrl(null);
  }, []);

  useEffect(() => {
    return () => { if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current); };
  }, []);

  const renderCategory = (category) => {
    const isExpanded = expandedFolders.has(category);
    const list = filesByCategory[category] || [];
    const loading = !!loadingByCategory[category];
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
          {!isExpanded && list.length > 0 && (
            <span className="files-folder-badge">{list.length}</span>
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
                  const thumb = thumbnails.get(`${category}/${file.name}`);
                  const FileIcon = isImage ? Image : FileText;
                  return (
                    <button
                      key={file.name}
                      type="button"
                      className="files-item"
                      onClick={() => handleViewFile(category, file)}
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

      {lightboxPhoto && createPortal(
        <div className="files-lightbox" onClick={() => setLightboxPhoto(null)}>
          <button className="files-lightbox-close" onClick={() => setLightboxPhoto(null)}>
            <X size={24} />
          </button>
          <img src={lightboxPhoto} alt="Full size" onClick={(e) => e.stopPropagation()} />
        </div>,
        document.body
      )}

      {viewerUrl && createPortal(
        <div className="files-doc-viewer">
          <button className="files-lightbox-close" onClick={closeViewer}>
            <X size={24} />
          </button>
          <iframe src={viewerUrl} className="files-doc-viewer-frame" title="Document viewer" />
        </div>,
        document.body
      )}
    </div>
  );
}
