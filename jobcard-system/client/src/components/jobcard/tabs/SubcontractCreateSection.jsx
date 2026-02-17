export default function SubcontractCreateSection({ subcontracts, setSubcontracts, suppliers }) {
  const addSubcontract = () => {
    setSubcontracts([...subcontracts, {
      id: Date.now(),
      supplierId: '',
      supplierName: '',
      dateSent: '',
      dateExpected: '',
      status: 'PENDING',
      notes: '',
      isNew: true
    }]);
  };

  const updateField = (idx, field, value) => {
    const updated = [...subcontracts];
    updated[idx] = { ...subcontracts[idx], [field]: value };
    setSubcontracts(updated);
  };

  return (
    <div className="form-section">
      <div className="form-section-header">
        <h3 className="form-section-title">Subcontracts</h3>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addSubcontract}>
          + Add
        </button>
      </div>
      {subcontracts.length === 0 ? (
        <p className="empty-state">No subcontracts</p>
      ) : (
        <div className="subcontracts-create-list">
          {subcontracts.map((sub, idx) => (
            <div key={sub.id} className="subcontract-create-item">
              {sub.isNew ? (
                <>
                  <div className="subcontract-create-top">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Supplier <span className="required">*</span></label>
                      <select
                        value={sub.supplierId}
                        onChange={(e) => {
                          const supplier = suppliers.find(s => s.id === e.target.value);
                          const updated = [...subcontracts];
                          updated[idx] = {
                            ...sub,
                            supplierId: e.target.value,
                            supplierName: supplier?.name || ''
                          };
                          setSubcontracts(updated);
                        }}
                      >
                        <option value="">Select supplier...</option>
                        {suppliers.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      className="btn-icon danger subcontract-remove"
                      onClick={() => setSubcontracts(subcontracts.filter(s => s.id !== sub.id))}
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                  <div className="subcontract-create-dates">
                    <div className="form-group">
                      <label>Date Sent</label>
                      <input
                        type="date"
                        value={sub.dateSent}
                        onChange={(e) => updateField(idx, 'dateSent', e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label>Date Expected</label>
                      <input
                        type="date"
                        value={sub.dateExpected}
                        onChange={(e) => updateField(idx, 'dateExpected', e.target.value)}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="subcontract-display">
                  <div className="subcontract-header">
                    <strong>{sub.supplierName}</strong>
                    <span className={`badge badge-${sub.status?.toLowerCase() || 'pending'}`}>
                      {sub.status || 'PENDING'}
                    </span>
                  </div>
                  <div className="subcontract-dates">
                    {sub.dateSent?.trim() && <span>Sent: {new Date(sub.dateSent + 'T00:00:00').toLocaleDateString()}</span>}
                    {sub.dateExpected?.trim() && <span>Expected: {new Date(sub.dateExpected + 'T00:00:00').toLocaleDateString()}</span>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
