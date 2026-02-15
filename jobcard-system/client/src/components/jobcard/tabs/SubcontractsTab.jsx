import { useMemo } from 'react';

// Map treatment values to service tag names
const TREATMENT_TO_SERVICE_MAP = {
  'HEAT_TREATMENT': 'Heat Treatment',
  'PRECISION_GRINDING': 'Precision Grinding',
  'ANODISE': 'Anodise',
  'ELECTROPLATE': 'Electroplate',
  'BLASTING': 'Blasting',
  'POWDERCOAT': 'Powdercoat',
  'SPRAYPAINT': 'Spraypaint',
  'GALVANISE': 'Galvanise',
  'SPECIALISED_COATING': 'Specialised Coating'
};

export default function SubcontractsTab({
  subcontracts,
  showSubcontractForm,
  editingSubcontractId,
  subcontractForm,
  handleSubcontractChange,
  handleAddSubcontract,
  handleEditSubcontract,
  handleSaveSubcontract,
  handleDeleteSubcontract,
  resetSubcontractForm,
  suppliers,
  treatmentRequired
}) {
  // Sort suppliers: matching service first, then alphabetically
  const sortedSuppliers = useMemo(() => {
    const treatmentServiceName = TREATMENT_TO_SERVICE_MAP[treatmentRequired];

    if (!treatmentServiceName) {
      return suppliers;
    }

    return [...suppliers].sort((a, b) => {
      const aHasService = (a.service_tags || []).some(t => t.name === treatmentServiceName);
      const bHasService = (b.service_tags || []).some(t => t.name === treatmentServiceName);

      if (aHasService && !bHasService) return -1;
      if (!aHasService && bHasService) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [suppliers, treatmentRequired]);

  const treatmentServiceName = TREATMENT_TO_SERVICE_MAP[treatmentRequired];

  return (
    <div className="modal-form-grid">
      {/* Add/Edit Subcontract Form */}
      {showSubcontractForm && (
        <div className="form-section subcontract-form">
          <div className="form-section-header">
            <h3 className="form-section-title">
              {editingSubcontractId ? 'Edit Subcontract' : 'New Subcontract'}
            </h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={resetSubcontractForm}>
              Cancel
            </button>
          </div>

          <div className="form-group">
            <label>
              Supplier <span className="required">*</span>
              {treatmentServiceName && (
                <span className="treatment-hint"> (showing {treatmentServiceName} suppliers first)</span>
              )}
            </label>
            <select name="supplier_id" value={subcontractForm.supplier_id} onChange={handleSubcontractChange}>
              <option value="">Select supplier...</option>
              {sortedSuppliers.map(s => {
                const hasMatchingService = treatmentServiceName &&
                  (s.service_tags || []).some(t => t.name === treatmentServiceName);
                const serviceNames = (s.service_tags || []).map(t => t.name).join(', ');
                return (
                  <option key={s.id} value={s.id}>
                    {hasMatchingService ? '★ ' : ''}{s.name}{serviceNames ? ` (${serviceNames})` : ''}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Date Sent</label>
              <input type="date" name="date_sent" value={subcontractForm.date_sent} onChange={handleSubcontractChange} />
            </div>
            <div className="form-group">
              <label>Date Expected</label>
              <input type="date" name="date_expected" value={subcontractForm.date_expected} onChange={handleSubcontractChange} />
            </div>
            <div className="form-group">
              <label>Date Received</label>
              <input type="date" name="date_received" value={subcontractForm.date_received} onChange={handleSubcontractChange} />
            </div>
          </div>

          <div className="form-group">
            <label>Status</label>
            <select name="status" value={subcontractForm.status} onChange={handleSubcontractChange}>
              <option value="PENDING">Pending</option>
              <option value="SENT">Sent</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="RECEIVED">Received</option>
              <option value="COMPLETE">Complete</option>
            </select>
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea name="notes" value={subcontractForm.notes} onChange={handleSubcontractChange} rows={2} placeholder="Any notes about this subcontract..." />
          </div>

          <button type="button" className="btn btn-primary" onClick={handleSaveSubcontract}>
            {editingSubcontractId ? 'Update Subcontract' : 'Add Subcontract'}
          </button>
        </div>
      )}

      {/* Subcontracts List */}
      <div className="form-section">
        <div className="form-section-header">
          <h3 className="form-section-title" data-section="09">Subcontracts</h3>
          {!showSubcontractForm && (
            <button type="button" className="btn btn-primary btn-sm" onClick={handleAddSubcontract}>
              + Add Subcontract
            </button>
          )}
        </div>

        {subcontracts.length === 0 ? (
          <p className="empty-message">No subcontracts added yet.</p>
        ) : (
          <div className="subcontracts-list">
            {subcontracts.map(sub => (
              <div key={sub.id} className="subcontract-card">
                <div className="subcontract-header">
                  <span className="supplier-name">{sub.supplier_name}</span>
                  <span className={`badge badge-${sub.status?.toLowerCase()}`}>{sub.status}</span>
                </div>
                <div className="subcontract-dates">
                  <span>Sent: {sub.date_sent || '-'}</span>
                  <span>Expected: {sub.date_expected || '-'}</span>
                  <span>Received: {sub.date_received || '-'}</span>
                </div>
                {sub.notes && <div className="subcontract-notes">{sub.notes}</div>}
                <div className="subcontract-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleEditSubcontract(sub)}>Edit</button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteSubcontract(sub.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
