import { useEffect, useRef } from 'react';
import { toTitleCase } from '../../../utils/formatters';
import { useJobSearch } from '../useJobSearch';
import { summarizeFieldStates, INSTANT_SAVE_STATUS_TEXT } from '../useInstantSave';
import ItemsTab from './ItemsTab';
import DetailsReadOnlyView from './DetailsReadOnlyView';
import NotesSection from './NotesSection';
import ToggleTiles from '../../common/ToggleTiles';

export default function DetailsTab({
  isEdit,
  canManage,
  jobCardId,
  jobNumber,
  formData,
  setFormData,
  handleChange,
  savedForm = {},
  saveField,
  fieldStates = {},
  contactFormData,
  handleContactFieldChange,
  selectCompany,
  selectPerson,
  selectedCompany,
  people,
  companyMatches,
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
  onItemFieldChange,
  onItemFieldBlur,
  onItemFieldType,
  itemErrorFor,
  suppliers,
  onSuppliersChanged,
  attachmentWarnings,
  onAttachItemFile,
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
  handleStopEntryWithForm,
  resetTimeEntryForm,
  // Per-item timer
  activeTimer,
  timerElapsed,
  timerLoading,
  onStartTimer,
  onStopTimer,
  currentUserId
}) {
  const readOnly = isEdit && !canManage;

  // An existing job writes each of these fields the moment it changes (or, for the
  // reference boxes, the moment it's left) — a brand-new job has nothing to write
  // to yet and stays local-only, same as the identity strip's fields.
  const canWriteInstantly = isEdit && Boolean(jobCardId);
  // A blur write is skipped when nothing actually changed, so tabbing through a
  // reference box without typing into it produces no write and no activity-trail
  // entry — compared against the last known persisted value, not what the box
  // read when it gained focus, so retyping back to that same stored value after a
  // failed write is also correctly seen as "nothing to send" once it succeeds.
  const commitFieldBlur = (field, value) => {
    if (!canWriteInstantly) return;
    // Hand the baseline over rather than skipping the call here when nothing has
    // changed: saveField also has to drop a stale "Not saved" mark left by an
    // earlier failed attempt at a DIFFERENT value, which a user very reasonably
    // reacts to by putting the box back the way it was. Returning early here
    // would leave that mark showing with nothing left to send (defect C,
    // tasks/instant-save-root-causes.md). It still never re-sends anything.
    saveField(field, value, { baseline: savedForm[field] ?? '' });
  };
  // One combined status for the whole tab rather than one per field — see the
  // identical reasoning in JobIdentityStrip.jsx.
  const detailsStatus = summarizeFieldStates(fieldStates, [
    'poNumber', 'quoteReference', 'repeatJobReference', 'qaLevelId', 'isRepeatJob'
  ]);

  const jobSearch = useJobSearch({ excludeJobNumber: jobNumber });
  // Picking a suggestion fires mousedown, which sets the field, BEFORE the input
  // blurs — and that blur still reads the DOM's old text, so letting it write
  // would put the half-typed reference back over the job number just chosen. The
  // pick does its own write and flips this, and the blur behind it stands aside.
  const justPickedRef = useRef(false);
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
          attachmentWarnings={attachmentWarnings}
          onAttachItemFile={onAttachItemFile}
          timeEntries={timeEntries}
          jobCardId={jobCardId}
          activeTimer={activeTimer}
          timerElapsed={timerElapsed}
          timerLoading={timerLoading}
          onStartTimer={onStartTimer}
          onStopTimer={onStopTimer}
          handleStopEntryWithForm={handleStopEntryWithForm}
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
            canManage={canManage}
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
      {/* Customer — frozen after creation: picked on create, read-only on edit (management only) */}
      {canManage && isEdit && (
      <div className="form-section">
        <h3 className="form-section-title">Customer</h3>
        <div className="customer-input-strip">
          <div className="cis-item">
            <span className="cis-label">Company</span>
            <span className="cis-value">{contactFormData.companyName || '-'}</span>
          </div>
          {contactFormData.contactName && (
            <div className="cis-item">
              <span className="cis-label">Contact</span>
              <span className="cis-value">{contactFormData.contactName}</span>
            </div>
          )}
          {contactFormData.phone && (
            <div className="cis-item">
              <span className="cis-label">Phone</span>
              <span className="cis-value">{contactFormData.phone}</span>
            </div>
          )}
          {contactFormData.email && (
            <div className="cis-item">
              <span className="cis-label">Email</span>
              <span className="cis-value">{contactFormData.email}</span>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Customer picker (management only, create mode): pick the company, then
          who there the job is for. Their details fill in and stay editable. */}
      {canManage && !isEdit && (
      <div className="form-section">
        <h3 className="form-section-title">
          Customer <span className="required">*</span>
          {selectedCompany && <span className="contact-linked-badge">Linked</span>}
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
                {showContactDropdown && fieldFocused && companyMatches.length > 0 && (
                  <div className="customer-dropdown">
                    {companyMatches.map(c => (
                      <div key={c.id} className="customer-option" onMouseDown={() => selectCompany(c)}>
                        <strong>{c.name}</strong>
                        {(c.people || []).length > 0 && (
                          <span className="contact-name"> ({(c.people || []).map(p => p.contactName).filter(Boolean).join(', ')})</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {!selectedCompany && contactFormData.companyName.trim() && (
                <span className="field-hint">Not on the list — it will be added as a new customer.</span>
              )}
            </div>
            <div className="form-group">
              <label>Contact</label>
              {selectedCompany && people.length > 0 ? (
                <select
                  value={contactFormData.contactId}
                  onChange={(e) => selectPerson(e.target.value)}
                >
                  <option value="">Someone else...</option>
                  {people.map(p => (
                    <option key={p.id} value={p.id}>{p.contactName || 'Unnamed'}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={contactFormData.contactName}
                  onChange={(e) => handleContactFieldChange('contactName', e.target.value)}
                  onBlur={titleCaseBlur('contactName', handleContactFieldChange)}
                  placeholder=""
                />
              )}
            </div>
          </div>
          {selectedCompany && people.length > 0 && !contactFormData.contactId && (
            <div className="form-row">
              <div className="form-group">
                <label>New contact name</label>
                <input
                  type="text"
                  value={contactFormData.contactName}
                  onChange={(e) => handleContactFieldChange('contactName', e.target.value)}
                  onBlur={titleCaseBlur('contactName', handleContactFieldChange)}
                  placeholder=""
                />
                <span className="field-hint">They'll be added under {selectedCompany.name}.</span>
              </div>
            </div>
          )}
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
        onItemFieldChange={onItemFieldChange}
        onItemFieldBlur={onItemFieldBlur}
        onItemFieldType={onItemFieldType}
        itemErrorFor={itemErrorFor}
        suppliers={suppliers}
        onSuppliersChanged={onSuppliersChanged}
        attachmentWarnings={attachmentWarnings}
        onAttachItemFile={onAttachItemFile}
        timeEntries={timeEntries}
        machines={machines}
        employees={employees}
        canManage={canManage && isEdit}
        isCritical={String(formData.qualityLevel || '').toUpperCase() === 'CRITICAL'}
        showTimeEntryForm={showTimeEntryForm}
        editingTimeEntryId={editingTimeEntryId}
        timeEntryForm={timeEntryForm}
        handleTimeEntryChange={handleTimeEntryChange}
        handleAddTimeEntry={isEdit ? handleAddTimeEntry : undefined}
        handleEditTimeEntry={handleEditTimeEntry}
        handleSaveTimeEntry={handleSaveTimeEntry}
        handleDeleteTimeEntry={handleDeleteTimeEntry}
        handleStopEntryWithForm={handleStopEntryWithForm}
        resetTimeEntryForm={resetTimeEntryForm}
        activeTimer={isEdit ? activeTimer : null}
        timerElapsed={timerElapsed}
        timerLoading={timerLoading}
        onStartTimer={isEdit ? onStartTimer : undefined}
        onStopTimer={isEdit ? onStopTimer : undefined}
        currentUserId={currentUserId}
      />


      {/* Customer Input */}
      <div className="form-section">
        <div className="form-section-header">
          <h3 className="form-section-title">Customer Input</h3>
          {detailsStatus !== 'idle' && (
            <span
              className={`instant-save-status instant-save-status--${detailsStatus}`}
              role="status"
              aria-live="polite"
            >
              {INSTANT_SAVE_STATUS_TEXT[detailsStatus]}
            </span>
          )}
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Customer's PO Number</label>
            <input
              type="text"
              name="poNumber"
              value={formData.poNumber}
              onChange={handleChange}
              onBlur={(e) => commitFieldBlur('poNumber', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Quote Reference</label>
            <input
              type="text"
              name="quoteReference"
              value={formData.quoteReference}
              onChange={handleChange}
              onBlur={(e) => commitFieldBlur('quoteReference', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Quality Level</label>
            <select
              name="qaLevelId"
              value={formData.qaLevelId || ''}
              onChange={(e) => {
                const selectedLevel = (qaLevels || []).find(l => l.id === e.target.value);
                const qaLevelId = e.target.value || null;
                const qualityLevel = selectedLevel ? selectedLevel.name.toUpperCase() : 'STANDARD';
                setFormData(prev => ({
                  ...prev,
                  qaLevelId,
                  qualityLevel
                }));
                // Only qaLevelId travels over the wire — the server derives its own
                // copy of qualityLevel from it (jobcard-mutations.js) — but both
                // baselines move together on success, since both changed as one
                // user action. See useInstantSave.js's alsoMarkSaved.
                if (canWriteInstantly) saveField('qaLevelId', qaLevelId, { alsoMarkSaved: { qualityLevel } });
              }}
            >
              {/* "Standard" is the baseline — no special level. It's the default and
                  shows first; the saved levels (Critical, etc.) are the upgrades. */}
              <option value="">Standard</option>
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
                onChange={(e) => {
                  handleChange(e);
                  if (canWriteInstantly) saveField('isRepeatJob', e.target.checked);
                }}
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
                onBlur={(e) => {
                  jobSearch.handleBlur();
                  if (justPickedRef.current) { justPickedRef.current = false; return; }
                  commitFieldBlur('repeatJobReference', e.target.value);
                }}
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
                        justPickedRef.current = true;
                        commitFieldBlur('repeatJobReference', j.jobNumber);
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
          canManage={canManage}
        />
      )}
    </div>
  );
}
