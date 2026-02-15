export default function QAFormsTab({ formData, qaForms }) {
  return (
    <div className="modal-form-grid">
      <div className="form-section">
        <h3 className="form-section-title" data-section="QA">QA Forms & Documents</h3>

        {formData.qualityLevel === 'CRITICAL' && (
          <div className="critical-qa-notice">
            This is a Critical QA job - all forms must be completed before invoicing
          </div>
        )}

        <div className="qa-forms-list">
          {/* DHE-F39 */}
          <div className="qa-form-row">
            <div className="qa-form-info">
              <span className="qa-form-code">DHE-F39</span>
              <span className="qa-form-name">Critical Parts Inspection & Test Plan</span>
            </div>
            <div className="qa-form-actions">
              <button type="button" className="btn btn-secondary btn-sm">Print</button>
              <span className={`qa-status ${qaForms.find(f => f.formCode === 'DHE-F39')?.status === 'SCANNED' ? 'status-complete' : 'status-pending'}`}>
                {qaForms.find(f => f.formCode === 'DHE-F39')?.status === 'SCANNED' ? 'Scanned' : 'Pending'}
              </span>
            </div>
          </div>

          {/* DHE-F15 */}
          <div className="qa-form-row">
            <div className="qa-form-info">
              <span className="qa-form-code">DHE-F15</span>
              <span className="qa-form-name">Inwards Goods Inspection Sticker</span>
            </div>
            <div className="qa-form-actions">
              <span className={`qa-status ${qaForms.find(f => f.formCode === 'DHE-F15')?.status === 'SCANNED' ? 'status-complete' : 'status-pending'}`}>
                {qaForms.find(f => f.formCode === 'DHE-F15')?.status === 'SCANNED' ? 'Scanned' : 'Pending'}
              </span>
            </div>
          </div>

          {/* DHE-F09 */}
          <div className="qa-form-row">
            <div className="qa-form-info">
              <span className="qa-form-code">DHE-F09</span>
              <span className="qa-form-name">Inspection Report</span>
            </div>
            <div className="qa-form-actions">
              <button type="button" className="btn btn-secondary btn-sm">Print</button>
              <span className={`qa-status ${qaForms.find(f => f.formCode === 'DHE-F09')?.status === 'SCANNED' ? 'status-complete' : 'status-pending'}`}>
                {qaForms.find(f => f.formCode === 'DHE-F09')?.status === 'SCANNED' ? 'Scanned' : 'Pending'}
              </span>
            </div>
          </div>

          {/* DHE-F43 */}
          <div className="qa-form-row">
            <div className="qa-form-info">
              <span className="qa-form-code">DHE-F43</span>
              <span className="qa-form-name">Hazard, Incident, Non-Conformance & Customer Complaint</span>
            </div>
            <div className="qa-form-actions">
              <button type="button" className="btn btn-secondary btn-sm">Print</button>
              <span className={`qa-status ${qaForms.find(f => f.formCode === 'DHE-F43')?.status === 'SCANNED' ? 'status-complete' : 'status-pending'}`}>
                {qaForms.find(f => f.formCode === 'DHE-F43')?.status === 'SCANNED' ? 'Scanned' : 'Pending'}
              </span>
            </div>
          </div>
        </div>

        <div className="qa-procedure-section">
          <h4>Procedure Reference</h4>
          <div className="qa-form-row">
            <div className="qa-form-info">
              <span className="qa-form-code">DHE-P06</span>
              <span className="qa-form-name">Quality Procedure</span>
            </div>
            <div className="qa-form-actions">
              <button type="button" className="btn btn-secondary btn-sm">View</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
