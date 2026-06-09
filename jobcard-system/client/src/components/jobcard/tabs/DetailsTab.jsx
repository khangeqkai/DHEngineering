import { useEffect } from 'react';
import { useTags } from '../../../hooks/useTags';
import { formatFileSize, formatFileDate } from '../mappers';
import { toTitleCase } from '../../../utils/formatters';
import { useJobSearch } from '../useJobSearch';
import ItemsTab from './ItemsTab';
import DetailsReadOnlyView from './DetailsReadOnlyView';
import NotesSection from './NotesSection';
import ToggleTiles from '../../common/ToggleTiles';

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
  suppliers,
  showScannerFiles,
  toggleScannerFiles,
  scannerFiles,
  loadingScannerFiles,
  // QA Levels
  qaLevels,
  // Notes props
  notes,
  newNote,
  setNewNote,
  onAddNote,
  onDeleteNote,
  notesLoading,
  notesLoadError,
  onRetryNotes,
  // Time entry props
  timeEntries = [],
  machines = [],
  showTimeEntryForm,
  editingTimeEntryId,
  timeEntryForm,
  handleTimeEntryChange,
  handleAddTimeEntry,
  handleEditTimeEntry,
  handleSaveTimeEntry,
  handleDeleteTimeEntry,
  handleStopActiveEntry,
  resetTimeEntryForm,
  onToggleSpecial,
  // Per-item timer
  activeTimer,
  timerElapsed,
  timerLoading,
  onStartTimer,
  onStopTimer
}) {
  const readOnly = isEdit && !isAdmin;
  const { tags: customerPropertyTags } = useTags('customer_property');
  const { tags: drawingsTags } = useTags('drawings');

  const jobSearch = useJobSearch({ excludeJobNumber: jobNumber });
  const { setQuery: setJobSearchQuery } = jobSearch;

  useEffect(() => {
    if (jobSearch.query !== (formData.repeatJobReference || '')) {
      setJobSearchQuery(formData.repeatJobReference || '');
    }
  }, [formData.repeatJobReference, jobSearch.query, setJobSearchQuery]);

  // Employee read-only view
  if (readOnly) {
    return (
      <>
        <DetailsReadOnlyView
          formData={formData}
          assignees={assignees}
          lineItems={lineItems}
          updateLineItem={updateLineItem}
          timeEntries={timeEntries}
          jobCardId={jobCardId}
          activeTimer={activeTimer}
          timerElapsed={timerElapsed}
          timerLoading={timerLoading}
          onStartTimer={onStartTimer}
          onStopTimer={onStopTimer}
          handleStopActiveEntry={handleStopActiveEntry}
        />
        {isEdit && (
          <NotesSection
            notes={notes || []}
            newNote={newNote || ''}
            setNewNote={setNewNote}
            onAddNote={onAddNote}
            onDeleteNote={onDeleteNote}
            loading={notesLoading}
            loadError={notesLoadError}
            onRetry={onRetryNotes}
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

  return (
    <div className="modal-form-grid">
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
              <label>Company <span className="required">*</span></label>
              <div className="autocomplete-container">
                <input
                  type="text"
                  value={contactFormData.companyName}
                  onChange={(e) => handleContactFieldChange('companyName', e.target.value)}
                  onFocus={handleFieldFocus}
                  onBlur={(e) => {
                    handleFieldBlur();
                    const formatted = toTitleCase(e.target.value);
                    if (formatted !== e.target.value) handleContactFieldChange('companyName', formatted);
                  }}
                  onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); e.target.blur(); } }}
                  placeholder=""
                  className={!contactFormData.companyName.trim() ? 'field-required' : ''}
                />
                {showContactDropdown && fieldFocused && contacts.length > 0 && (
                  <div className="customer-dropdown">
                    {contacts.map(c => (
                      <div key={c.id} className="customer-option" onMouseDown={() => selectContact(c)}>
                        <strong>{c.companyName || 'No company'}</strong>
                        {c.contactName && <span className="contact-name"> ({c.contactName})</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="form-group">
              <label>Contact Name</label>
              <input
                type="text"
                value={contactFormData.contactName}
                onChange={(e) => handleContactFieldChange('contactName', e.target.value)}
                onBlur={titleCaseBlur('contactName', handleContactFieldChange)}
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

      <ItemsTab
        jobCardId={jobCardId}
        lineItems={lineItems}
        addLineItem={addLineItem}
        updateLineItem={updateLineItem}
        removeLineItem={removeLineItem}
        suppliers={suppliers}
        timeEntries={timeEntries}
        machines={machines}
        isAdmin={isAdmin && isEdit}
        showTimeEntryForm={showTimeEntryForm}
        editingTimeEntryId={editingTimeEntryId}
        timeEntryForm={timeEntryForm}
        handleTimeEntryChange={handleTimeEntryChange}
        handleAddTimeEntry={isEdit ? handleAddTimeEntry : undefined}
        handleEditTimeEntry={handleEditTimeEntry}
        handleSaveTimeEntry={handleSaveTimeEntry}
        handleDeleteTimeEntry={handleDeleteTimeEntry}
        handleStopActiveEntry={handleStopActiveEntry}
        resetTimeEntryForm={resetTimeEntryForm}
        onToggleSpecial={onToggleSpecial}
        activeTimer={isEdit ? activeTimer : null}
        timerElapsed={timerElapsed}
        timerLoading={timerLoading}
        onStartTimer={isEdit ? onStartTimer : undefined}
        onStopTimer={isEdit ? onStopTimer : undefined}
      />


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
          <div className="form-group" ref={jobSearch.containerRef}>
            <label>Previous Job Reference</label>
            <div className="autocomplete-container">
              <input
                type="text"
                name="repeatJobReference"
                value={formData.repeatJobReference || ''}
                onChange={(e) => {
                  jobSearch.setQuery(e.target.value);
                  handleChange(e);
                }}
                onFocus={jobSearch.handleFocus}
                onBlur={jobSearch.handleBlur}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); e.target.blur(); } }}
                placeholder="DH-00001"
                autoComplete="off"
              />
              {jobSearch.showDropdown && jobSearch.focused && jobSearch.matches.length > 0 && (
                <div className="customer-dropdown">
                  {jobSearch.matches.map(j => (
                    <div
                      key={j.id}
                      className="customer-option"
                      onMouseDown={() => {
                        setFormData(prev => ({ ...prev, repeatJobReference: j.jobNumber }));
                        jobSearch.selectMatch(j.jobNumber);
                      }}
                    >
                      <strong>{j.jobNumber}</strong>
                      {j.companyName && <span className="contact-name"> — {j.companyName}</span>}
                      {j.description && <span className="contact-name"> ({j.description})</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="form-group">
          <label>Customer Property <span className="required">*</span></label>
          <ToggleTiles
            ariaLabel="Customer property"
            className={!formData.customerProperty || formData.customerProperty === 'NONE' ? 'field-required' : ''}
            options={customerPropertyTags.map(o => ({ value: o.value, label: o.label }))}
            selectedValues={formData.customerProperty ? formData.customerProperty.split(',') : []}
            onToggle={(val) => {
              const values = formData.customerProperty ? formData.customerProperty.split(',') : [];
              if (val === 'N_A') {
                setFormData(prev => ({ ...prev, customerProperty: values.includes('N_A') ? '' : 'N_A' }));
              } else {
                const current = values.filter(v => v && v !== 'N_A');
                const updated = current.includes(val)
                  ? current.filter(v => v !== val)
                  : [...current, val];
                setFormData(prev => ({ ...prev, customerProperty: updated.join(',') }));
              }
            }}
          />
        </div>
        <div className="form-group">
          <label>Drawings <span className="required">*</span></label>
          <ToggleTiles
            ariaLabel="Drawings"
            className={!formData.drawingsType || formData.drawingsType === 'NONE' ? 'field-required' : ''}
            options={drawingsTags.map(o => ({ value: o.value, label: o.label }))}
            selectedValues={formData.drawingsType ? formData.drawingsType.split(',') : []}
            onToggle={(val) => {
              const current = (formData.drawingsType ? formData.drawingsType.split(',') : []).filter(v => v && v !== 'NONE');
              const updated = current.includes(val)
                ? current.filter(v => v !== val)
                : [...current, val];
              setFormData(prev => ({ ...prev, drawingsType: updated.length ? updated.join(',') : 'NONE' }));
            }}
          />
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
        <ToggleTiles
          ariaLabel="Assignees"
          minTileWidth={130}
          options={employees.map(emp => ({ value: emp.id, label: emp.name || emp.username }))}
          selectedValues={assignees.map(a => a.userId)}
          onToggle={(empId) => {
            const emp = employees.find(e => e.id === empId);
            if (emp) toggleAssignee(emp);
          }}
        />
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
          loadError={notesLoadError}
          onRetry={onRetryNotes}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
