import { useEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import BottomSheet from '../common/BottomSheet';
import ConfirmDialog from '../common/ConfirmDialog';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { isManagement } from '../../utils/roles';
import { todayIsoDate } from '../../utils/formatters';
import { isJobOverdue } from '../JobCardList.constants';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import './JobCardModal.css';
import { useJobCardCosting } from './useJobCardCosting';
import { useTimeEntries } from './useTimeEntries';
import { useContactSearch } from './useContactSearch';
import { useJobCardForm } from './useJobCardForm';
import { useJobCardInstantSaves } from './useJobCardInstantSaves';
import { useJobCardSave } from './useJobCardSave';
import { useJobCardCloseGuard, useJobCardListRefresh } from './useJobCardCloseGuard';
import { useJobCardTimerActions } from './useJobCardTimerActions';
import { useSavedFlash } from './useSavedFlash';
import DetailsTab from './tabs/DetailsTab';
import CostingTab from './tabs/CostingTab';
import ActivityLogTab from './tabs/ActivityLogTab';
import { useActivityLog } from './useActivityLog';
import { useTimer } from './useTimer';
import { useJobNotes } from './useJobNotes';
import StopTimerForm from './StopTimerForm';
import JobPaperworkHub from './JobPaperworkHub';
import JobIdentityStrip from './JobIdentityStrip';
import { mapTimeEntryFromApi } from './mappers';

export default function JobCardModal({ isOpen, onClose, jobCardId = null, onSuccess, onTimerChange, onNotesChange, onPrinted, initialTab = null }) {
  const { user } = useAuth();
  const isEdit = Boolean(jobCardId);
  // Two tiers: costing is admin-only money; everything else managerial on this
  // screen (editing, tabs, time-entry corrections) is admin-or-manager.
  const isAdmin = user?.role === 'admin';
  const canManage = isManagement(user);
  const [activeTab, setActiveTab] = useState('details');
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [machines, setMachines] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [qaLevels, setQaLevels] = useState([]);
  const [attachmentWarnings, setAttachmentWarnings] = useState(null);
  // An instant write never touches the list behind this modal — useJobCardCloseGuard.js.
  const { flagInstantSave, closeAndRefresh } = useJobCardListRefresh({ isOpen, isEdit, onSuccess, onClose });
  const contactHook = useContactSearch();
  // formHook also owns the one save queue for this open job card (Contract A) —
  // formHook.saveQueue — that every instant write (a field, a part, a worker)
  // routes through, so what's queued, in flight or failed is one recorded fact
  // instead of three separate hand-rolled promise-chain registries.
  const formHook = useJobCardForm(jobCardId, { onInstantSave: flagInstantSave });
  // The details fields and the parts list save themselves through these (see
  // useJobCardInstantSaves.js). A part write's reply also refreshes the file
  // notes here (Contract B) — setAttachmentWarnings is the one landing point,
  // whether the write came from a part being added, edited or removed.
  const { instantSave, instantItems, resetInstantSaves } = useJobCardInstantSaves(formHook, isEdit, jobCardId, formHook.saveQueue, setAttachmentWarnings);
  const activityLog = useActivityLog(jobCardId);
  const reloadTimeEntriesRef = useRef(null);
  const resetInstantSavesRef = useRef(null);
  const hubRef = useRef(null);
  const onExternalStop = useCallback(() => {
    if (reloadTimeEntriesRef.current) reloadTimeEntriesRef.current();
  }, []);
  // lineItems is handed in so the timer's own toasts and switch-timer prompts can
  // name a part by its position in this job's list, never by its stored number.
  const timer = useTimer(isEdit ? jobCardId : null, { onExternalStop, lineItems: formHook.lineItems });
  const { dialogState, showConfirm, handleCancel, handleConfirm, handleAlt, cancelConfirms } = useConfirmDialog();

  // Questions belong to the open card. Once it closes nothing renders the box any more,
  // so anything still waiting for an answer is answered "no" here — left outstanding it
  // would never settle, and the next question asked would queue behind a box that can
  // no longer be seen.
  useEffect(() => {
    if (!isOpen) cancelConfirms();
  }, [isOpen, cancelConfirms]);

  const jobNotes = useJobNotes(isEdit ? jobCardId : null, showConfirm, onNotesChange);
  // Pricing: the on-open load and the save-on-the-way-out paths all live in this hook —
  // see useJobCardCosting.js.
  const costingHook = useJobCardCosting({ isOpen, isEdit, isAdmin, jobCardId, activeTab });

  // Re-fetch suppliers after one is created or linked to a treatment on a line item,
  // so the new name and its updated services show up in the pickers right away.
  const reloadSuppliers = useCallback(async () => {
    try {
      const res = await api.getSuppliers(true);
      setSuppliers(res || []);
    } catch (err) {
      // Non-fatal: the picker keeps its current list until the next load.
    }
  }, []);

  // Load reference data on mount
  useEffect(() => {
    const loadReferenceData = async () => {
      try {
        const [suppliersRes, usersRes, machinesRes, qaLevelsRes] = await Promise.all([
          // Include archived suppliers: the pickers filter to active themselves, but a job
          // that already chose a since-archived supplier needs it here to show it "(retired)".
          api.getSuppliers(true),
          api.getEmployees(),
          api.getMachines(),
          api.getQaLevels()
        ]);
        setSuppliers(suppliersRes || []);
        setQaLevels(qaLevelsRes || []);
        const activeEmployees = (usersRes || [])
          .filter(u => u.active === 1 || u.active === true)
          .sort((a, b) => (a.name || a.username || '').localeCompare(b.name || b.username || ''));
        setEmployees(activeEmployees);
        setMachines(machinesRes || []);
      } catch (err) {
        toast.error('Failed to load reference data');
      }
    };
    loadReferenceData();
  }, []);
  const { setFormDataFromJobCard, setFormData, resetForm: resetFormHook } = formHook;
  const { setContactFromJobCard, resetContact } = contactHook;
  const { loadHistory, resetHistory } = activityLog;
  const { loadNotes } = jobNotes;
  // Tracks which job's load should "win". A load only applies its result if the
  // modal is still showing the same job when the request resolves, so a slow
  // response for a just-closed job can't paint over a newly opened one.
  const currentLoadRef = useRef(null);
  const loadJobCard = useCallback(async () => {
    if (!isEdit || !jobCardId) return;

    currentLoadRef.current = jobCardId;
    setLoading(true);
    try {
      const [jobcardRes, timeEntriesRes] = await Promise.all([
        api.getJobcard(jobCardId),
        api.getTimeEntries(jobCardId)
      ]);

      if (currentLoadRef.current !== jobCardId) return;  // superseded by a newer load — ignore

      const jobcardData = jobcardRes;
      setFormDataFromJobCard(jobcardData);
      setContactFromJobCard(jobcardData);
      setAttachmentWarnings(jobcardData.attachmentWarnings || null);
      setTimeEntries((timeEntriesRes || []).map(mapTimeEntryFromApi));

      loadNotes();

      // Costing loads separately, in useJobCardCosting, and only once the pricing screen
      // has actually been opened — the fetch walks every logged minute, and most job
      // opens never touch pricing at all.
    } catch (err) {
      if (currentLoadRef.current !== jobCardId) return;  // stale failure for a closed job — don't disturb the current one
      toast.error('Failed to load job card. Please try again.');
      onClose();
    } finally {
      if (currentLoadRef.current === jobCardId) setLoading(false);
    }
  }, [isEdit, jobCardId, setFormDataFromJobCard, setContactFromJobCard, loadNotes, onClose]);

  // Re-read just the "declared but no file" flags after a file is added, so the
  // per-item hints and the QA-forms note clear without reopening the job.
  const refreshAttachmentWarnings = useCallback(async () => {
    if (!jobCardId) return;
    try {
      const fresh = await api.getJobcard(jobCardId);
      setAttachmentWarnings(fresh.attachmentWarnings || null);
    } catch {
      // Non-fatal — hints refresh next time the job card opens
    }
  }, [jobCardId]);

  // The per-part Attach button opens the paperwork hub pointed at that part, so
  // adding a file there ties it to the part (instead of popping a bare file dialog
  // whose upload lands as a whole-job file that never clears the part's warning).
  const handleAttachItemFile = useCallback((itemId, itemNumber, category) => {
    hubRef.current?.openForPart(itemId, itemNumber, category);
  }, []);

  useEffect(() => {
    if (isOpen && isEdit && activeTab === 'activity') {
      loadHistory();
    }
  }, [isOpen, isEdit, activeTab, loadHistory]);

  const reloadTimeEntries = useCallback(async () => {
    const res = await api.getTimeEntries(jobCardId);
    setTimeEntries((res || []).map(mapTimeEntryFromApi));
  }, [jobCardId]);
  reloadTimeEntriesRef.current = reloadTimeEntries;

  // Logging work can auto-advance the job's status on the server (start a timer ->
  // In Progress; finish the last part -> Done). Pull just the current status back so
  // the on-screen status updates without disturbing any edits in the open form.
  const refreshJobStatus = useCallback(async () => {
    if (!isEdit || !jobCardId) return;
    try {
      const fresh = await api.getJobcard(jobCardId);
      if (fresh && fresh.status) {
        setFormData(prev => ({ ...prev, status: fresh.status }));
      }
    } catch {
      // Non-fatal — the status will catch up next time the job is opened.
    }
  }, [isEdit, jobCardId, setFormData]);

  const { costingLoaded, refreshCosting } = costingHook;
  const { creditAssignee, dropAssignee } = formHook;
  // Starting/stopping a timer, the stop-timer form and the manual add/edit form —
  // pulled into its own hook (useJobCardTimerActions.js) purely to keep this file
  // under the 600-line limit; every dependency here is something this component
  // already holds.
  const {
    apiTimeEntryOperations,
    handleStartItemTimer,
    handleStopItemTimer,
    handleStopEntryWithForm,
    handleSubmitEntryForm,
    handleCancelEntryForm
  } = useJobCardTimerActions({
    jobCardId, isAdmin, costingLoaded, refreshCosting, refreshJobStatus,
    reloadTimeEntries, timer, showConfirm, creditAssignee, dropAssignee,
    employees, currentUserId: user?.id, setFormData, onTimerChange
  });

  const timeEntry = useTimeEntries(jobCardId, {
    ...apiTimeEntryOperations,
    showConfirm,
    isInvoiced: formHook.formData.status === 'INVOICED'
  });
  const { resetTimeEntries } = timeEntry;
  const { resetCosting } = costingHook;
  const { resetTimer } = timer;
  const { resetNotes } = jobNotes;
  const resetForm = useCallback(() => {
    resetFormHook();
    resetContact();
    setTimeEntries([]);
    setAttachmentWarnings(null);
    resetTimeEntries();
    resetCosting();
    resetTimer();
    resetNotes();
    resetHistory();
  }, [resetFormHook, resetContact, resetTimeEntries, resetCosting, resetTimer, resetNotes, resetHistory]);
  useEffect(() => {
    if (isOpen) {
      // Only tabs this user can actually open are valid; anything else (a stale
      // 'costing' or 'activity' for a non-admin) lands on Details.
      const validTabs = isAdmin
        ? ['details', 'costing', 'activity']
        : ['details'];
      setActiveTab(validTabs.includes(initialTab) ? initialTab : 'details');
    }
  }, [isOpen, initialTab]);

  // Admin access can also be lost while the modal is already open. The tab strip
  // and the Costing/Activity panels vanish on that render, so without this the
  // body would draw nothing at all. Kept separate from the effect above so it
  // never re-applies initialTab mid-session.
  useEffect(() => {
    if (!isAdmin && activeTab !== 'details') setActiveTab('details');
  }, [isAdmin, activeTab]);

  const resetFormRef = useRef(resetForm);
  const loadJobCardRef = useRef(loadJobCard);
  const loadActiveTimerRef = useRef(timer.loadActiveTimer);
  resetFormRef.current = resetForm;
  loadJobCardRef.current = loadJobCard;
  loadActiveTimerRef.current = timer.loadActiveTimer;
  resetInstantSavesRef.current = resetInstantSaves;

  useEffect(() => {
    if (!isOpen) return;
    resetFormRef.current(); // also clears formHook's save queue — see useJobCardForm.js
    resetInstantSavesRef.current();
    if (isEdit) {
      loadJobCardRef.current();
      // Re-fetch active timer every time the modal opens — useTimer's own
      // load effect only fires on jobcardId change, so reopening the same
      // card after a close would otherwise keep activeTimer cleared by reset.
      loadActiveTimerRef.current();
    }
  }, [isOpen, isEdit, jobCardId]);

  const selectCompany = (company) => contactHook.selectCompany(company, formHook.setFormData);
  const selectPerson = (personId) => contactHook.selectPerson(personId, formHook.setFormData);
  const handleContactFieldChange = (field, value) => contactHook.handleContactFieldChange(field, value, formHook.setFormData);

  // Create-only now (useJobCardSave.js) — an existing job has nothing left for a
  // Save to do; every field, row and worker writes itself the moment it changes.
  const { saving, handleSubmit } = useJobCardSave({
    canManage, isEdit, formHook, contactHook,
    showConfirm, onSuccess, onClose, setAttachmentWarnings
  });

  // On a brand-new job the customer is picked through useContactSearch, a hook whose
  // state useJobCardForm never sees, so its own isDirty can't cover it. Folded in here
  // instead, where both hooks are already in scope, rather than reaching into
  // useJobCardForm to pass that state (and a second baseline) across. Existing jobs
  // don't need this: the customer is chosen once at creation and the fields are frozen
  // and read-only after that (see useJobCardSave.js), so contactFormData can't change
  // under an edit.
  const isContactDirty = !isEdit && (
    contactHook.contactFormData.companyName !== '' ||
    contactHook.contactFormData.companyId !== '' ||
    contactHook.contactFormData.contactName !== '' ||
    contactHook.contactFormData.contactId !== '' ||
    contactHook.contactFormData.phone !== '' ||
    contactHook.contactFormData.email !== ''
  );
  const isDirty = formHook.isDirty || isContactDirty;

  // Work that would be lost if this screen went away: the close question (which
  // box is empty vs. what failed to save — closeReasons.js), the refresh guard,
  // the inactivity countdown and the spoken status (useUnsavedGuard.js's header).
  // Every real close funnels through the onClose handed to it below.
  const showDetailsTab = useCallback(() => setActiveTab('details'), []);
  const { hasEditedSinceOpen, handleRequestClose } = useJobCardCloseGuard({
    isOpen, isEdit, jobCardId, isAdmin, isDirty,
    formHook, instantItems, saveQueue: formHook.saveQueue, jobNotes, timer, costingHook,
    saving, showConfirm, onClose: closeAndRefresh, revealDetails: showDetailsTab
  });

  // The window frame is the whole answer to "did that save?" on an existing job —
  // amber while something on screen hasn't reached the job, green for a moment once
  // it has. It replaces the small "Saving… / Saved" the header used to carry, which
  // there is no longer room for beside the job number, priority, description, status
  // and due date. Must sit above the early return below — it is a hook.
  const savedFlash = useSavedFlash(isEdit && hasEditedSinceOpen && !isDirty);

  if (!isOpen) return null;
  // Same plain calendar-date comparison the job list uses, so the two never disagree.
  const today = todayIsoDate();
  const isOverdue = isJobOverdue(formHook.formData.dueDate, formHook.formData.status, today);

  const headerStrip = (
    <JobIdentityStrip
      isEdit={isEdit}
      canManage={canManage}
      jobCardId={jobCardId}
      jobNumber={formHook.jobNumber}
      formData={formHook.formData}
      setFormData={formHook.setFormData}
      savedForm={formHook.savedForm}
      saveField={instantSave.saveField}
      fieldStates={instantSave.fieldStates}
      isOverdue={isOverdue}
      showConfirm={showConfirm}
      onSuccess={onSuccess}
      costingDirty={isAdmin ? costingHook.costingDirty : false}
      canSeeTotal={isAdmin && isEdit}
      fetchCurrentTotal={costingHook.fetchCurrentTotal}
      saveCosting={costingHook.handleSaveCosting}
      descriptionError={formHook.descriptionError}
      setDescriptionError={formHook.setDescriptionError}
    />
  );

  return (
    <>
      <BottomSheet
        isOpen={isOpen}
        onClose={handleRequestClose}
        // No Save button any more, so this now means "something hasn't reached the
        // job" — a failed write, an empty required box, or a row mid-create/delete.
        // See useJobCardForm.js's isDirty comment and closeReasons.js.
        unsaved={isEdit && isDirty}
        // ...and green for a moment once the last of it has landed. Only after the
        // card has actually been edited: a window nobody has touched has nothing to
        // report, and a green frame on arrival would be reporting someone else's save.
        saved={savedFlash}
        headerSlot={headerStrip}
        size="large"
        headerActions={
          isEdit && jobCardId ? (
            <JobPaperworkHub
              ref={hubRef}
              jobcardId={jobCardId}
              jobNumber={formHook.jobNumber}
              onFilesChanged={refreshAttachmentWarnings}
              onPrinted={onPrinted}
              attachmentWarnings={attachmentWarnings}
              parts={formHook.lineItems}
            />
          ) : null
        }
      >
        {loading ? (
          <div className="loading" style={{ padding: '2rem' }}>Loading...</div>
        ) : (
          <form onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT' && e.target.type !== 'submit') e.preventDefault(); }} style={{ display: 'contents' }}>
            <BottomSheet.Body>
              <div className="jc-zoom-root">
              {isEdit && isAdmin && (
                <div className="modal-tabs">
                  <button type="button" className={`tab ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>
                    Details
                    {jobNotes.notes.length > 0 && <span className="tab-badge">{jobNotes.notes.length}</span>}
                  </button>
                  {isAdmin && (
                    <button type="button" className={`tab ${activeTab === 'costing' ? 'active' : ''}`} onClick={() => setActiveTab('costing')}>Costing</button>
                  )}
                  {isAdmin && (
                    <button type="button" className={`tab ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')}>Activity</button>
                  )}
                </div>
              )}

              {(activeTab === 'details' || !isEdit) && (
                <DetailsTab
                  isEdit={isEdit}
                  canManage={canManage}
                  jobCardId={jobCardId}
                  jobNumber={formHook.jobNumber}
                  activeTimer={timer.activeTimer}
                  timerElapsed={timer.elapsed}
                  timerLoading={timer.loading}
                  onStartTimer={handleStartItemTimer}
                  onStopTimer={handleStopItemTimer}
                  currentUserId={user?.id}
                  formData={formHook.formData}
                  setFormData={formHook.setFormData}
                  handleChange={formHook.handleChange}
                  savedForm={formHook.savedForm}
                  saveField={instantSave.saveField}
                  fieldStates={instantSave.fieldStates}
                  contactFormData={contactHook.contactFormData}
                  selectedCompany={contactHook.selectedCompany}
                  people={contactHook.people}
                  companyMatches={contactHook.companyMatches}
                  selectPerson={selectPerson}
                  handleContactFieldChange={handleContactFieldChange}
                  selectCompany={selectCompany}
                  showContactDropdown={contactHook.showContactDropdown}
                  contactSearchRef={contactHook.contactSearchRef}
                  fieldFocused={contactHook.fieldFocused}
                  handleFieldFocus={contactHook.handleFieldFocus}
                  handleFieldBlur={contactHook.handleFieldBlur}
                  employees={employees || []}
                  assignees={formHook.assignees}
                  toggleAssignee={formHook.toggleAssignee}
                  lineItems={formHook.lineItems}
                  addLineItem={formHook.addLineItem}
                  updateLineItem={formHook.updateLineItem}
                  removeLineItem={instantItems.removeItem}
                  onItemFieldChange={instantItems.handleItemFieldChange}
                  onItemFieldBlur={instantItems.commitItemFieldBlur}
                  onItemFieldType={instantItems.clearItemFieldErrorOnType}
                  itemErrorFor={instantItems.itemErrorFor}
                  suppliers={suppliers || []}
                  onSuppliersChanged={reloadSuppliers}
                  attachmentWarnings={attachmentWarnings}
                  onAttachItemFile={isEdit ? handleAttachItemFile : undefined}
                  qaLevels={qaLevels}
                  notes={jobNotes.notes}
                  newNote={jobNotes.newNote}
                  setNewNote={jobNotes.setNewNote}
                  onAddNote={jobNotes.addNote}
                  onDeleteNote={jobNotes.deleteNote}
                  notesLoading={jobNotes.loading}
                  notesLoadError={jobNotes.loadError}
                  onRetryNotes={jobNotes.loadNotes}
                  timeEntries={timeEntries || []}
                  machines={machines || []}
                  showTimeEntryForm={timeEntry.showTimeEntryForm}
                  editingTimeEntryId={timeEntry.editingTimeEntryId}
                  timeEntryForm={timeEntry.timeEntryForm}
                  handleTimeEntryChange={timeEntry.handleTimeEntryChange}
                  handleAddTimeEntry={timeEntry.handleAddTimeEntry}
                  handleEditTimeEntry={timeEntry.handleEditTimeEntry}
                  handleSaveTimeEntry={timeEntry.handleSaveTimeEntry}
                  handleDeleteTimeEntry={timeEntry.handleDeleteTimeEntry}
                  handleStopEntryWithForm={handleStopEntryWithForm}
                  resetTimeEntryForm={timeEntry.resetTimeEntryForm}
                  timeEntryGroupClass={timeEntry.groupClass}
                  timeEntryErrorFor={timeEntry.errorFor}
                />
              )}

              {activeTab === 'costing' && isEdit && isAdmin && (
                <CostingTab
                  costingForm={costingHook.costingForm}
                  openedAt={costingHook.openedAt}
                  handleCostingChange={costingHook.handleCostingChange}
                  resetTierHours={costingHook.resetTierHours}
                  resetTierMultiplier={costingHook.resetTierMultiplier}
                  useDefaultRate={costingHook.useDefaultRate}
                  calculateCostingTotals={costingHook.calculateCostingTotals}
                  saveState={costingHook.costingSaveState}
                  onFlushCosting={costingHook.flushCosting}
                  loaded={costingHook.costingLoaded}
                  loadFailed={costingHook.costingLoadFailed}
                  onRetryLoad={costingHook.retryLoadCosting}
                  lineItems={formHook.lineItems}
                  timeEntries={timeEntries}
                  machines={machines || []}
                />
              )}

              {activeTab === 'activity' && isEdit && isAdmin && (
                <ActivityLogTab
                  history={activityLog.history}
                  loading={activityLog.loadingHistory}
                  onRefresh={loadHistory}
                />
              )}
              </div>
            </BottomSheet.Body>

            {/* A new job keeps the Create button. An existing job writes itself, so
                there's no footer at all (an empty one would still draw its border) —
                just a bare sr-only status line, same approach as the pricing sheet's. */}
            {!isEdit ? (
              <BottomSheet.Footer>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Create'}
                </button>
              </BottomSheet.Footer>
            ) : canManage && (
              <span className="sr-only" role="status" aria-live="polite">
                {hasEditedSinceOpen
                  ? (isDirty ? 'This job card has unsaved changes.' : 'All changes saved.')
                  : ''}
              </span>
            )}
          </form>
        )}
      </BottomSheet>

      <StopTimerForm
        isOpen={timer.showEntryForm}
        jobCard={timer.stoppedEntryJobCard || (jobCardId ? { id: jobCardId, jobNumber: formHook.jobNumber } : null)}
        itemId={timer.stoppedEntry?.itemId}
        stoppedEntry={timer.stoppedEntry}
        entryForm={timer.entryForm}
        onFieldChange={timer.handleEntryFieldChange}
        onMachineToggle={timer.handleEntryMachineToggle}
        onSubmit={handleSubmitEntryForm}
        onCancel={handleCancelEntryForm}
        loading={timer.loading}
      />

      <ConfirmDialog
        isOpen={dialogState.isOpen}
        title={dialogState.title}
        message={dialogState.message}
        confirmLabel={dialogState.confirmLabel}
        cancelLabel={dialogState.cancelLabel}
        confirmVariant={dialogState.confirmVariant}
        altLabel={dialogState.altLabel}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        onAlt={handleAlt}
      />
    </>
  );
}
