import { useMemo } from 'react';
import { capitalizeFirst, autoResize } from '../../../utils/formatters';
import SearchableSupplierSelect from '../../common/SearchableSupplierSelect';

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
  lineItems
}) {
  // Aggregate all unique treatment values from line items
  const treatmentValues = useMemo(() => {
    if (!lineItems || lineItems.length === 0) return [];
    const allValues = lineItems.flatMap(item =>
      (item.treatment || '').split(',').filter(v => v && v !== 'NONE' && v !== 'OTHER')
    );
    return [...new Set(allValues)];
  }, [lineItems]);

  // Sort suppliers: matching any treatment tag first, then alphabetically
  // Since treatment tags and supplier service tags are now from the same unified tags table,
  // we match by tag value (e.g. 'HEAT_TREATMENT') against supplier serviceTags
  const sortedSuppliers = useMemo(() => {
    if (treatmentValues.length === 0) {
      return suppliers;
    }

    return [...suppliers].sort((a, b) => {
      const aHasService = (a.serviceTags || []).some(t => treatmentValues.includes(t.value));
      const bHasService = (b.serviceTags || []).some(t => treatmentValues.includes(t.value));

      if (aHasService && !bHasService) return -1;
      if (!aHasService && bHasService) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [suppliers, treatmentValues]);

  const treatmentServiceName = treatmentValues.length > 0
    ? treatmentValues.map(v => v.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')).join(', ')
    : null;

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
            <SearchableSupplierSelect
              suppliers={sortedSuppliers}
              value={subcontractForm.supplierId}
              onChange={(id, name) => {
                handleSubcontractChange({ target: { name: 'supplierId', value: id } });
                handleSubcontractChange({ target: { name: 'supplierName', value: name } });
              }}
              treatmentServiceName={treatmentServiceName}
              placeholder="Search supplier..."
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Date Sent</label>
              <input type="date" name="dateSent" value={subcontractForm.dateSent} onChange={handleSubcontractChange} />
            </div>
            <div className="form-group">
              <label>Date Expected</label>
              <input type="date" name="dateExpected" value={subcontractForm.dateExpected} onChange={handleSubcontractChange} />
            </div>
            <div className="form-group">
              <label>Date Received</label>
              <input type="date" name="dateReceived" value={subcontractForm.dateReceived} onChange={handleSubcontractChange} />
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
            <textarea
              ref={(el) => { if (el) autoResize(el); }}
              onInput={(e) => autoResize(e.target)}
              name="notes"
              value={subcontractForm.notes}
              onChange={handleSubcontractChange}
              onBlur={(e) => {
                const formatted = capitalizeFirst(e.target.value);
                if (formatted !== e.target.value) {
                  handleSubcontractChange({ target: { name: 'notes', value: formatted } });
                }
              }}
              rows={2}
              placeholder=""
            />
          </div>

          <button type="button" className="btn btn-primary" onClick={handleSaveSubcontract}>
            {editingSubcontractId ? 'Update' : 'Add'}
          </button>
        </div>
      )}

      {/* Subcontracts List */}
      <div className="form-section">
        <div className="form-section-header">
          <h3 className="form-section-title">Subcontracts</h3>
          {!showSubcontractForm && (
            <button type="button" className="btn btn-primary btn-sm" onClick={handleAddSubcontract}>
              + Add Subcontract
            </button>
          )}
        </div>

        {subcontracts.length === 0 ? (
          <p className="empty-message">No subcontracts</p>
        ) : (
          <div className="subcontracts-list">
            {subcontracts.map(sub => (
              <div key={sub.id} className="subcontract-card">
                <div className="subcontract-header">
                  <span className="supplier-name">{sub.supplierName}</span>
                  <span className={`badge badge-${sub.status?.toLowerCase()}`}>{sub.status}</span>
                </div>
                <div className="subcontract-dates">
                  <span>Sent: {sub.dateSent || '-'}</span>
                  <span>Expected: {sub.dateExpected || '-'}</span>
                  <span>Received: {sub.dateReceived || '-'}</span>
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
