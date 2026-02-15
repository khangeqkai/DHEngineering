import {
  JOB_TYPES,
  PRIORITY_OPTIONS,
  DRAWINGS_TYPES,
  TREATMENT_OPTIONS,
  CUSTOMER_PROPERTY_OPTIONS,
  STATUS_OPTIONS
} from '../constants';
import { formatFileSize, formatFileDate } from '../mappers';

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
  handleConvertToJobCard,
  isOverdue
}) {
  return (
    <div className="modal-form-grid">
      {/* Header Info */}
      {isEdit && (
        <div className="form-section header-section">
          <div className="job-header">
            <div className="job-number-display">
              <span className="label">Job #</span>
              <span className="value">{jobNumber}</span>
            </div>
            {formData.card_type === 'QUOTE' && (
              <button type="button" className="btn btn-success btn-sm" onClick={handleConvertToJobCard}>
                Convert to Job Card
              </button>
            )}
          </div>
        </div>
      )}

      {/* Status & Type Row */}
      <div className="form-section">
        <h3 className="form-section-title" data-section="01">Classification</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Card Type</label>
            <select name="card_type" value={formData.card_type} onChange={handleChange}>
              <option value="JOB_CARD">Job Card</option>
              <option value="QUOTE">Quote</option>
            </select>
          </div>
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
                name="is_repeat_job"
                checked={formData.is_repeat_job}
                onChange={handleChange}
              />
              Repeat Job
            </label>
          </div>
          {formData.is_repeat_job && (
            <div className="form-group" style={{ flex: 2 }}>
              <label>Previous Job Reference <span className="required">*</span></label>
              <input
                type="text"
                name="repeat_job_reference"
                value={formData.repeat_job_reference}
                onChange={handleChange}
                placeholder="JC-XXXXXXXX-XXX"
                className={formData.is_repeat_job && !formData.repeat_job_reference ? 'field-required' : ''}
              />
            </div>
          )}
        </div>
      </div>

      {/* Contact Section - Phone Contacts Style */}
      <div className="form-section">
        <h3 className="form-section-title" data-section="02">Contact <span className="required">*</span></h3>

        {contact && (
          <div className="selected-customer-banner">
            <span>Contact selected: <strong>{contact.contact_name || contact.contactName}</strong></span>
            {(contact.company_name || contact.companyName) && (
              <span> at {contact.company_name || contact.companyName}</span>
            )}
            {contact.is_critical_qa && <span className="badge badge-critical">Critical QA</span>}
            <button type="button" className="btn-link" onClick={clearContact}>Clear</button>
          </div>
        )}

        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }} ref={contactSearchRef}>
            <label>Search Contact <span className="required">*</span></label>
            <div className="autocomplete-container">
              <input
                type="text"
                value={contactSearch}
                onChange={(e) => handleContactFieldChange('contact_name', e.target.value)}
                onFocus={() => contactFormData.contact_name.length >= 2 && setShowContactDropdown(true)}
                placeholder="Search by name or company..."
                className={!contactFormData.contact_name.trim() ? 'field-required' : contact ? 'field-selected' : ''}
              />
              {showContactDropdown && contacts.length > 0 && (
                <div className="customer-dropdown">
                  <div className="dropdown-hint">Select existing contact or continue typing to create new</div>
                  {contacts.map(c => (
                    <div key={c.id} className="customer-option" onClick={() => selectContact(c)}>
                      <strong>{c.contact_name}</strong>
                      {c.company_name && <span className="company-name"> ({c.company_name})</span>}
                      {c.is_critical_qa && <span className="badge badge-critical">Critical QA</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="form-group">
            <label>Quality Management</label>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={contactFormData.is_critical_qa}
                onChange={(e) => handleContactFieldChange('is_critical_qa', e.target.checked)}
                disabled={contact?.is_critical_qa}
              />
              Critical QA
            </label>
          </div>
        </div>

        {contactFormData.is_critical_qa && (
          <div className="critical-warning">
            Critical QA contact - enhanced documentation and QA forms required
          </div>
        )}

        <div className="contact-fields-inline">
          <p className="field-note">Contact details for this job (editable):</p>
          <div className="form-row">
            <div className="form-group">
              <label>Contact Name <span className="required">*</span></label>
              <input
                type="text"
                value={contactFormData.contact_name}
                onChange={(e) => handleContactFieldChange('contact_name', e.target.value)}
                placeholder="Contact person..."
                className={!contactFormData.contact_name.trim() ? 'field-required' : ''}
              />
            </div>
            <div className="form-group">
              <label>Company</label>
              <input
                type="text"
                value={contactFormData.company_name}
                onChange={(e) => handleContactFieldChange('company_name', e.target.value)}
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
        <h3 className="form-section-title" data-section="03">Job Details</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Quality Level</label>
            <select name="quality_level" value={formData.quality_level} onChange={handleChange}>
              <option value="STANDARD">Standard</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>
          <div className="form-group">
            <label>Job Type <span className="required">*</span></label>
            <select name="job_type" value={formData.job_type} onChange={handleChange} className={!formData.job_type ? 'field-required' : ''}>
              <option value="">Select job type...</option>
              {JOB_TYPES.filter(t => {
                if (t === 'QUOTE' && formData.card_type !== 'QUOTE') return false;
                return true;
              }).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* References */}
      <div className="form-section">
        <h3 className="form-section-title" data-section="04">References</h3>
        <div className="form-row">
          <div className="form-group">
            <label>PO Number</label>
            <input type="text" name="po_number" value={formData.po_number} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Quote Reference</label>
            <input type="text" name="quote_reference" value={formData.quote_reference} onChange={handleChange} placeholder="QT-XXXXXXXX-XXX" />
          </div>
        </div>
        <div className="form-group">
          <label>Drawings</label>
          <div className="checkbox-grid">
            {DRAWINGS_TYPES.filter(d => d.value !== 'NONE').map(opt => {
              const values = formData.drawings_type ? formData.drawings_type.split(',') : [];
              const isChecked = values.includes(opt.value);
              return (
                <label key={opt.value} className={`checkbox-chip ${isChecked ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      const current = formData.drawings_type ? formData.drawings_type.split(',').filter(v => v && v !== 'NONE') : [];
                      const updated = e.target.checked
                        ? [...current, opt.value]
                        : current.filter(v => v !== opt.value);
                      setFormData(prev => ({ ...prev, drawings_type: updated.length ? updated.join(',') : 'NONE' }));
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
              name="due_date"
              value={formData.due_date}
              onChange={handleChange}
              className={`${isOverdue ? 'overdue' : ''} ${!formData.due_date ? 'field-required' : ''}`}
            />
            {isOverdue && <span className="overdue-text">OVERDUE</span>}
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="form-section">
        <h3 className="form-section-title" data-section="05">Description</h3>
        <div className="form-group">
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={3}
            placeholder="Job description..."
          />
        </div>
        <div className="form-group">
          <label>Customer Property</label>
          <div className="checkbox-grid">
            {CUSTOMER_PROPERTY_OPTIONS.filter(o => o.value !== 'NONE').map(opt => {
              const values = formData.customer_property ? formData.customer_property.split(',') : [];
              const isChecked = values.includes(opt.value);
              return (
                <label key={opt.value} className={`checkbox-chip ${isChecked ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      const current = formData.customer_property ? formData.customer_property.split(',').filter(v => v) : [];
                      const updated = e.target.checked
                        ? [...current, opt.value]
                        : current.filter(v => v !== opt.value);
                      setFormData(prev => ({ ...prev, customer_property: updated.join(',') }));
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
            <h3 className="form-section-title" data-section="06">Line Items <span className="required">*</span></h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addLineItem}>+ Add</button>
          </div>
          {lineItems.map((item) => (
            <div key={item.id} className="line-item-row">
              <span className="item-num">#{item.item_number}</span>
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
        <h3 className="form-section-title" data-section="07">Assignees</h3>
        <div className="assignees-grid">
          {employees.map(emp => {
            const isAssigned = assignees.some(a => a.user_id === emp.id);
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
        <h3 className="form-section-title" data-section="08">Treatment</h3>
        <div className="form-group">
          <label>Treatment Required</label>
          <div className="checkbox-grid">
            {TREATMENT_OPTIONS.filter(o => o.value !== 'NONE').map(opt => {
              const values = formData.treatment_required ? formData.treatment_required.split(',') : [];
              const isChecked = values.includes(opt.value);
              return (
                <label key={opt.value} className={`checkbox-chip ${isChecked ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      const current = formData.treatment_required ? formData.treatment_required.split(',').filter(v => v && v !== 'NONE') : [];
                      const updated = e.target.checked
                        ? [...current, opt.value]
                        : current.filter(v => v !== opt.value);
                      setFormData(prev => ({ ...prev, treatment_required: updated.length ? updated.join(',') : 'NONE' }));
                    }}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
          {formData.treatment_required?.includes('OTHER') && (
            <input
              type="text"
              name="treatment_other"
              value={formData.treatment_other}
              onChange={handleChange}
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
          <h3 className="form-section-title" data-section="09">Subcontracts</h3>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setSubcontracts([...subcontracts, {
                id: Date.now(),
                supplier_id: '',
                supplier_name: '',
                date_sent: '',
                date_expected: '',
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
                          value={sub.supplier_id}
                          onChange={(e) => {
                            const supplier = suppliers.find(s => s.id === e.target.value);
                            const updated = [...subcontracts];
                            updated[idx] = {
                              ...sub,
                              supplier_id: e.target.value,
                              supplier_name: supplier?.name || ''
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
                          value={sub.date_sent}
                          onChange={(e) => {
                            const updated = [...subcontracts];
                            updated[idx] = { ...sub, date_sent: e.target.value };
                            setSubcontracts(updated);
                          }}
                        />
                      </div>
                      <div className="form-group">
                        <label>Date Expected</label>
                        <input
                          type="date"
                          value={sub.date_expected}
                          onChange={(e) => {
                            const updated = [...subcontracts];
                            updated[idx] = { ...sub, date_expected: e.target.value };
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
                      <strong>{sub.supplier_name}</strong>
                      <span className={`badge badge-${sub.status?.toLowerCase() || 'pending'}`}>
                        {sub.status || 'PENDING'}
                      </span>
                    </div>
                    <div className="subcontract-dates">
                      {sub.date_sent && <span>Sent: {new Date(sub.date_sent).toLocaleDateString()}</span>}
                      {sub.date_expected && <span>Expected: {new Date(sub.date_expected).toLocaleDateString()}</span>}
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
        <h3 className="form-section-title" data-section="10">Internal Notes</h3>
        <div className="form-group">
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            rows={2}
            placeholder="Internal notes (not shown to customer)..."
          />
        </div>
      </div>
    </div>
  );
}
