import { useEffect } from 'react';
import { useJobSearch } from '../useJobSearch';
import { useComboboxNav } from '../useComboboxNav';
import { summarizeFieldStates } from '../useInstantSave';
import ItemsTab from './ItemsTab';
import DetailsReadOnlyView from './DetailsReadOnlyView';
import NotesSection from './NotesSection';
import ToggleTiles from '../../common/ToggleTiles';
import CustomerSection from './CustomerSection';
import JobReferenceFields from './JobReferenceFields';

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
  adoptExactCompany,
  typedCompanyMatch,
  selectPerson,
  selectedCompany,
  people,
  companyMatches,
  showContactDropdown,
  contactSearchRef,
  fieldFocused,
  handleFieldFocus,
  handleFieldBlur,
  contactGroupClass = () => 'form-group',
  contactErrorFor = () => null,
  contactErrorProps = (name) => ({ id: `${name}-error` }),
  employees,
  assignees,
  toggleAssignee,
  lineItems,
  addLineItem,
  updateLineItem,
  removeLineItem,
  onItemFieldChange,
  onItemFieldBlur,
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
  currentUserId,
  // True once the job is invoiced and closed (jobLock.js's isJobClosed, worked
  // out once in JobCardModal.jsx off the job's own archived flag — the one
  // shared "can this job still be changed?" test). Locks the whole of this
  // view below, for every role, including management.
  jobClosed = false
}) {
  const readOnly = isEdit && !canManage;
  // Only ever read in the management view below (the worker view's own tiles are
  // always readOnly, hardcoded in DetailsReadOnlyView) — locked once the job is
  // closed, same as the rest of that view (see jc-lock-fieldset below).
  const assigneesLocked = isEdit && jobClosed;

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

  const companyListOpen = showContactDropdown && fieldFocused && companyMatches.length > 0;
  const jobRefListOpen = jobSearch.showDropdown && jobSearch.focused && jobSearch.matches.length > 0;

  // One pick, whether it came from the mouse or from Enter on the highlighted row.
  // It writes the job number itself; the blur right behind it (a mouse pick) or
  // the blur that follows once the box is next left (Enter, which never blurs on
  // its own) still reads the half-typed text and would put it back over this,
  // which is exactly what the pick guard armed by jobRefNav.choose stands aside
  // for.
  const pickJobReference = (job) => {
    setFormData(prev => ({ ...prev, repeatJobReference: job.jobNumber }));
    jobSearch.selectMatch(job.jobNumber);
    commitFieldBlur('repeatJobReference', job.jobNumber);
  };

  // Highlight index, wrap-around, reset-to-nothing-on-change, Enter-to-pick,
  // Escape and the "pick stands the next blur down" guard are shared with
  // LineItemSupplierPicker (useComboboxNav.js) — both boxes are worked from the
  // keyboard without focus ever leaving them, since moving focus into the list
  // would fire the blur that closes it.
  const companyNav = useComboboxNav({
    items: companyMatches,
    isOpen: companyListOpen,
    onChoose: (i) => selectCompany(companyMatches[i])
  });
  const jobRefNav = useComboboxNav({
    items: jobSearch.matches,
    isOpen: jobRefListOpen,
    onChoose: (i) => pickJobReference(jobSearch.matches[i])
  });

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
            locked={jobClosed}
          />
        )}
      </>
    );
  }

  return (
    <div className="modal-form-grid">
    {/* A closed job locks every field, part and worker below for management too
        (workers already get the read-only view above) — a plain <fieldset disabled>
        refuses interaction with everything inside it, native controls and nested
        components alike, without threading a lock prop through each one. See
        .jc-lock-fieldset in JobCardModal.css (display: contents, so the grid is
        unchanged). The comments sit outside it: they lock themselves (locked below)
        and keep their view-only Retry button working. */}
    <fieldset className="jc-lock-fieldset" disabled={jobClosed}>
      {/* Customer — frozen after creation: picked on create, read-only on edit (management only) */}
      {canManage && (
        <CustomerSection
          isEdit={isEdit}
          contactFormData={contactFormData}
          selectedCompany={selectedCompany}
          people={people}
          contactSearchRef={contactSearchRef}
          handleContactFieldChange={handleContactFieldChange}
          selectPerson={selectPerson}
          noteCompanyTyping={noteCompanyTyping}
          adoptExactCompany={adoptExactCompany}
          typedCompanyMatch={typedCompanyMatch}
          handleFieldFocus={handleFieldFocus}
          handleFieldBlur={handleFieldBlur}
          companyMatches={companyMatches}
          companyListOpen={companyListOpen}
          companyNav={companyNav}
          contactGroupClass={contactGroupClass}
          contactErrorFor={contactErrorFor}
          contactErrorProps={contactErrorProps}
        />
      )}

      <ItemsTab
        jobCardId={jobCardId}
        lineItems={lineItems}
        addLineItem={addLineItem}
        updateLineItem={updateLineItem}
        removeLineItem={removeLineItem}
        onItemFieldChange={onItemFieldChange}
        onItemFieldBlur={onItemFieldBlur}
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


      <JobReferenceFields
        formData={formData}
        handleChange={handleChange}
        commitFieldBlur={commitFieldBlur}
        qaLevels={qaLevels}
        setFormData={setFormData}
        canWriteInstantly={canWriteInstantly}
        saveField={saveField}
        detailsStatus={detailsStatus}
        jobSearch={jobSearch}
        jobRefListOpen={jobRefListOpen}
        jobRefNav={jobRefNav}
      />

      {/* Assignees */}
      <div className="form-section">
        <h3 className="form-section-title">Assignees</h3>
        {assigneesLocked && (
          <span className="field-hint">This job is invoiced and closed. Its workers can't be changed.</span>
        )}
        <ToggleTiles
          ariaLabel="Assignees"
          readOnly={assigneesLocked}
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
    </fieldset>

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
          locked={jobClosed}
        />
      )}
    </div>
  );
}
