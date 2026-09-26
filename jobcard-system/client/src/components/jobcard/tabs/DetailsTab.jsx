import { useEffect, useRef, useState, useId } from 'react';
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
  noteCompanyTyping,
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

  // Both suggestion lists are worked from the keyboard without focus ever leaving
  // the box: the arrow keys move a highlight, Enter takes the highlighted one.
  // Moving focus into the list instead would collide with the blur that closes it.
  // -1 means "nothing highlighted", so Enter falls through to the form as before.
  const companyListId = useId();
  const jobRefListId = useId();
  const [companyActive, setCompanyActive] = useState(-1);
  const [jobRefActive, setJobRefActive] = useState(-1);
  const companyListOpen = showContactDropdown && fieldFocused && companyMatches.length > 0;
  const jobRefListOpen = jobSearch.showDropdown && jobSearch.focused && jobSearch.matches.length > 0;

  // A new set of suggestions starts with nothing highlighted — carrying the old
  // position over would point at a different customer than the one under it.
  useEffect(() => { setCompanyActive(-1); }, [companyMatches]);
  useEffect(() => { setJobRefActive(-1); }, [jobSearch.matches]);

  const moveWithin = (count, current, key) => {
    if (key === 'ArrowDown') return current < count - 1 ? current + 1 : 0;
    if (key === 'ArrowUp') return current > 0 ? current - 1 : count - 1;
    return null;
  };
  // Picking a suggestion fires mousedown, which sets the field, BEFORE the input
  // blurs — and that blur still reads the DOM's old text, so letting it write
  // would put the half-typed reference back over the job number just chosen. The
  // pick does its own write and flips this, and the blur behind it stands aside.
  // Typing again disarms it: an Enter pick leaves focus in the box, so without that
  // the flag would outlive the blur it was meant for and eat a real edit.
  const justPickedRef = useRef(false);
  // Same race, for the company box: a pick's mousedown sets companyId BEFORE the
  // blur that follows it fires, and that blur's e.target.value is still the
  // pre-pick typed text — so the box's own re-capitalisation on blur was rebuilding
  // that stale text and writing it back over the just-picked customer, dropping
  // the pick (companyId cleared) and offering to create a duplicate instead.
  const justPickedCompanyRef = useRef(false);
  const { setQuery: setJobSearchQuery } = jobSearch;

  useEffect(() => {
    if (jobSearch.query !== (formData.repeatJobReference || '')) {
      setJobSearchQuery(formData.repeatJobReference || '');
    }
  }, [formData.repeatJobReference, jobSearch.query, setJobSearchQuery]);

  // One pick, whether it came from the mouse or from Enter on the highlighted row.
  // It writes the job number itself and flags the blur behind it to stand aside —
  // that blur still reads the half-typed text and would put it back over this.
  const pickJobReference = (job) => {
    setFormData(prev => ({ ...prev, repeatJobReference: job.jobNumber }));
    jobSearch.selectMatch(job.jobNumber);
    justPickedRef.current = true;
    commitFieldBlur('repeatJobReference', job.jobNumber);
  };

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
              <label htmlFor="jc-company-name">Company <span className="required">*</span></label>
              <div className="autocomplete-container">
                <input
                  id="jc-company-name"
                  type="text"
                  value={contactFormData.companyName}
                  onChange={(e) => {
                    // Typing again after a pick disarms the guard below — an Enter
                    // pick leaves focus in the box, so without this the flag would
                    // outlive the blur it was meant for and eat a real edit.
                    justPickedCompanyRef.current = false;
                    // A pick closed the list; with Enter the cursor never left the
                    // box, so only this brings the matching customers back.
                    noteCompanyTyping();
                    handleContactFieldChange('companyName', e.target.value);
                  }}
                  onFocus={handleFieldFocus}
                  onBlur={(e) => {
                    handleFieldBlur();
                    // The pick just fired its own write; this blur's e.target.value
                    // is still the pre-pick text, so re-capitalising it here would
                    // overwrite the pick with a mis-cased version of what was typed.
                    if (justPickedCompanyRef.current) { justPickedCompanyRef.current = false; return; }
                    const formatted = toTitleCase(e.target.value);
                    if (formatted !== e.target.value) handleContactFieldChange('companyName', formatted);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { e.stopPropagation(); e.target.blur(); return; }
                    if (!companyListOpen) return;
                    const next = moveWithin(companyMatches.length, companyActive, e.key);
                    if (next !== null) { e.preventDefault(); setCompanyActive(next); return; }
                    if (e.key === 'Enter' && companyActive >= 0) {
                      e.preventDefault();
                      justPickedCompanyRef.current = true;
                      selectCompany(companyMatches[companyActive]);
                    }
                  }}
                  role="combobox"
                  aria-expanded={companyListOpen}
                  aria-controls={companyListId}
                  aria-autocomplete="list"
                  aria-activedescendant={companyActive >= 0 ? `${companyListId}-${companyActive}` : undefined}
                  autoComplete="off"
                  className={!contactFormData.companyName.trim() ? 'field-required' : ''}
                />
                {companyListOpen && (
                  <div className="customer-dropdown" id={companyListId} role="listbox" aria-label="Matching customers">
                    {companyMatches.map((c, i) => (
                      <div
                        key={c.id}
                        id={`${companyListId}-${i}`}
                        role="option"
                        aria-selected={i === companyActive}
                        className={`customer-option${i === companyActive ? ' is-active' : ''}`}
                        onMouseDown={() => { justPickedCompanyRef.current = true; selectCompany(c); }}
                        onMouseEnter={() => setCompanyActive(i)}
                      >
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
              <label htmlFor="jc-contact">Contact</label>
              {selectedCompany && people.length > 0 ? (
                <select
                  id="jc-contact"
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
                  id="jc-contact"
                  type="text"
                  value={contactFormData.contactName}
                  onChange={(e) => handleContactFieldChange('contactName', e.target.value)}
                  onBlur={titleCaseBlur('contactName', handleContactFieldChange)}
                />
              )}
            </div>
          </div>
          {selectedCompany && people.length > 0 && !contactFormData.contactId && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="jc-new-contact-name">New contact name</label>
                <input
                  id="jc-new-contact-name"
                  type="text"
                  value={contactFormData.contactName}
                  onChange={(e) => handleContactFieldChange('contactName', e.target.value)}
                  onBlur={titleCaseBlur('contactName', handleContactFieldChange)}
                />
                <span className="field-hint">They'll be added under {selectedCompany.name}.</span>
              </div>
            </div>
          )}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="jc-phone">Phone</label>
              <input
                id="jc-phone"
                type="tel"
                value={contactFormData.phone}
                onChange={(e) => handleContactFieldChange('phone', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="jc-email">Email</label>
              <input
                id="jc-email"
                type="email"
                value={contactFormData.email}
                onChange={(e) => handleContactFieldChange('email', e.target.value)}
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
            <label htmlFor="jc-po-number">Customer's PO Number</label>
            <input
              id="jc-po-number"
              type="text"
              name="poNumber"
              value={formData.poNumber}
              onChange={handleChange}
              onBlur={(e) => commitFieldBlur('poNumber', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="jc-quote-reference">Quote Reference</label>
            <input
              id="jc-quote-reference"
              type="text"
              name="quoteReference"
              value={formData.quoteReference}
              onChange={handleChange}
              onBlur={(e) => commitFieldBlur('quoteReference', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="jc-qa-level">Quality Level</label>
            <select
              id="jc-qa-level"
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
            <label htmlFor="jc-repeat-job">Repeat Job</label>
            <label className="checkbox-inline">
              <input
                id="jc-repeat-job"
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
            <label htmlFor="jc-repeat-job-reference">Previous Job Reference</label>
            <div className="autocomplete-container">
              <input
                id="jc-repeat-job-reference"
                type="text"
                name="repeatJobReference"
                value={formData.repeatJobReference || ''}
                onChange={(e) => {
                  // The pick is only allowed to silence the blur that comes straight
                  // behind it. Enter picks without blurring at all, so the flag would
                  // otherwise sit armed and swallow whatever blur followed the user's
                  // next edit — saving the picked number over the corrected one.
                  justPickedRef.current = false;
                  // And the list comes back: an Enter pick closed it without the
                  // cursor ever leaving the box.
                  jobSearch.noteTyping();
                  jobSearch.setQuery(e.target.value);
                  handleChange(e);
                }}
                onFocus={jobSearch.handleFocus}
                onBlur={(e) => {
                  jobSearch.handleBlur();
                  if (justPickedRef.current) { justPickedRef.current = false; return; }
                  commitFieldBlur('repeatJobReference', e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { e.stopPropagation(); e.target.blur(); return; }
                  if (!jobRefListOpen) return;
                  const next = moveWithin(jobSearch.matches.length, jobRefActive, e.key);
                  if (next !== null) { e.preventDefault(); setJobRefActive(next); return; }
                  if (e.key === 'Enter' && jobRefActive >= 0) {
                    e.preventDefault();
                    pickJobReference(jobSearch.matches[jobRefActive]);
                  }
                }}
                role="combobox"
                aria-expanded={jobRefListOpen}
                aria-controls={jobRefListId}
                aria-autocomplete="list"
                aria-activedescendant={jobRefActive >= 0 ? `${jobRefListId}-${jobRefActive}` : undefined}
                placeholder="DH-00001"
                autoComplete="off"
              />
              {jobRefListOpen && (
                <div className="customer-dropdown" id={jobRefListId} role="listbox" aria-label="Matching jobs">
                  {jobSearch.matches.map((j, i) => (
                    <div
                      key={j.id}
                      id={`${jobRefListId}-${i}`}
                      role="option"
                      aria-selected={i === jobRefActive}
                      className={`customer-option${i === jobRefActive ? ' is-active' : ''}`}
                      onMouseEnter={() => setJobRefActive(i)}
                      onMouseDown={() => pickJobReference(j)}
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
          // employees is the active list only (loaded by the modal that owns
          // this screen) — a worker archived after being put on this job would
          // otherwise vanish from the tiles with no way to untick them. Their own
          // assignee record still carries their name, so they're added back in
          // here, marked "(archived)"; an archived worker not on this job is
          // never shown.
          options={[
            ...employees.map(emp => ({ value: emp.id, label: emp.name || emp.username })),
            ...assignees
              .filter(a => !employees.some(e => e.id === a.userId))
              .map(a => ({ value: a.userId, label: `${a.userName || 'Unknown'} (archived)` }))
          ]}
          selectedValues={assignees.map(a => a.userId)}
          onToggle={(empId) => {
            const emp = employees.find(e => e.id === empId)
              || (() => {
                const archived = assignees.find(a => a.userId === empId);
                return archived ? { id: archived.userId, name: archived.userName } : null;
              })();
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
