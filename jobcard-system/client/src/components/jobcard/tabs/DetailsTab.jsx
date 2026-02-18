import { useState } from 'react';
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
import CalendarPicker from '../../common/CalendarPicker';
import SubcontractCreateSection from './SubcontractCreateSection';

export default function DetailsTab({
  isEdit,
  isAdmin,
  jobNumber,
  formData,
  setFormData,
  handleChange,
  contact,
  contactFormData,
  handleContactFieldChange,
  selectContact,
  contacts,
  showContactDropdown,
  contactSearchRef,
  fieldFocused,
  handleFieldFocus,
  handleFieldBlur,
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
  const [showCalendar, setShowCalendar] = useState(false);

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
      {/* Classification: Job Number (create) | Status | Job Type */}
      <div className="form-section">
        <h3 className="form-section-title">Classification</h3>
        <div className="form-row">
          {!isEdit && (
            <div className="form-group">
              <label>Job Card / Quote <span className="required">*</span></label>
              <input
                type="text"
                name="jobNumber"
                value={formData.jobNumber}
                onChange={handleChange}
                placeholder="JC-XXXXXXXX-XXX"
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

      {/* Contact Section - Inline Autocomplete (admin only) */}
      {isAdmin && (
      <div className="form-section">
        <h3 className="form-section-title">
          Contact <span className="required">*</span>
          {contact && <span className="contact-linked-badge">Linked</span>}
        </h3>

        <div className="contact-fields-inline" ref={contactSearchRef}>
          <div className="form-row">
            <div className="form-group">
              <label>Contact Name <span className="required">*</span></label>
              <div className="autocomplete-container">
                <input
                  type="text"
                  value={contactFormData.contactName}
                  onChange={(e) => handleContactFieldChange('contactName', e.target.value)}
                  onFocus={handleFieldFocus}
                  onBlur={(e) => {
                    handleFieldBlur();
                    const formatted = toTitleCase(e.target.value);
                    if (formatted !== e.target.value) handleContactFieldChange('contactName', formatted);
                  }}
                  onKeyDown={(e) => { if (e.key === 'Escape') e.target.blur(); }}
                  placeholder=""
                  className={!contactFormData.contactName.trim() ? 'field-required' : ''}
                />
                {showContactDropdown && fieldFocused && contacts.length > 0 && (
                  <div className="customer-dropdown">
                    {contacts.map(c => (
                      <div key={c.id} className="customer-option" onMouseDown={() => selectContact(c)}>
                        <strong>{c.contactName}</strong>
                        {c.companyName && <span className="company-name"> ({c.companyName})</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="form-group">
              <label>Company</label>
              <input
                type="text"
                value={contactFormData.companyName}
                onChange={(e) => handleContactFieldChange('companyName', e.target.value)}
                onBlur={titleCaseBlur('companyName', handleContactFieldChange)}
                placeholder=""
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
                placeholder=""
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={contactFormData.email}
                onChange={(e) => handleContactFieldChange('email', e.target.value)}
                placeholder=""
              />
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Scheduling: Priority + Due Date */}
      <div className="form-section">
        <h3 className="form-section-title">Scheduling</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Priority</label>
            <select name="priority" value={formData.priority} onChange={handleChange} className={formData.priority === 'HIGH' ? 'priority-high' : ''}>
              {PRIORITY_OPTIONS.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Due Date <span className="required">*</span></label>
            <div
              className={`due-date-display${isOverdue ? ' overdue' : ''}${!formData.dueDate ? ' field-required' : ''}`}
              onClick={() => setShowCalendar(true)}
            >
              <span className="due-date-value">
                {formData.dueDate?.trim()
                  ? new Date(formData.dueDate + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
                  : 'Select date...'}
              </span>
              <span className="due-date-icon">&#128197;</span>
            </div>
            <div className="due-date-quick-picks">
              {[2, 7, 14, 21, 30].map(days => {
                const date = new Date();
                date.setDate(date.getDate() + days);
                const value = date.toISOString().split('T')[0];
                return (
                  <button
                    key={days}
                    type="button"
                    className={`btn-quick-pick${formData.dueDate === value ? ' active' : ''}`}
                    onClick={() => setFormData(prev => ({ ...prev, dueDate: value }))}
                  >
                    {days}d
                  </button>
                );
              })}
            </div>
            {isOverdue && <span className="overdue-text">OVERDUE</span>}
            <CalendarPicker
              isOpen={showCalendar}
              value={formData.dueDate}
              onSelect={(dateStr) => setFormData(prev => ({ ...prev, dueDate: dateStr }))}
              onClose={() => setShowCalendar(false)}
            />
          </div>
        </div>
      </div>

      {/* Job Description + Line Items */}
      <div className="form-section">
        <h3 className="form-section-title">Job Description</h3>
        <div className="form-group">
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            onBlur={capitalizeBlur('description')}
            rows={3}
            placeholder=""
          />
        </div>
      </div>

      {!isEdit && (
        <div className="form-section">
          <div className="form-section-header">
            <h3 className="form-section-title">Line Items <span className="required">*</span></h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addLineItem}>+ Add</button>
          </div>
          <div className="line-items-list">
            {lineItems.map((item) => (
              <div key={item.id} className="line-item-card">
                <div className="line-item-badge">#{item.itemNumber}</div>
                <div className="line-item-fields">
                  <div className="line-item-qty">
                    <label>Qty</label>
                    <input
                      type="text"
                      value={item.qty}
                      onChange={(e) => updateLineItem(item.id, 'qty', e.target.value)}
                      placeholder="-"
                    />
                  </div>
                  <div className="line-item-desc">
                    <label>Description</label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                      onBlur={(e) => {
                        const f = capitalizeFirst(e.target.value);
                        if (f !== e.target.value) updateLineItem(item.id, 'description', f);
                      }}
                      placeholder="What needs to be done..."
                    />
                  </div>
                </div>
                {lineItems.length > 1 && (
                  <button type="button" className="line-item-remove" onClick={() => removeLineItem(item.id)} title="Remove item">×</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Customer Input: Quality Level + Customer Property + Drawings + Scanner Files */}
      <div className="form-section">
        <h3 className="form-section-title">Customer Input</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Quality Level</label>
            <select name="qualityLevel" value={formData.qualityLevel} onChange={handleChange}>
              <option value="STANDARD">Standard</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>
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
      </div>

      {/* References + Repeat Job */}
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
              placeholder="e.g. Zinc plating"
              style={{ marginTop: '0.5rem' }}
            />
          )}
        </div>
      </div>

      {!isEdit && (
        <SubcontractCreateSection
          subcontracts={subcontracts}
          setSubcontracts={setSubcontracts}
          suppliers={suppliers}
        />
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
            placeholder="Not shown to customer"
          />
        </div>
      </div>
    </div>
  );
}
