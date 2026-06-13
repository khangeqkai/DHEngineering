import { useRef } from 'react';

export default function JobCardTemplateCard({ s }) {
  const fileRef = useRef(null);
  const current = s.jobCardTemplate;
  const hasTemplate = !!(current && current.fileName);

  const onPick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) s.handleUploadJobCardTemplate(file);
  };

  return (
    <div className="card full-width">
      <div className="card-header">
        <h2>Job Card Printout</h2>
      </div>
      <div className="card-body">
        <div className="setting-item">
          <div className="setting-info">
            <div className="setting-label">Printout Template</div>
            <div className="setting-description">
              Upload one fillable PDF used to print a summary of any job. When someone prints a job card, this template is filled with that job's details (job number, customer, line items and so on) and saved into that job's folder. It is just a printout — it is never counted as a missing file before invoicing.
            </div>
          </div>
        </div>
        <div className="folder-input-group">
          <input
            type="text"
            className="form-control"
            value={hasTemplate ? current.fileName : 'None configured'}
            readOnly
          />
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={onPick}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => fileRef.current?.click()}
            disabled={s.uploadingTemplate}
          >
            {s.uploadingTemplate ? 'Saving...' : (hasTemplate ? 'Replace...' : 'Upload...')}
          </button>
          {hasTemplate && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={s.handleRemoveJobCardTemplate}
              disabled={s.uploadingTemplate}
            >
              Remove
            </button>
          )}
        </div>
        {hasTemplate && !current.exists && (
          <div className="setting-description" style={{ color: 'var(--danger, #c0392b)', marginTop: '8px' }}>
            The template file is missing from disk. Upload it again.
          </div>
        )}
      </div>
    </div>
  );
}
