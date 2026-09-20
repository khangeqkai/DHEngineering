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
import { useJobCardSave } from './useJobCardSave';
import { useUnsavedGuard } from './useUnsavedGuard';
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

// Read a picked file into the base64 string the upload route expects.
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
  const contactHook = useContactSearch();
  const formHook = useJobCardForm();
  const activityLog = useActivityLog(jobCardId);
  const reloadTimeEntriesRef = useRef(null);
  const hubRef = useRef(null);
  const onExternalStop = useCallback(() => {
    if (reloadTimeEntriesRef.current) reloadTimeEntriesRef.current();
  }, []);
  const timer = useTimer(isEdit ? jobCardId : null, { onExternalStop });
  const { dialogState, showConfirm, handleCancel, handleConfirm, handleAlt } = useConfirmDialog();

  const jobNotes = useJobNotes(isEdit ? jobCardId : null, showConfirm, onNotesChange);
  // Pricing: the on-open load, the invoiced-job question, and the save-on-the-way-out
  // paths all live in this hook — see useJobCardCosting.js.
  const costingHook = useJobCardCosting({
    isOpen, isEdit, isAdmin, jobCardId, activeTab, showConfirm,
    isInvoiced: formHook.formData.status === 'INVOICED'
  });

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
  const reloadTimeEntriesAndCosting = useCallback(async () => {
    await reloadTimeEntries();
    // Costing endpoint is admin-only; skip for non-admin to avoid 403 toast. Also skip
    // unless this job's stored pricing has actually arrived on screen — before that
    // there's nothing to update, and the first load is already on its way with the
    // latest hours anyway. Tests costingLoaded rather than costingOpened so a load that
    // failed isn't retried on every timer tick, and so this never writes hours onto a
    // still-default sheet ahead of the real figures landing.
    if (isAdmin && costingLoaded) await refreshCosting();
    await refreshJobStatus();
  }, [reloadTimeEntries, isAdmin, costingLoaded, refreshCosting, refreshJobStatus]);

  const handleSubmitEntryForm = useCallback(async () => {
    await timer.submitEntryForm(reloadTimeEntriesAndCosting);
    if (onTimerChange) onTimerChange();
  }, [timer, reloadTimeEntriesAndCosting, onTimerChange]);

  const handleCancelEntryForm = useCallback(async () => {
    await timer.cancelEntryForm(reloadTimeEntriesAndCosting);
    if (onTimerChange) onTimerChange();
  }, [timer, reloadTimeEntriesAndCosting, onTimerChange]);

  const { creditAssignee, dropAssignee } = formHook;
  const apiTimeEntryOperations = {
    addTimeEntry: async (data) => {
      await api.addTimeEntry(jobCardId, data);
      creditAssignee(data.workerId, employees);
      await reloadTimeEntriesAndCosting();
    },
    updateTimeEntry: async (id, data) => {
      await api.updateTimeEntry(jobCardId, id, data);
      creditAssignee(data.workerId, employees);
      await reloadTimeEntriesAndCosting();
    },
    deleteTimeEntry: async (id) => {
      await api.deleteTimeEntry(jobCardId, id);
      await reloadTimeEntriesAndCosting();
    }
  };

  const handleStartItemTimer = useCallback(async (itemNumber, workerId, workerName) => {
    await timer.startTimerWithConflictCheck(itemNumber, showConfirm, workerId, workerName);
    await reloadTimeEntries();
    // Server may have auto-assigned the timer's worker and nudged the status.
    creditAssignee(workerId || user?.id, employees);
    try {
      const fresh = await api.getJobcard(jobCardId);
      if (fresh.status) setFormData(prev => ({ ...prev, status: fresh.status }));
    } catch {
      // Non-fatal — status will refresh next time the modal opens
    }
    if (onTimerChange) onTimerChange();
  }, [timer, showConfirm, reloadTimeEntries, onTimerChange, jobCardId, creditAssignee, employees, setFormData, user?.id]);

  // Both stop paths land here. A tap discarded as an accident is undone server-side,
  // so untick the worker it put on — a Save would otherwise put them straight back.
  const afterStop = useCallback(async (result) => {
    if (result?.unassignedUserId) {
      dropAssignee(result.unassignedUserId);
    }
    await reloadTimeEntries();
    await refreshJobStatus();
    if (onTimerChange) onTimerChange();
  }, [reloadTimeEntries, refreshJobStatus, onTimerChange, dropAssignee]);

  const handleStopItemTimer = useCallback(
    () => timer.stopTimer().then(afterStop), [timer, afterStop]);

  // Admin stops a running timer from a line's Progress list (their own or one they
  // set up for a worker). Opens the same fill-in form so the pieces/scrap/description
  // for that run get recorded, instead of silently dropping a blank block.
  const handleStopEntryWithForm = useCallback(
    (entry) => timer.stopEntryWithForm(entry).then(afterStop), [timer, afterStop]);

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

  useEffect(() => {
    if (!isOpen) return;
    resetFormRef.current();
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

  // The Save itself — validation, the customer on a new job, the pricing flush before
  // invoicing, and the "files still missing" reply — lives in useJobCardSave.js.
  const { saving, handleSubmit } = useJobCardSave({
    canManage, isEdit, jobCardId, formHook, contactHook, costingHook,
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

  // Everything about work that would be lost if this screen went away — the close
  // question, the refresh guard, the inactivity countdown and the spoken status — lives
  // in useUnsavedGuard.js. It answers a wider question than isDirty: see its header.
  const { hasEditedSinceOpen, handleRequestClose } = useUnsavedGuard({
    isOpen,
    isDirty,
    saving,
    hasUnpostedNote: jobNotes.newNote.trim() !== '',
    stopFormOpen: timer.showEntryForm,
    costingDirty: isAdmin ? costingHook.costingDirty : false,
    showConfirm,
    onClose
  });

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
      isOverdue={isOverdue}
      showConfirm={showConfirm}
      onSuccess={onSuccess}
      costingDirty={isAdmin ? costingHook.costingDirty : false}
      canSeeTotal={isAdmin && isEdit}
      fetchCurrentTotal={costingHook.fetchCurrentTotal}
      saveCosting={costingHook.handleSaveCosting}
    />
  );

  return (
    <>
      <BottomSheet
        isOpen={isOpen}
        onClose={handleRequestClose}
        unsaved={isEdit && isDirty}
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
                  removeLineItem={formHook.removeLineItem}
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

            {(canManage || !isEdit) && (
              <BottomSheet.Footer>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : !isEdit ? 'Create' : isDirty ? 'Save changes' : 'Update'}
                </button>
                {/* The amber ring and the button's change of wording both say "not saved
                    yet" silently. This is the same thing in words, for a screen reader —
                    the same approach the pricing sheet's status line already takes. It
                    holds one message at a time, so the reader is told once when edits
                    appear and once when they are gone, not on every keystroke. */}
                <span className="sr-only" role="status" aria-live="polite">
                  {isEdit && hasEditedSinceOpen
                    ? (isDirty ? 'This job card has unsaved changes.' : 'All changes saved.')
                    : ''}
                </span>
              </BottomSheet.Footer>
            )}
          </form>
        )}
      </BottomSheet>

      <StopTimerForm
        isOpen={timer.showEntryForm}
        jobCard={timer.stoppedEntryJobCard || (jobCardId ? { id: jobCardId, jobNumber: formHook.jobNumber } : null)}
        itemNumber={timer.stoppedEntry?.itemNumber}
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
