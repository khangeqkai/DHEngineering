import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../../services/api';
import { Calendar } from 'lucide-react';
import {
  PRIORITY_OPTIONS,
  STATUS_OPTIONS
} from '../constants';
import { useTags } from '../../../hooks/useTags';
import { formatFileSize, formatFileDate } from '../mappers';
import { toTitleCase, capitalizeFirst, autoResize } from '../../../utils/formatters';
import CalendarPicker from '../../common/CalendarPicker';
import ItemsTab from './ItemsTab';
import SubcontractCreateSection from './SubcontractCreateSection';
import DetailsReadOnlyView from './DetailsReadOnlyView';
import NotesSection from './NotesSection';

export default function DetailsTab({
  isEdit,
  isAdmin,
  jobCardId,
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
  isOverdue,
  // QA Levels
  qaLevels,
  // Notes props
  notes,
  newNote,
  setNewNote,
  onAddNote,
  onDeleteNote,
  notesLoading
}) {
  const [showCalendar, setShowCalendar] = useState(false);
  const readOnly = isEdit && !isAdmin;
  const { tags: jobTypeTags } = useTags('job_type');
  const { tags: customerPropertyTags } = useTags('customer_property');
  const { tags: drawingsTags } = useTags('drawings');

  const handleStatusChange = useCallback(async (newStatus) => {
    try {
      await api.updateJobcardStatus(jobCardId, newStatus);
      setFormData(prev => ({ ...prev, status: newStatus }));
      toast.success('Status updated');
    } catch (err) {
      toast.error('Failed to update status');
    }
  }, [jobCardId, setFormData]);

  // Employee read-only view
  if (readOnly) {
    return (
      <>
        <DetailsReadOnlyView
          formData={formData}
          assignees={assignees}
          lineItems={lineItems}
          subcontracts={subcontracts}
          isOverdue={isOverdue}
          onStatusChange={handleStatusChange}
        />
        {isEdit && (
          <NotesSection
            notes={notes || []}
            newNote={newNote || ''}
            setNewNote={setNewNote}
            onAddNote={onAddNote}
            onDeleteNote={onDeleteNote}
            loading={notesLoading}
            isAdmin={isAdmin}
          />
        )}
      </>
    );
  }

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
              <label>Job Card Number</label>
              <input
                type="text"
                value="Auto-generated"
                readOnly
                className="input-disabled"
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
              {jobTypeTags.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
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
                  onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); e.target.blur(); } }}
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
            <select name="priority" value={formData.priority} onChange={handleChange} className={formData.priority !== 'NONE' ? `priority-${formData.priority.toLowerCase()}` : ''}>
              {PRIORITY_OPTIONS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Due Date</label>
            <div
              className={`due-date-display${isOverdue ? ' overdue' : ''}`}
              onClick={() => setShowCalendar(true)}
            >
              <span className="due-date-value">
                {formData.dueDate?.trim()
                  ? new Date(formData.dueDate + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
                  : 'Select date...'}
              </span>
              <span className="due-date-icon"><Calendar size={16} /></span>
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
                    className={`btn-quick-pick${!isEdit && formData.dueDate === value ? ' active' : ''}`}
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
        <h3 className="form-section-title">Job Description <span className="required">*</span></h3>
        <div className="form-group">
          <textarea
            ref={(el) => { if (el) autoResize(el); }}
            onInput={(e) => autoResize(e.target)}
            name="description"
            value={formData.description}
            onChange={handleChange}
            onBlur={capitalizeBlur('description')}
            rows={3}
            placeholder="Describe the work required..."
          />
        </div>
      </div>

      {!isEdit && (
        <ItemsTab
          lineItems={lineItems}
          addLineItem={addLineItem}
          updateLineItem={updateLineItem}
          removeLineItem={removeLineItem}
        />
      )}

      {/* Customer Input */}
      <div className="form-section">
        <h3 className="form-section-title">Customer Input</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Customer's PO Number</label>
            <input type="text" name="poNumber" value={formData.poNumber} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Quality Level</label>
            <select
              name="qaLevelId"
              value={formData.qaLevelId || ''}
              onChange={(e) => {
                const selectedLevel = (qaLevels || []).find(l => l.id === e.target.value);
                setFormData(prev => ({
                  ...prev,
                  qaLevelId: e.target.value || null,
                  qualityLevel: selectedLevel ? selectedLevel.name.toUpperCase() : null
                }));
              }}
            >
              <option value="">None</option>
              {(qaLevels || []).map(level => (
                <option key={level.id} value={level.id}>{level.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Repeat Job</label>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                name="isRepeatJob"
                checked={formData.isRepeatJob}
                onChange={handleChange}
              />
              {formData.isRepeatJob ? 'Yes' : 'No'}
            </label>
          </div>
        </div>
        {formData.isRepeatJob && (
          <div className="form-group">
            <label>Previous Job Reference <span className="required">*</span></label>
            <input
              type="text"
              name="repeatJobReference"
              value={formData.repeatJobReference}
              onChange={handleChange}
              placeholder="JC-XXXXXXXX-XXX"
              className={!formData.repeatJobReference ? 'field-required' : ''}
            />
          </div>
        )}
        <div className="form-group">
          <label>Customer Property <span className="required">*</span></label>
          <div className={`checkbox-grid${!formData.customerProperty || formData.customerProperty === 'NONE' ? ' field-required' : ''}`}>
            {customerPropertyTags.map(opt => {
              const values = formData.customerProperty ? formData.customerProperty.split(',') : [];
              const isChecked = values.includes(opt.value);
              return (
                <label key={opt.value} className={`checkbox-chip ${isChecked ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      if (opt.value === 'NA') {
                        setFormData(prev => ({ ...prev, customerProperty: e.target.checked ? 'NA' : '' }));
                      } else {
                        const current = formData.customerProperty ? formData.customerProperty.split(',').filter(v => v && v !== 'NA') : [];
                        const updated = e.target.checked
                          ? [...current, opt.value]
                          : current.filter(v => v !== opt.value);
                        setFormData(prev => ({ ...prev, customerProperty: updated.join(',') }));
                      }
                    }}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        </div>
        <div className="form-group">
          <label>Drawings <span className="required">*</span></label>
          <div className={`checkbox-grid${!formData.drawingsType || formData.drawingsType === 'NONE' ? ' field-required' : ''}`}>
            {drawingsTags.map(opt => {
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
        </div>
        <div className="form-group">
          <label>Scanner Files</label>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={toggleScannerFiles}
          >
            {showScannerFiles ? 'Hide Scanner Files' : 'Browse Scanner Files'}
          </button>
          {showScannerFiles && (
            <div className="scanner-files-container" style={{ marginTop: '0.5rem' }}>
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

      {!isEdit && (
        <SubcontractCreateSection
          subcontracts={subcontracts}
          setSubcontracts={setSubcontracts}
          suppliers={suppliers}
        />
      )}

      {/* Internal Comments (admin only) */}
      <div className="form-section">
        <h3 className="form-section-title">Internal Comments</h3>
        <div className="form-group">
          <textarea
            ref={(el) => { if (el) autoResize(el); }}
            onInput={(e) => autoResize(e.target)}
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            onBlur={capitalizeBlur('notes')}
            rows={2}
            placeholder="Add internal notes..."
          />
          <span className="field-hint">Only visible to admin, not shown to staff or customer</span>
        </div>
      </div>

      {/* Job Comments (shared, append-only) */}
      {isEdit && (
        <NotesSection
          notes={notes || []}
          newNote={newNote || ''}
          setNewNote={setNewNote}
          onAddNote={onAddNote}
          onDeleteNote={onDeleteNote}
          loading={notesLoading}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
