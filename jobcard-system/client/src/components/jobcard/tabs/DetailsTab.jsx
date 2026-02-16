import {
  JOB_TYPES,
  PRIORITY_OPTIONS,
  DRAWINGS_TYPES,
  TREATMENT_OPTIONS,
  CUSTOMER_PROPERTY_OPTIONS,
  STATUS_OPTIONS
} from '../constants';
import { formatFileSize, formatFileDate } from '../mappers';
import { toTitleCase, capitalizeFirst } from '../../../utils/formatters';

export default function DetailsTab({
  isEdit,
  jobNumber,
  formData,
  setFormData,
  handleChange,
  contact,
  contactFormData,
  handleContactFieldChange,
  selectContact,
  clearContact,
  contacts,
  showContactDropdown,
  setShowContactDropdown,
  contactSearchRef,
  contactSearch,
  setContactSearch,
  employees,
  assignees,
  toggleAssignee,
  lineItems,
  addLineItem,
  updateLineItem,
  removeLineItem,
  subcontracts,
  setSubcontracts,
  suppliers,
  showScannerFiles,
  toggleScannerFiles,
  scannerFiles,
  loadingScannerFiles,
  isOverdue
}) {
  const titleCaseBlur = (field, setter) => (e) => {
    const formatted = toTitleCase(e.target.value);
    if (formatted !== e.target.value) setter(field, formatted);
  };

  const capitalizeBlur = (field) => (e) => {
    const formatted = capitalizeFirst(e.target.value);
    if (formatted !== e.target.value) setFormData(prev => ({ ...prev, [field]: formatted }));
  };

  return (
    <div className="modal-form-grid">
      {/* Header Info - Edit mode shows job number */}
      {isEdit && (
        <div className="form-section header-section">
          <div className="job-header">
            <div className="job-number-display">
              <span className="label">Job Card / Quote</span>
              <span className="value">{jobNumber}</span>
            </div>
          </div>
        </div>
      )}

      {/* Status & Type Row */}
      <div className="form-section">
        <h3 className="form-section-title">Classification</h3>
        <div className="form-row">
          {/* Job number input - only in create mode (edit mode shows in header) */}
          {!isEdit && (
            <div className="form-group">
              <label>Job Card / Quote <span className="required">*</span></label>
              <input
                type="text"
                name="jobNumber"
                value={formData.jobNumber}
                onChange={handleChange}
                placeholder="Enter job number..."
                className={!formData.jobNumber?.trim() ? 'field-required' : ''}
              />
            </div>
          )}
          <div className="form-group">
            <label>Status</label>
            <select name="status" value={formData.status} onChange={handleChange}>
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Priority</label>
            <select name="priority" value={formData.priority} onChange={handleChange} className={formData.priority === 'HIGH' ? 'priority-high' : ''}>
              {PRIORITY_OPTIONS.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-row" style={{ marginTop: '0.75rem' }}>
          <div className="form-group checkbox-group">
            <label className="checkbox-inline">
              <input
                type="checkbox"
                name="isRepeatJob"
                checked={formData.isRepeatJob}
                onChange={handleChange}
              />
              Repeat Job
            </label>
          </div>
          {formData.isRepeatJob && (
            <div className="form-group" style={{ flex: 2 }}>
              <label>Previous Job Reference <span className="required">*</span></label>
              <input
                type="text"
                name="repeatJobReference"
                value={formData.repeatJobReference}
                onChange={handleChange}
                placeholder="JC-XXXXXXXX-XXX"
                className={formData.isRepeatJob && !formData.repeatJobReference ? 'field-required' : ''}
              />
            </div>
          )}
        </div>
      </div>

      {/* Contact Section - Phone Contacts Style */}
      <div className="form-section">
        <h3 className="form-section-title">Contact <span className="required">*</span></h3>

        {contact ? (
          <div className="contact-chip-container">
            <div className="contact-chip">
              <div className="contact-chip-info">
                <span className="contact-chip-name">{contact.contactName}</span>
                {contact.companyName && (
                  <span className="contact-chip-company">{contact.companyName}</span>
                )}
              </div>
              <button type="button" className="contact-chip-change" onClick={clearContact}>
                Change
              </button>
            </div>
          </div>
        ) : (
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }} ref={contactSearchRef}>
              <label>Find Existing Contact</label>
              <div className="autocomplete-container">
                <input
                  type="text"
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  onFocus={() => contacts.length > 0 && setShowContactDropdown(true)}
                  placeholder="Search by name or company..."
                />
                {showContactDropdown && contacts.length > 0 && (
                  <div className="customer-dropdown">
                    {contacts.map(c => (
                      <div key={c.id} className="customer-option" onClick={() => selectContact(c)}>
                        <strong>{c.contactName}</strong>
                        {c.companyName && <span className="company-name"> ({c.companyName})</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="contact-fields-inline">
          <p className="field-note">
            {contact ? 'Contact details for this job (editable):' : 'Or enter new contact details:'}
          </p>
          <div className="form-row">
            <div className="form-group">
              <label>Contact Name <span className="required">*</span></label>
              <input
                type="text"
                value={contactFormData.contactName}
                onChange={(e) => handleContactFieldChange('contactName', e.target.value)}
                onBlur={titleCaseBlur('contactName', handleContactFieldChange)}
                placeholder="Contact person..."
                className={!contactFormData.contactName.trim() ? 'field-required' : ''}
              />
            </div>
            <div className="form-group">
              <label>Company</label>
              <input
                type="text"
                value={contactFormData.companyName}
                onChange={(e) => handleContactFieldChange('companyName', e.target.value)}
                onBlur={titleCaseBlur('companyName', handleContactFieldChange)}
                placeholder="Company name..."
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Phone</label>
              <input
                type="text"
                value={contactFormData.phone}
                onChange={(e) => handleContactFieldChange('phone', e.target.value)}
                placeholder="Phone number..."
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={contactFormData.email}
                onChange={(e) => handleContactFieldChange('email', e.target.value)}
                placeholder="Email address..."
              />
            </div>
          </div>
        </div>
      </div>

      {/* Job Details Section */}
      <div className="form-section">
        <h3 className="form-section-title">Job Details</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Quality Level</label>
            <select name="qualityLevel" value={formData.qualityLevel} onChange={handleChange}>
              <option value="STANDARD">Standard</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>
          <div className="form-group">
            <label>Job Type <span className="required">*</span></label>
            <select name="jobType" value={formData.jobType} onChange={handleChange} className={!formData.jobType ? 'field-required' : ''}>
              <option value="">Select job type...</option>
              {JOB_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* References */}
      <div className="form-section">
        <h3 className="form-section-title">References</h3>
        <div className="form-row">
          <div className="form-group">
            <label>PO Number</label>
            <input type="text" name="poNumber" value={formData.poNumber} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Quote Reference</label>
            <input type="text" name="quoteReference" value={formData.quoteReference} onChange={handleChange} placeholder="QT-XXXXXXXX-XXX" />
          </div>
        </div>
        <div className="form-group">
          <label>Drawings</label>
          <div className="checkbox-grid">
            {DRAWINGS_TYPES.filter(d => d.value !== 'NONE').map(opt => {
              const values = formData.drawingsType ? formData.drawingsType.split(',') : [];
              const isChecked = values.includes(opt.value);
              return (
                <label key={opt.value} className={`checkbox-chip ${isChecked ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      const current = formData.drawingsType ? formData.drawingsType.split(',').filter(v => v && v !== 'NONE') : [];
                      const updated = e.target.checked
                        ? [...current, opt.value]
                        : current.filter(v => v !== opt.value);
                      setFormData(prev => ({ ...prev, drawingsType: updated.length ? updated.join(',') : 'NONE' }));
                    }}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={toggleScannerFiles}
            style={{ marginTop: '0.75rem' }}
          >
            {showScannerFiles ? 'Hide Scanner Files' : 'Browse Scanner Files'}
          </button>
          {showScannerFiles && (
            <div className="scanner-files-container">
              {loadingScannerFiles ? (
                <p className="scanner-files-loading">Loading files...</p>
              ) : scannerFiles.length === 0 ? (
                <p className="scanner-files-empty">No scanned files found. Configure scanner folder in Settings.</p>
              ) : (
                <div className="scanner-files-list">
                  {scannerFiles.map((file, idx) => (
                    <div key={idx} className="scanner-file-item">
                      <div className="scanner-file-icon">
                        {file.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'IMG'}
                      </div>
                      <div className="scanner-file-info">
                        <div className="scanner-file-name" title={file.name}>{file.name}</div>
                        <div className="scanner-file-meta">
                          {formatFileSize(file.size)} - {formatFileDate(file.modified)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Due Date <span className="required">*</span></label>
            <input
              type="date"
              name="dueDate"
              value={formData.dueDate}
              onChange={handleChange}
              className={`${isOverdue ? 'overdue' : ''} ${!formData.dueDate ? 'field-required' : ''}`}
            />
            {isOverdue && <span className="overdue-text">OVERDUE</span>}
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="form-section">
        <h3 className="form-section-title">Description</h3>
        <div className="form-group">
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            onBlur={capitalizeBlur('description')}
            rows={3}
            placeholder="Job description..."
          />
        </div>
        <div className="form-group">
          <label>Customer Property</label>
          <div className="checkbox-grid">
            {CUSTOMER_PROPERTY_OPTIONS.filter(o => o.value !== 'NONE').map(opt => {
              const values = formData.customerProperty ? formData.customerProperty.split(',') : [];
              const isChecked = values.includes(opt.value);
              return (
                <label key={opt.value} className={`checkbox-chip ${isChecked ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      const current = formData.customerProperty ? formData.customerProperty.split(',').filter(v => v) : [];
                      const updated = e.target.checked
                        ? [...current, opt.value]
                        : current.filter(v => v !== opt.value);
                      setFormData(prev => ({ ...prev, customerProperty: updated.join(',') }));
                    }}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* Line Items - Create mode only */}
      {!isEdit && (
        <div className="form-section">
          <div className="form-section-header">
            <h3 className="form-section-title">Line Items <span className="required">*</span></h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addLineItem}>+ Add</button>
          </div>
          {lineItems.map((item) => (
            <div key={item.id} className="line-item-row">
              <span className="item-num">#{item.itemNumber}</span>
              <input
                type="text"
                placeholder="Qty"
                value={item.qty}
                onChange={(e) => updateLineItem(item.id, 'qty', e.target.value)}
                style={{ width: '80px' }}
              />
              <input
                type="text"
                placeholder="Description"
                value={item.description}
                onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                onBlur={(e) => {
                  const f = capitalizeFirst(e.target.value);
                  if (f !== e.target.value) updateLineItem(item.id, 'description', f);
                }}
                style={{ flex: 1 }}
              />
              {lineItems.length > 1 && (
                <button type="button" className="btn-icon danger" onClick={() => removeLineItem(item.id)}>×</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Assignees */}
      <div className="form-section">
        <h3 className="form-section-title">Assignees</h3>
        <div className="assignees-grid">
          {employees.map(emp => {
            const isAssigned = assignees.some(a => a.userId === emp.id);
            return (
              <label key={emp.id} className={`assignee-chip ${isAssigned ? 'selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={isAssigned}
                  onChange={() => toggleAssignee(emp)}
                />
                {emp.name || emp.username}
              </label>
            );
          })}
        </div>
      </div>

      {/* Treatment */}
      <div className="form-section">
        <h3 className="form-section-title">Treatment</h3>
        <div className="form-group">
          <label>Treatment Required</label>
          <div className="checkbox-grid">
            {TREATMENT_OPTIONS.filter(o => o.value !== 'NONE').map(opt => {
              const values = formData.treatmentRequired ? formData.treatmentRequired.split(',') : [];
              const isChecked = values.includes(opt.value);
              return (
                <label key={opt.value} className={`checkbox-chip ${isChecked ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      const current = formData.treatmentRequired ? formData.treatmentRequired.split(',').filter(v => v && v !== 'NONE') : [];
                      const updated = e.target.checked
                        ? [...current, opt.value]
                        : current.filter(v => v !== opt.value);
                      setFormData(prev => ({ ...prev, treatmentRequired: updated.length ? updated.join(',') : 'NONE' }));
                    }}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
          {formData.treatmentRequired?.includes('OTHER') && (
            <input
              type="text"
              name="treatmentOther"
              value={formData.treatmentOther}
              onChange={handleChange}
              onBlur={capitalizeBlur('treatmentOther')}
              placeholder="Specify other treatment..."
              style={{ marginTop: '0.5rem' }}
            />
          )}
        </div>
      </div>

      {/* Subcontracts - only editable in create mode; edit mode uses SubcontractsTab */}
      {!isEdit && (
      <div className="form-section">
        <div className="form-section-header">
          <h3 className="form-section-title">Subcontracts</h3>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
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
            }}
          >
            + Add Subcontract
          </button>
        </div>
        {subcontracts.length === 0 ? (
          <p className="empty-state">No subcontracts added. Click "+ Add Subcontract" to add one.</p>
        ) : (
          <div className="subcontracts-list">
            {subcontracts.map((sub, idx) => (
              <div key={sub.id} className="subcontract-card">
                {sub.isNew ? (
                  <div className="subcontract-inline-form">
                    <div className="form-row">
                      <div className="form-group">
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
                      <div className="form-group">
                        <label>Date Sent</label>
                        <input
                          type="date"
                          value={sub.dateSent}
                          onChange={(e) => {
                            const updated = [...subcontracts];
                            updated[idx] = { ...sub, dateSent: e.target.value };
                            setSubcontracts(updated);
                          }}
                        />
                      </div>
                      <div className="form-group">
                        <label>Date Expected</label>
                        <input
                          type="date"
                          value={sub.dateExpected}
                          onChange={(e) => {
                            const updated = [...subcontracts];
                            updated[idx] = { ...sub, dateExpected: e.target.value };
                            setSubcontracts(updated);
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className="btn-icon danger"
                        onClick={() => setSubcontracts(subcontracts.filter(s => s.id !== sub.id))}
                        style={{ alignSelf: 'flex-end', marginBottom: '0.5rem' }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="subcontract-display">
                    <div className="subcontract-header">
                      <strong>{sub.supplierName}</strong>
                      <span className={`badge badge-${sub.status?.toLowerCase() || 'pending'}`}>
                        {sub.status || 'PENDING'}
                      </span>
                    </div>
                    <div className="subcontract-dates">
                      {sub.dateSent && <span>Sent: {new Date(sub.dateSent).toLocaleDateString()}</span>}
                      {sub.dateExpected && <span>Expected: {new Date(sub.dateExpected).toLocaleDateString()}</span>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Notes */}
      <div className="form-section">
        <h3 className="form-section-title">Internal Notes</h3>
        <div className="form-group">
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            onBlur={capitalizeBlur('notes')}
            rows={2}
            placeholder="Internal notes (not shown to customer)..."
          />
        </div>
      </div>
    </div>
  );
}
