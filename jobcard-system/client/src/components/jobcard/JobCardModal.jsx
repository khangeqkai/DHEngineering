import { useEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import BottomSheet from '../common/BottomSheet';
import ConfirmDialog from '../common/ConfirmDialog';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { isManagement } from '../../utils/roles';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import './JobCardModal.css';
import { useCosting } from './useCosting';
import { useTimeEntries } from './useTimeEntries';
import { useContactSearch } from './useContactSearch';
import { useJobCardForm } from './useJobCardForm';
import DetailsTab from './tabs/DetailsTab';
import CostingTab from './tabs/CostingTab';
import ActivityLogTab from './tabs/ActivityLogTab';
import { useActivityLog } from './useActivityLog';
import { useTimer } from './useTimer';
import { useJobNotes } from './useJobNotes';
import StopTimerForm from './StopTimerForm';
import JobPaperworkHub from './JobPaperworkHub';
import JobIdentityStrip from './JobIdentityStrip';
import { validateJobCardForm } from './jobCardValidation';
import { mapTimeEntryFromApi, mapCostingResponseToData, buildJobcardPayload } from './mappers';
import { confirmInvoiceAnyway, showFormErrors } from './jobCardPrompts';
import { resolveJobContactId } from './jobCardContact';

// Read a picked file into the base64 string the upload route expects.
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').replace(/^data:[^;]*;base64,/, ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export default function JobCardModal({ isOpen, onClose, jobCardId = null, onSuccess, onTimerChange, initialTab = null }) {
  const { user } = useAuth();
  const isEdit = Boolean(jobCardId);
  // Two tiers: costing is admin-only money; everything else managerial on this
  // screen (editing, tabs, time-entry corrections) is admin-or-manager.
  const isAdmin = user?.role === 'admin';
  const canManage = isManagement(user);
  const [activeTab, setActiveTab] = useState('details');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [machines, setMachines] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [qaLevels, setQaLevels] = useState([]);
  const [costing, setCostingData] = useState(null);
  const [attachmentWarnings, setAttachmentWarnings] = useState(null);
  const contactHook = useContactSearch();
  const formHook = useJobCardForm();
  const activityLog = useActivityLog(jobCardId);
  const reloadTimeEntriesRef = useRef(null);
  const costingHookRef = useRef(null);
  const onExternalStop = useCallback(() => {
    if (reloadTimeEntriesRef.current) reloadTimeEntriesRef.current();
  }, []);
  const timer = useTimer(isEdit ? jobCardId : null, { onExternalStop });
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();
  const jobNotes = useJobNotes(isEdit ? jobCardId : null, showConfirm);

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

      // Costing is loaded lazily when the Costing tab is opened (see effect below),
      // not on every job-card open — the per-tier hours calc walks all logged time,
      // so it only runs when someone is actually looking at the costing.
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

  // Attach a picked file to a specific part: uploads it tagged with the part's
  // permanent id (so it's named for that part on disk and stays matched even if
  // the parts are re-numbered) and refreshes the nudges.
  const handleAttachItemFile = useCallback(async (itemId, category, file) => {
    if (!jobCardId || !file) return;
    try {
      const raw = await fileToBase64(file);
      await api.uploadToJobcardFiles(jobCardId, category, file.name, raw, itemId);
      toast.success('File attached');
      await refreshAttachmentWarnings();
    } catch (err) {
      toast.error(err.message || 'Failed to attach file');
    }
  }, [jobCardId, refreshAttachmentWarnings]);

  useEffect(() => {
    if (isOpen && isEdit && activeTab === 'activity') {
      loadHistory();
    }
  }, [isOpen, isEdit, activeTab, loadHistory]);

  // Load costing only when the Costing tab is actually opened (admin-only), and only
  // once per opening (costing stays non-null until the modal closes). Computing costing
  // walks every logged minute to split it into rate tiers, so we keep it off the common
  // open-a-job path and off timer events unless someone has looked at the costing.
  const loadCosting = useCallback(async () => {
    if (!isEdit || !jobCardId || !isAdmin) return;
    try {
      const costingRes = await api.getCosting(jobCardId);
      if (costingRes) setCostingData(mapCostingResponseToData(costingRes));
    } catch {
      // Non-fatal — costing will load next time the tab is opened.
    }
  }, [isEdit, jobCardId, isAdmin]);

  useEffect(() => {
    if (isOpen && isEdit && isAdmin && activeTab === 'costing' && costing === null) {
      loadCosting();
    }
  }, [isOpen, isEdit, isAdmin, activeTab, costing, loadCosting]);

  const apiCostingOperations = {
    costing: costing,
    updateCosting: async (data) => {
      await api.updateCosting(jobCardId, data);
      const costingRes = await api.getCosting(jobCardId);
      if (costingRes) {
        setCostingData(mapCostingResponseToData(costingRes));
      }
    }
  };

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

  const reloadTimeEntriesAndCosting = useCallback(async () => {
    await reloadTimeEntries();
    // Costing endpoint is admin-only; skip for non-admin to avoid 403 toast. Also skip
    // unless the Costing tab has been opened (costing !== null) — refreshing it walks all
    // logged time, and there's nothing on screen to update until someone views costing.
    if (isAdmin && costing !== null && costingHookRef.current) await costingHookRef.current();
    await refreshJobStatus();
  }, [reloadTimeEntries, isAdmin, costing, refreshJobStatus]);

  const handleSubmitEntryForm = useCallback(async () => {
    await timer.submitEntryForm(reloadTimeEntriesAndCosting);
    if (onTimerChange) onTimerChange();
  }, [timer, reloadTimeEntriesAndCosting, onTimerChange]);

  const handleCancelEntryForm = useCallback(async () => {
    await timer.cancelEntryForm(reloadTimeEntriesAndCosting);
    if (onTimerChange) onTimerChange();
  }, [timer, reloadTimeEntriesAndCosting, onTimerChange]);

  const apiTimeEntryOperations = {
    addTimeEntry: async (data) => {
      await api.addTimeEntry(jobCardId, data);
      await reloadTimeEntriesAndCosting();
    },
    updateTimeEntry: async (id, data) => {
      await api.updateTimeEntry(jobCardId, id, data);
      await reloadTimeEntriesAndCosting();
    },
    deleteTimeEntry: async (id) => {
      await api.deleteTimeEntry(jobCardId, id);
      await reloadTimeEntriesAndCosting();
    }
  };

  const costingHook = useCosting(jobCardId, apiCostingOperations);
  const { refreshCosting } = costingHook;
  costingHookRef.current = refreshCosting;

  const { setAssignees } = formHook;
  const handleStartItemTimer = useCallback(async (itemNumber, workerId, workerName) => {
    await timer.startTimerWithConflictCheck(itemNumber, showConfirm, workerId, workerName);
    await reloadTimeEntries();
    // Server may have auto-assigned the user and nudged the status to In Progress
    // when starting the timer — refresh both from one fetch.
    try {
      const fresh = await api.getJobcard(jobCardId);
      setAssignees((fresh.assignees || []).map(a => ({
        userId: a.userId,
        userName: a.userName || a.username
      })));
      if (fresh.status) setFormData(prev => ({ ...prev, status: fresh.status }));
    } catch {
      // Non-fatal — assignees/status will refresh next time the modal opens
    }
    if (onTimerChange) onTimerChange();
  }, [timer, showConfirm, reloadTimeEntries, onTimerChange, jobCardId, setAssignees, setFormData]);

  const handleStopItemTimer = useCallback(async () => {
    await timer.stopTimer();
    await reloadTimeEntries();
    await refreshJobStatus();
    if (onTimerChange) onTimerChange();
  }, [timer, reloadTimeEntries, refreshJobStatus, onTimerChange]);

  // Admin stops a running timer from a line's Progress list (their own or one they
  // set up for a worker). Opens the same fill-in form so the pieces/scrap/description
  // for that run get recorded, instead of silently dropping a blank block.
  const handleStopEntryWithForm = useCallback(async (entry) => {
    await timer.stopEntryWithForm(entry);
    await reloadTimeEntries();
    await refreshJobStatus();
    if (onTimerChange) onTimerChange();
  }, [timer, reloadTimeEntries, refreshJobStatus, onTimerChange]);

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
    setCostingData(null);
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
      // 'files', or 'costing' for a manager) lands on Details.
      const validTabs = isAdmin
        ? ['details', 'costing', 'activity']
        : canManage ? ['details', 'activity'] : ['details'];
      setActiveTab(validTabs.includes(initialTab) ? initialTab : 'details');
    }
  }, [isOpen, initialTab]);

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

  const selectContact = (cont) => contactHook.selectContact(cont, formHook.setFormData);
  const handleContactFieldChange = (field, value) => contactHook.handleContactFieldChange(field, value, formHook.setFormData);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canManage && isEdit) return;

    // Validation
    const { errors, validItems } = validateJobCardForm({
      canManage,
      formData: formHook.formData,
      contactFormData: contactHook.contactFormData,
      lineItems: formHook.lineItems
    });

    if (errors.length > 0) {
      showFormErrors(errors);
      return;
    }

    setSaving(true);

    try {
      // Customer details are chosen once, at creation — resolve/create the contact
      // for a brand-new job. On an existing job they're frozen and read-only.
      const contactId = await resolveJobContactId({
        initialContactId: formHook.formData.contactId,
        canManage, isEdit, contactHook, showConfirm
      });

      const jobcardData = buildJobcardPayload({
        formData: formHook.formData,
        contactFormData: contactHook.contactFormData,
        assignees: formHook.assignees,
        validItems,
        canManage,
        isEdit,
        contactId
      });
      // Flush any unsaved pricing edits before invoicing so they aren't lost when the job
      // is filed away. If that save fails, abort rather than invoicing with lost edits.
      if (isEdit && formHook.formData.status === 'INVOICED' && costingHook.costingDirty) {
        const saved = await costingHook.handleSaveCosting();
        if (!saved) return; // save already reported why it failed
      }

      // Send the save; on an edit that would invoice with files still missing,
      // the server replies 409 with the gaps instead of saving. We then ask the
      // user to confirm and resend with an explicit "invoice anyway" flag.
      const submit = (confirmMissing) => isEdit
        ? api.updateJobcard(jobCardId, confirmMissing ? { ...jobcardData, confirmMissingAttachments: true } : jobcardData)
        : api.createJobcard(jobcardData);

      let result;
      try {
        result = await submit(false);
      } catch (err) {
        if (isEdit && err.status === 409 && err.data?.attachmentWarnings) {
          const proceed = await confirmInvoiceAnyway(err.data.attachmentWarnings, showConfirm);
          if (!proceed) { setSaving(false); return; }
          result = await submit(true);
        } else {
          throw err;
        }
      }

      onSuccess?.();
      if (result?.qaTemplateWarning) {
        toast(result.qaTemplateWarning, { icon: '⚠️', duration: 8000 });
      }
      setAttachmentWarnings(result?.attachmentWarnings || null);
      if (isEdit) {
        toast.success('Job card updated');
      } else {
        onClose();
      }
    } catch (err) {
      toast.error(err.message || 'Failed to save job card');
    } finally {
      setSaving(false);
    }
  };
  if (!isOpen) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOverdue = formHook.formData.dueDate?.trim() &&
    new Date(formHook.formData.dueDate + 'T00:00:00') < today &&
    !['DONE', 'INVOICED'].includes(formHook.formData.status);

  // Editing an invoiced job's pricing isn't blocked — it just asks first, then saves and
  // recalculates from the job's own captured rules.
  const saveCostingWithConfirm = async () => {
    if (formHook.formData.status === 'INVOICED') {
      const ok = await showConfirm({
        title: 'Change an invoiced job?',
        message: 'This job has been invoiced. Changing its pricing will update the final total. Are you sure you want to continue?',
        confirmLabel: 'Yes, change it',
        cancelLabel: 'Cancel',
        confirmVariant: 'danger'
      });
      if (!ok) return false;
    }
    return costingHook.handleSaveCosting();
  };
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
      saveCosting={costingHook.handleSaveCosting}
    />
  );

  return (
    <>
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        headerSlot={headerStrip}
        size="large"
        headerActions={
          isEdit && jobCardId ? (
            <JobPaperworkHub
              jobcardId={jobCardId}
              jobNumber={formHook.jobNumber}
              onFilesChanged={refreshAttachmentWarnings}
              attachmentWarnings={attachmentWarnings}
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
              {isEdit && canManage && (
                <div className="modal-tabs">
                  <button type="button" className={`tab ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>
                    Details
                    {jobNotes.notes.length > 0 && <span className="tab-badge">{jobNotes.notes.length}</span>}
                  </button>
                  {isAdmin && (
                    <button type="button" className={`tab ${activeTab === 'costing' ? 'active' : ''}`} onClick={() => setActiveTab('costing')}>Costing</button>
                  )}
                  <button type="button" className={`tab ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')}>Activity</button>
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
                  contact={contactHook.contact}
                  contactFormData={contactHook.contactFormData}
                  handleContactFieldChange={handleContactFieldChange}
                  selectContact={selectContact}
                  contacts={contactHook.contacts}
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
                />
              )}

              {activeTab === 'costing' && isEdit && isAdmin && (
                <CostingTab
                  costingForm={costingHook.costingForm}
                  handleCostingChange={costingHook.handleCostingChange}
                  resetTierHours={costingHook.resetTierHours}
                  resetTierMultiplier={costingHook.resetTierMultiplier}
                  useDefaultRate={costingHook.useDefaultRate}
                  calculateCostingTotals={costingHook.calculateCostingTotals}
                  handleSaveCosting={saveCostingWithConfirm}
                  savingCosting={costingHook.savingCosting}
                />
              )}

              {activeTab === 'activity' && isEdit && canManage && (
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
                  {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
                </button>
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
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  );
}
