import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import { api } from '../../../services/api';

function base64ToBlob(base64, mimeType = 'application/pdf') {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
}

export default function QAFormsTab({ formData, qaForms, jobCardId }) {
  const [loadingFormId, setLoadingFormId] = useState(null);
  const [viewerUrl, setViewerUrl] = useState(null);

  const closeViewer = useCallback(() => {
    setViewerUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
  }, []);

  useEffect(() => {
    if (!viewerUrl) return;
    const handleKeyDown = (e) => { if (e.key === 'Escape') closeViewer(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [viewerUrl, closeViewer]);

  const handleView = async (form) => {
    if (!jobCardId) return;
    setLoadingFormId(form.id);
    try {
      const files = await api.getQaDocumentFiles(jobCardId);
      const matchingFile = (files || []).find(f => {
        const nameWithoutExt = f.name.replace(/\.[^.]+$/, '');
        return nameWithoutExt.toLowerCase() === form.formCode.toLowerCase();
      });
      if (!matchingFile) {
        toast.error('Document not found in QA Documents folder');
        return;
      }
      const fileData = await api.getQaDocumentFileData(jobCardId, matchingFile.name);
      if (!fileData?.data) {
        toast.error('Document not found in QA Documents folder');
        return;
      }
      const blob = base64ToBlob(fileData.data, fileData.mimeType || 'application/pdf');
      setViewerUrl(URL.createObjectURL(blob));
    } catch {
      toast.error('Failed to load document');
    } finally {
      setLoadingFormId(null);
    }
  };

  if (!formData.qaLevelId) {
    return (
      <div className="modal-form-grid">
        <div className="form-section">
          <h3 className="form-section-title">QA Forms</h3>
          <div className="empty-state" style={{ padding: '1rem 0' }}>
            No QA level assigned to this job
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-form-grid">
      <div className="form-section">
        <h3 className="form-section-title">QA Forms</h3>

        {qaForms.length === 0 ? (
          <div className="empty-state" style={{ padding: '1rem 0' }}>
            No templates configured for this QA level. Save the job card to generate QA forms.
          </div>
        ) : (
          <div className="qa-forms-list">
            {qaForms.map(form => (
              <div key={form.id || form.formCode} className="qa-form-row">
                <div className="qa-form-info">
                  <span className="qa-form-code">{form.formCode}</span>
                  <span className="qa-form-name">{form.formName}</span>
                </div>
                <div className="qa-form-actions">
                  {jobCardId && (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => handleView(form)}
                      disabled={loadingFormId === form.id}
                    >
                      View
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewerUrl && createPortal(
        <div className="qap-doc-viewer">
          <button className="qap-lightbox-close" onClick={closeViewer}>
            <X size={24} />
          </button>
          <iframe src={viewerUrl} className="qap-doc-viewer-frame" title="Document viewer" />
        </div>,
        document.body
      )}
    </div>
  );
}
