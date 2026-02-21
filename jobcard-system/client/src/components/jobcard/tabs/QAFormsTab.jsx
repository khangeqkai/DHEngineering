import { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../../services/api';

export default function QAFormsTab({ formData, qaForms, jobCardId }) {
  const [loadingFormId, setLoadingFormId] = useState(null);

  const fetchFile = async (form) => {
    const files = await api.getQaDocumentFiles(jobCardId);
    const matchingFile = (files || []).find(f => {
      const nameWithoutExt = f.name.replace(/\.[^.]+$/, '');
      return nameWithoutExt.toLowerCase() === form.formCode.toLowerCase();
    });
    if (!matchingFile) return null;
    const fileData = await api.getQaDocumentFileData(jobCardId, matchingFile.name);
    if (!fileData?.data) return null;
    return { blob: base64ToBlob(fileData.data, fileData.mimeType || 'application/pdf'), mimeType: fileData.mimeType };
  };

  const handleView = async (form) => {
    if (!jobCardId) return;
    setLoadingFormId(form.id);
    try {
      const result = await fetchFile(form);
      if (result) {
        const url = URL.createObjectURL(result.blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        toast.error('Document not found in QA Documents folder');
      }
    } catch {
      toast.error('Failed to load document');
    } finally {
      setLoadingFormId(null);
    }
  };

  const handlePrint = async (form) => {
    if (!jobCardId) return;
    setLoadingFormId(form.id);
    try {
      const result = await fetchFile(form);
      if (result) {
        const url = URL.createObjectURL(result.blob);
        const printWindow = window.open(url, '_blank');
        if (printWindow) {
          printWindow.addEventListener('load', () => {
            printWindow.print();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
          });
        } else {
          URL.revokeObjectURL(url);
        }
      } else {
        toast.error('Document not found in QA Documents folder');
      }
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
                    <>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => handleView(form)}
                        disabled={loadingFormId === form.id}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => handlePrint(form)}
                        disabled={loadingFormId === form.id}
                      >
                        Print
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function base64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}
