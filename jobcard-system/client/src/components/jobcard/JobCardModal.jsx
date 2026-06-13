import { useEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import BottomSheet from '../common/BottomSheet';
import ConfirmDialog from '../common/ConfirmDialog';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import './JobCardModal.css';
import { useCosting } from './useCosting';
import { useTimeEntries } from './useTimeEntries';
import { useContactSearch } from './useContactSearch';
import { useJobCardForm } from './useJobCardForm';
import DetailsTab from './tabs/DetailsTab';
import CostingTab from './tabs/CostingTab';
import FilesTab from './tabs/FilesTab';
import ActivityLogTab from './tabs/ActivityLogTab';
import { useActivityLog } from './useActivityLog';
import { useTimer } from './useTimer';
import { useJobNotes } from './useJobNotes';
import StopTimerForm from './StopTimerForm';
import ZoomToggle, { useJobCardZoom } from './ZoomToggle';
import JobFilesMenu from './JobFilesMenu';
import JobIdentityStrip from './JobIdentityStrip';
import { validateJobCardForm } from './jobCardValidation';
import { mapTimeEntryFromApi } from './mappers';
import { describeAttachmentGaps } from '../../utils/attachmentWarnings';

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
  const isAdmin = user?.role === 'admin';
  const [activeTab, setActiveTab] = useState('details');
  const [zoom, setZoom] = useJobCardZoom();
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
  const jobNotes = useJobNotes(isEdit ? jobCardId : null);
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();

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
  const { setFormDataFromJobCard, resetForm: resetFormHook } = formHook;
  const { setContactFromJobCard, resetContact } = contactHook;
  const { loadHistory, resetHistory } = activityLog;
  const { loadNotes } = jobNotes;
  const loadJobCard = useCallback(async () => {
    if (!isEdit || !jobCardId) return;

    setLoading(true);
    try {
      const [jobcardRes, timeEntriesRes, costingRes] = await Promise.all([
        api.getJobcard(jobCardId),
        api.getTimeEntries(jobCardId),
        isAdmin ? api.getCosting(jobCardId).catch(() => null) : Promise.resolve(null)
      ]);

      const jobcardData = jobcardRes;
      setFormDataFromJobCard(jobcardData);
      setContactFromJobCard(jobcardData);
      setAttachmentWarnings(jobcardData.attachmentWarnings || null);
      setTimeEntries((timeEntriesRes || []).map(mapTimeEntryFromApi));

      loadNotes();

      if (costingRes) {
        setCostingData({
          labourHours: costingRes.labourHours || 0,
          labourRate: costingRes.labourRate || 0,
          labourSpecialHours: costingRes.labourSpecialHours || 0,
          labourSpecialRate: costingRes.labourSpecialRate || 0,
          materialsCost: costingRes.materialsCost || 0,
          materialsProfitPercent: costingRes.materialsProfitPercent ?? 100,
          subcontractorCost: costingRes.subcontractorCost || 0,
          subcontractorProfitPercent: costingRes.subcontractorProfitPercent ?? 0
        });
      }
    } catch (err) {
      toast.error('Failed to load job card. Please try again.');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [isEdit, jobCardId, isAdmin, setFormDataFromJobCard, setContactFromJobCard, loadNotes, onClose]);

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
  const apiCostingOperations = {
    costing: costing,
    updateCosting: async (data) => {
      await api.updateCosting(jobCardId, data);
      const costingRes = await api.getCosting(jobCardId);
      if (costingRes) {
        setCostingData({
          labourHours: costingRes.labourHours || 0,
          labourRate: costingRes.labourRate || 0,
          labourSpecialHours: costingRes.labourSpecialHours || 0,
          labourSpecialRate: costingRes.labourSpecialRate || 0,
          materialsCost: costingRes.materialsCost || 0,
          materialsProfitPercent: costingRes.materialsProfitPercent ?? 100,
          subcontractorCost: costingRes.subcontractorCost || 0,
          subcontractorProfitPercent: costingRes.subcontractorProfitPercent ?? 0
        });
      }
    }
  };

  const reloadTimeEntries = useCallback(async () => {
    const res = await api.getTimeEntries(jobCardId);
    setTimeEntries((res || []).map(mapTimeEntryFromApi));
  }, [jobCardId]);
  reloadTimeEntriesRef.current = reloadTimeEntries;

  const reloadTimeEntriesAndCosting = useCallback(async () => {
    await reloadTimeEntries();
    // Costing endpoint is admin-only; skip for non-admin to avoid 403 toast
    if (isAdmin && costingHookRef.current) await costingHookRef.current();
  }, [reloadTimeEntries, isAdmin]);

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
    },
    stopActiveEntry: async (entryId) => {
      await api.stopTimer(jobCardId, entryId);
      if (timer.activeTimer?.id === entryId) {
        timer.resetTimer();
      }
      await reloadTimeEntriesAndCosting();
    }
  };

  const costingHook = useCosting(jobCardId, apiCostingOperations);
  const { refreshCosting } = costingHook;
  costingHookRef.current = refreshCosting;

  const handleToggleSpecial = useCallback(async (entryId) => {
    try {
      await api.toggleSpecialLabour(jobCardId, entryId);
      await reloadTimeEntries();
      await refreshCosting();
    } catch (err) {
      toast.error(err.message || 'Failed to toggle special labour');
    }
  }, [jobCardId, reloadTimeEntries, refreshCosting]);

  const { setAssignees } = formHook;
  const handleStartItemTimer = useCallback(async (itemNumber) => {
    await timer.startTimerWithConflictCheck(itemNumber, showConfirm);
    await reloadTimeEntries();
    // Server may have auto-assigned the user when starting the timer — refresh assignees
    try {
      const fresh = await api.getJobcard(jobCardId);
      setAssignees((fresh.assignees || []).map(a => ({
        userId: a.userId,
        userName: a.userName || a.username
      })));
    } catch {
      // Non-fatal — assignees will refresh next time the modal opens
    }
    if (onTimerChange) onTimerChange();
  }, [timer, showConfirm, reloadTimeEntries, onTimerChange, jobCardId, setAssignees]);

  const handleStopItemTimer = useCallback(async () => {
    await timer.stopTimer();
    await reloadTimeEntries();
    if (onTimerChange) onTimerChange();
  }, [timer, reloadTimeEntries, onTimerChange]);

  const timeEntry = useTimeEntries(jobCardId, { ...apiTimeEntryOperations, showConfirm });
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
      setActiveTab(initialTab || 'details');
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
    if (!isAdmin && isEdit) return;

    // Validation
    const { errors, validItems } = validateJobCardForm({
      isAdmin,
      formData: formHook.formData,
      contactFormData: contactHook.contactFormData,
      lineItems: formHook.lineItems
    });

    if (errors.length > 0) {
      toast.dismiss();
      if (errors.length === 1) {
        toast.error(errors[0]);
      } else {
        toast.error(
          <div>
            <strong>Please fix the following:</strong>
            <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
              {errors.map((msg, i) => <li key={i}>{msg}</li>)}
            </ul>
          </div>
        );
      }
      return;
    }

    setSaving(true);

    try {
      let contactId = formHook.formData.contactId;

      // Customer details are chosen once, at creation. On an existing job they are
      // frozen and read-only, so we neither create contacts nor send contact fields
      // when editing — the server ignores them anyway.
      if (isAdmin && !isEdit) {
        // Smart detection: Check if user edited a selected contact and changed the company
        if (contactHook.hasCompanyNameChanged()) {
          const saveNew = await showConfirm({
            title: 'Save New Contact',
            message: `Save "${contactHook.contactFormData.companyName}" as a new contact?`,
            confirmLabel: 'Save',
            cancelLabel: 'No',
            confirmVariant: 'primary'
          });
          if (saveNew) {
            // Create new contact
            const newContact = await api.createContact({
              contactName: contactHook.contactFormData.contactName.trim() || null,
              companyName: contactHook.contactFormData.companyName.trim(),
              phone: contactHook.contactFormData.phone || null,
              email: contactHook.contactFormData.email || null
            });
            contactId = newContact.id;
            toast.success('New contact saved');
          }
          // If not saving as new, keep the original contactId but use override fields
        }

        // Create new contact if no contact selected and company name provided
        if (!contactId && contactHook.contactFormData.companyName.trim()) {
          const newContact = await api.createContact({
            contactName: contactHook.contactFormData.contactName.trim() || null,
            companyName: contactHook.contactFormData.companyName.trim(),
            phone: contactHook.contactFormData.phone || null,
            email: contactHook.contactFormData.email || null
          });
          contactId = newContact.id;
        }
      }

      const jobcardData = {
        status: formHook.formData.status,
        ...(isAdmin && !isEdit && {
          contactId: contactId,
          contactName: contactHook.contactFormData.contactName,
          companyName: contactHook.contactFormData.companyName,
          contactPhone: contactHook.contactFormData.phone,
          contactEmail: contactHook.contactFormData.email,
        }),
        qualityLevel: formHook.formData.qualityLevel,
        qaLevelId: formHook.formData.qaLevelId || null,
        priority: formHook.formData.priority,
        poNumber: formHook.formData.poNumber,
        quoteReference: formHook.formData.quoteReference,
        description: formHook.formData.description,
        dueDate: formHook.formData.dueDate,
        isRepeatJob: formHook.formData.isRepeatJob,
        repeatJobReference: formHook.formData.repeatJobReference,
        assigneeIds: formHook.assignees.map(a => a.userId),
        items: validItems.map((item, idx) => ({
          // Send the line's saved id (only real, already-saved lines have an
          // "item:" id) so the server keeps each line's identity across the edit
          // and a worker's recorded time/scrap stays with the right line. New lines
          // have a temporary local id and are left without one so the server makes one.
          ...(typeof item.id === 'string' && item.id.startsWith('item:') ? { id: item.id } : {}),
          itemNumber: item.itemNumber || idx + 1,
          qty: item.qty,
          description: item.description,
          jobType: item.jobType || null,
          material: item.material || null,
          treatments: (item.treatments || []).map(t => ({
            value: t.value,
            otherText: t.otherText || '',
            supplierId: t.supplierId,
            supplierName: t.supplierName || ''
          })),
          drawingsType: item.drawingsType || null,
          customerProperty: item.customerProperty || null
        }))
      };
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
          const gaps = describeAttachmentGaps(err.data.attachmentWarnings);
          const proceed = await showConfirm({
            title: 'Files not attached',
            message: (
              <span>
                This job was marked as having the following, but no file is attached yet:
                <br />
                {gaps.map((g, i) => <span key={i}>• {g}<br /></span>)}
                <br />
                Invoice anyway?
              </span>
            ),
            confirmLabel: 'Invoice anyway',
            cancelLabel: 'Go back',
            confirmVariant: 'warning'
          });
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
  const headerStrip = (
    <JobIdentityStrip
      isEdit={isEdit}
      isAdmin={isAdmin}
      jobCardId={jobCardId}
      jobNumber={formHook.jobNumber}
      formData={formHook.formData}
      setFormData={formHook.setFormData}
      isOverdue={isOverdue}
      showConfirm={showConfirm}
      onSuccess={onSuccess}
    />
  );

  return (
    <>
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        headerSlot={headerStrip}
        size="large"
        closeOnOverlayClick={false}
        headerActions={
          <>
            {isEdit && jobCardId && <JobFilesMenu jobcardId={jobCardId} jobNumber={formHook.jobNumber} onFilesChanged={refreshAttachmentWarnings} />}
            <ZoomToggle zoom={zoom} onChange={setZoom} />
          </>
        }
      >
        {loading ? (
          <div className="loading" style={{ padding: '2rem' }}>Loading...</div>
        ) : (
          <form onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT' && e.target.type !== 'submit') e.preventDefault(); }} style={{ display: 'contents' }}>
            <BottomSheet.Body>
              <div className="jc-zoom-root" data-zoom={zoom}>
              {isEdit && isAdmin && (
                <div className="modal-tabs">
                  <button type="button" className={`tab ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>
                    Details
                    {jobNotes.notes.length > 0 && <span className="tab-badge">{jobNotes.notes.length}</span>}
                  </button>
                  <button type="button" className={`tab ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')}>Files</button>
                  <button type="button" className={`tab ${activeTab === 'costing' ? 'active' : ''}`} onClick={() => setActiveTab('costing')}>Costing</button>
                  <button type="button" className={`tab ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')}>Activity</button>
                </div>
              )}

              {(activeTab === 'details' || !isEdit) && (
                <DetailsTab
                  isEdit={isEdit}
                  isAdmin={isAdmin}
                  jobCardId={jobCardId}
                  jobNumber={formHook.jobNumber}
                  activeTimer={timer.activeTimer}
                  timerElapsed={timer.elapsed}
                  timerLoading={timer.loading}
                  onStartTimer={handleStartItemTimer}
                  onStopTimer={handleStopItemTimer}
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
                  handleStopActiveEntry={timeEntry.handleStopActiveEntry}
                  resetTimeEntryForm={timeEntry.resetTimeEntryForm}
                  onToggleSpecial={handleToggleSpecial}
                />
              )}

              {activeTab === 'costing' && isEdit && isAdmin && (
                <CostingTab
                  costingForm={costingHook.costingForm}
                  handleCostingChange={costingHook.handleCostingChange}
                  calculateCostingTotals={costingHook.calculateCostingTotals}
                  handleSaveCosting={costingHook.handleSaveCosting}
                  savingCosting={costingHook.savingCosting}
                />
              )}

              {activeTab === 'files' && isEdit && isAdmin && (
                <FilesTab jobCardId={jobCardId} attachmentWarnings={attachmentWarnings} />
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

            {(isAdmin || !isEdit) && (
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
