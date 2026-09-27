import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import BottomSheet from '../common/BottomSheet';
import Spinner from '../common/Spinner';
import ConfirmDialog from '../common/ConfirmDialog';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { isManagement, can } from '../../utils/roles';
import { todayIsoDate } from '../../utils/formatters';
import { isJobOverdue } from '../JobCardList.constants';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { useFieldErrors, scrollFieldIntoView } from '../../hooks/useFieldErrors';
import { isJobClosed, JOB_CLOSED_MESSAGE } from '../../utils/jobLock';
import './JobCardModal.css';
import { useJobCardCosting } from './useJobCardCosting';
import { useTimeEntries } from './useTimeEntries';
import { useContactSearch } from './useContactSearch';
import { useJobCardForm } from './useJobCardForm';
import { useJobCardInstantSaves } from './useJobCardInstantSaves';
import { useJobCardSave } from './useJobCardSave';
import { useJobCardCloseGuard, useJobCardListRefresh } from './useJobCardCloseGuard';
import { useJobCardTimerActions } from './useJobCardTimerActions';
import { useJobCardReferenceData } from './useJobCardReferenceData';
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
  // Two permissions, both admin-only today: pricing gates the Costing tab and its
  // countdown, activityTrail gates the Activity tab. Everything else managerial on
  // this screen (editing, tabs, time-entry corrections) is admin-or-manager.
  const canSeePricing = can(user, 'pricing');
  const canSeeActivity = can(user, 'activityTrail');
  const canManage = isManagement(user);
  const [activeTab, setActiveTab] = useState('details');
  const [loading, setLoading] = useState(false);
  const [timeEntries, setTimeEntries] = useState([]);
  const [attachmentWarnings, setAttachmentWarnings] = useState(null);
  // An instant write never touches the list behind this modal — useJobCardCloseGuard.js.
  const { flagInstantSave, closeAndRefresh } = useJobCardListRefresh({ isOpen, isEdit, onSuccess, onClose });
  const contactHook = useContactSearch();
  // The job was invoiced and archived from another PC while this screen still had it
  // open: a write already on its way reaches the server after that and is refused
  // (closedJobGuard, server/src/middleware/closedJob.js) with a 409 carrying
  // code: 'JOB_CLOSED'. Every write path that can hit this — the save queue (fields,
  // parts, workers), comments, the status control, manual time entries, the timer's
  // start and stop-form saves, file uploads/re-tags/deletes and the pricing sheet —
  // calls this the moment it sees that code: one shared sentence, and a reload so the
  // screen catches up to the closed job and renders read-only (see the jobClosed
  // guards below) instead of going on offering edits that would only fail the same
  // way. Held in a ref because loadJobCard (defined further down, after formHook)
  // isn't in scope yet where this is handed to useJobCardForm/useJobNotes below —
  // the ref is filled in once it is, and nothing calls this before the job has
  // loaded once, so it's always populated by the time it matters.
  const reloadOnJobClosedRef = useRef(null);
  const handleJobClosedWrite = useCallback(() => {
    toast.error(JOB_CLOSED_MESSAGE, { id: 'job-closed' });
    reloadOnJobClosedRef.current?.();
  }, []);
  // formHook also owns the one save queue for this open job card (Contract A) —
  // formHook.saveQueue — that every instant write (a field, a part, a worker)
  // routes through, so what's queued, in flight or failed is one recorded fact
  // instead of three separate hand-rolled promise-chain registries.
  const formHook = useJobCardForm(jobCardId, { onInstantSave: flagInstantSave, onJobClosed: handleJobClosedWrite });
  // The details fields and the parts list save themselves through these (see
  // useJobCardInstantSaves.js). A part write's reply also refreshes the file
  // notes here (Contract B) — setAttachmentWarnings is the one landing point,
  // whether the write came from a part being added, edited or removed, or a
  // field such as the quality level.
  const { instantSave, instantItems, resetInstantSaves } = useJobCardInstantSaves(formHook, isEdit, jobCardId, formHook.saveQueue, {
    onAttachmentWarnings: setAttachmentWarnings,
    onJobClosed: handleJobClosedWrite
  });
  const activityLog = useActivityLog(jobCardId);
  const reloadTimeEntriesRef = useRef(null);
  const resetInstantSavesRef = useRef(null);
  const hubRef = useRef(null);
  const onExternalStop = useCallback(() => {
    if (reloadTimeEntriesRef.current) reloadTimeEntriesRef.current();
  }, []);
  // lineItems is handed in so the timer's own toasts and switch-timer prompts can
  // name a part by its position in this job's list, never by its stored number.
  const timer = useTimer(isEdit ? jobCardId : null, { onExternalStop, lineItems: formHook.lineItems, onJobClosed: handleJobClosedWrite });
  const { dialogState, showConfirm, handleCancel, handleConfirm, handleAlt, cancelConfirms } = useConfirmDialog();

  // Questions belong to the open card. Once it closes nothing renders the box any more,
  // so anything still waiting for an answer is answered "no" here — left outstanding it
  // would never settle, and the next question asked would queue behind a box that can
  // no longer be seen.
  useEffect(() => {
    if (!isOpen) cancelConfirms();
  }, [isOpen, cancelConfirms]);

  const jobNotes = useJobNotes(isEdit ? jobCardId : null, showConfirm, onNotesChange, handleJobClosedWrite);
  // Pricing: the on-open load and the save-on-the-way-out paths all live in this hook —
  // see useJobCardCosting.js.
  const costingHook = useJobCardCosting({ isOpen, isEdit, canSeePricing, jobCardId, activeTab, onJobClosed: handleJobClosedWrite });

  // The lists every picker on this screen draws from — suppliers, workers, machines,
  // quality levels — loaded once (with its own retry-on-reopen and failure toast),
  // because this component stays mounted behind the list rather than unmounting on
  // close. Pulled into its own hook (useJobCardReferenceData.js) purely to keep this
  // file from growing further, the same reason useJobCardTimerActions.js and
  // useJobCardCloseGuard.js exist.
  const { suppliers, employees, machines, qaLevels, reloadSuppliers } = useJobCardReferenceData({ isOpen });

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
  reloadOnJobClosedRef.current = loadJobCard;

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
  // A save/timer action that's still in flight when the user closes this job and
  // opens another must not let its late reply patch the now-different job's
  // screen — this stays current every render (unlike a plain closed-over
  // jobCardId, fixed at the moment the action started), so useJobCardTimerActions
  // can tell a reply that's still for the open job apart from a stale one.
  const currentJobIdRef = useRef(jobCardId);
  currentJobIdRef.current = jobCardId;
  // A closed (invoiced) job's time is locked server-side; kept here (rather than
  // reading formHook.formData inline below) so both the timer actions and the
  // manual add/edit form agree on exactly the same test — jobLock.js's
  // isJobClosed, the one shared "can this job still be changed?" test.
  const isInvoiced = isJobClosed(formHook.formData);
  // Everything else on the job screen that locks once the job is closed reads
  // this instead of re-deriving it — see DetailsTab.jsx, CostingTab (below) and
  // the top-of-screen banner.
  const jobClosed = isInvoiced;
  // Starting/stopping a timer, the stop-timer form and the manual add/edit form —
  // pulled into its own hook (useJobCardTimerActions.js) purely to keep this file
  // from growing further; every dependency here is something this component
  // already holds.
  const {
    apiTimeEntryOperations,
    handleStartItemTimer,
    handleStopItemTimer,
    handleStopEntryWithForm,
    handleSubmitEntryForm,
    handleCancelEntryForm
  } = useJobCardTimerActions({
    jobCardId, canSeePricing, isInvoiced, costingLoaded, refreshCosting, refreshJobStatus,
    reloadTimeEntries, timer, showConfirm, creditAssignee, dropAssignee,
    employees, currentUserId: user?.id, setFormData, onTimerChange, onWorkSaved: flagInstantSave,
    currentJobIdRef
  });

  const timeEntry = useTimeEntries(jobCardId, {
    ...apiTimeEntryOperations,
    showConfirm,
    isInvoiced,
    onJobClosed: handleJobClosedWrite
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
      // 'costing' or 'activity' for someone who can't see it) lands on Details.
      const validTabs = ['details']
        .concat(canSeePricing ? ['costing'] : [])
        .concat(canSeeActivity ? ['activity'] : []);
      setActiveTab(validTabs.includes(initialTab) ? initialTab : 'details');
    }
  }, [isOpen, initialTab, canSeePricing, canSeeActivity]);

  // Pricing/activity access can also be lost while the modal is already open. The
  // tab strip and the Costing/Activity panels vanish on that render, so without
  // this the body would draw nothing at all. Kept separate from the effect above
  // so it never re-applies initialTab mid-session.
  useEffect(() => {
    if (activeTab === 'costing' && !canSeePricing) setActiveTab('details');
    if (activeTab === 'activity' && !canSeeActivity) setActiveTab('details');
  }, [canSeePricing, canSeeActivity, activeTab]);

  const resetFormRef = useRef(resetForm);
  const loadJobCardRef = useRef(loadJobCard);
  const loadActiveTimerRef = useRef(timer.loadActiveTimer);
  resetFormRef.current = resetForm;
  loadJobCardRef.current = loadJobCard;
  loadActiveTimerRef.current = timer.loadActiveTimer;
  resetInstantSavesRef.current = resetInstantSaves;

  // Before the browser paints, not after: this modal returns null while closed rather
  // than unmounting, so the commit that reopens it still holds the PREVIOUS opening's
  // form, baseline and save queue. As a plain effect the reset landed one paint too
  // late and that stale state was shown — the job that was just closed with an edit
  // discarded came back wearing its amber frame, and a write that landed after the
  // window went brought its green with it. Resetting here means the reopened window is
  // measured, framed and (once loadJobCard flips `loading`) drawn as the new opening
  // from its very first frame.
  useLayoutEffect(() => {
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
  const adoptExactCompany = (name) => contactHook.adoptExactCompany(name, formHook.setFormData);

  // Marks a contact box instead of a pop-up when Create (or the "Update contact" /
  // "Add as new person" prompt it can run first) comes back with a 400 naming
  // contactName/contactPhone/contactEmail — see useJobCardSave.js's
  // fieldErrorsFromRefusal (hooks/useFieldErrors.js). Declared before useJobCardSave so its callback can
  // close over it.
  const contactFieldErrors = useFieldErrors((name) => {
    if (name === 'contactName') return contactHook.contactFormData.contactName;
    if (name === 'contactPhone') return contactHook.contactFormData.phone;
    if (name === 'contactEmail') return contactHook.contactFormData.email;
    return undefined;
  });
  const { clearAll: clearContactFieldErrors } = contactFieldErrors;
  // This screen stays mounted while closed, so a mark left from the last new job
  // would otherwise greet the next one.
  useEffect(() => { clearContactFieldErrors(); }, [isOpen, jobCardId, clearContactFieldErrors]);
  const handleContactFieldErrors = useCallback((errors) => {
    contactFieldErrors.setFieldErrors(errors);
    const order = ['contactName', 'contactPhone', 'contactEmail'];
    const first = order.find(k => errors[k]);
    const boxId = { contactName: 'jc-contact', contactPhone: 'jc-phone', contactEmail: 'jc-email' }[first];
    if (boxId) scrollFieldIntoView(boxId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactFieldErrors.setFieldErrors]);

  // Create-only now (useJobCardSave.js) — an existing job has nothing left for a
  // Save to do; every field, row and worker writes itself the moment it changes.
  const { saving, handleSubmit } = useJobCardSave({
    canManage, isEdit, formHook, contactHook,
    showConfirm, onSuccess, onClose, setAttachmentWarnings,
    onContactFieldErrors: handleContactFieldErrors
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
  // and the inactivity countdown (useUnsavedGuard.js).
  // Every real close funnels through the onClose handed to it below.
  const showDetailsTab = useCallback(() => setActiveTab('details'), []);
  // The close-time twin of showDetailsTab, for a red pricing box that can be off screen
  // on any other tab when the job is asked to close: switch to Costing, then (once it's
  // rendered) bring the named field into view.
  const revealCosting = useCallback((fieldName) => {
    setActiveTab('costing');
    if (fieldName) requestAnimationFrame(() => scrollFieldIntoView(fieldName));
  }, []);
  // Every way of leaving the Costing tab by the person's own action funnels through
  // here, so a box still sitting red is caught once rather than at each tab button.
  const handleTabChange = useCallback(async (tab) => {
    if (activeTab === 'costing' && tab !== 'costing' && canSeePricing) {
      const { proceed } = await costingHook.guardLeaveCosting(showConfirm);
      if (!proceed) return;
    }
    setActiveTab(tab);
  }, [activeTab, canSeePricing, costingHook, showConfirm]);
  const { handleRequestClose } = useJobCardCloseGuard({
    isOpen, isEdit, jobCardId, canSeePricing, isDirty,
    formHook, instantItems, saveQueue: formHook.saveQueue, jobNotes, timer, costingHook,
    saving, showConfirm, onClose: closeAndRefresh, revealDetails: showDetailsTab, revealCosting
  });

  // The pricing sheet is admin-only and saves itself when a box is left, so a figure
  // can still be on its way (or stopped after a failed attempt) while the rest of the
  // job is settled. Named once here because two different things need it: the header's
  // running total, and the "everything landed" signals below, which must not say
  // everything while money is still outstanding.
  const costingOutstanding = canSeePricing && costingHook.costingDirty;

  // Everything still on its way to the job: the job's own fields, parts and people
  // (isDirty) plus the pricing countdown. This is the single question both halves of
  // the frame are asked — see useSavedFlash.js for why an unposted comment is in
  // neither half.
  const waitingOnSave = isEdit && (isDirty || costingOutstanding);

  // Everything that has actually reached the job. It has to cover exactly what
  // waitingOnSave covers, or the two halves of the frame disagree: pricing writes go out
  // on their own path rather than through the job's save queue, so a visit that only
  // touched money would turn the frame amber and then never answer it. Both counts are
  // cleared together when a job opens (the reset above), so a previous opening's tally
  // can never be mistaken for this one's.
  const landedOnJob = formHook.saveQueue.landedCount + costingHook.costingLandedCount;

  // The window frame is the whole answer to "did that save?" on an existing job —
  // amber while something on screen hasn't reached the job, green for a moment once
  // the last of it has landed. It replaces the small "Saving… / Saved" the header used
  // to carry, which there is no longer room for beside the job number, priority,
  // description, status and due date. Green is driven by writes the server actually
  // confirmed rather than by unsaved work disappearing, so abandoning an edit no longer
  // reads as saving it. Must sit above the early return below — it is a hook.
  const { flashing: savedFlash, anythingLanded } = useSavedFlash({
    landedCount: landedOnJob,
    waiting: waitingOnSave,
    active: isOpen && isEdit
  });

  if (!isOpen) return null;
  // Enter in a box someone types into must not submit the form by accident. Only those
  // boxes: a button (a tab, a reset link, a part's buttons) keeps Enter's normal job of
  // pressing it. The comboboxes and the pricing sheet handle their own Enter first.
  const blockEnterSubmit = (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    if (['button', 'submit', 'reset'].includes(e.target.type)) return;
    e.preventDefault();
  };
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
      costingDirty={costingOutstanding}
      costingInvalid={canSeePricing && costingHook.costingInvalid}
      invalidCostingField={costingHook.firstInvalidCostingField}
      revealCosting={revealCosting}
      canSeeTotal={canSeePricing && isEdit}
      fetchCurrentTotal={costingHook.fetchCurrentTotal}
      saveCosting={costingHook.handleSaveCosting}
      descriptionError={formHook.descriptionError}
      markDescription={formHook.markDescription}
      whenPartSavesSettled={formHook.saveQueue.whenSettled}
      onJobClosed={handleJobClosedWrite}
    />
  );

  return (
    <>
      <BottomSheet
        isOpen={isOpen}
        onClose={handleRequestClose}
        // No Save button any more, so this now means "something hasn't reached the
        // job" — a failed write, an empty required box, a row mid-create/delete, or a
        // figure still sitting out the pricing screen's countdown. Amber and green are
        // asked the same question about the same work, so a price behaves exactly like
        // every other box: amber while it travels, green when it lands. Leaving pricing
        // out of this one made the frame answer a save it had never announced.
        // See useJobCardForm.js's isDirty comment and closeReasons.js.
        unsaved={waitingOnSave}
        // ...and green for a moment once the last of it has landed — driven by what the
        // server confirmed, so a card nobody has touched, an abandoned edit and a box put
        // back the way it was all stay quiet rather than claiming a save (useSavedFlash.js).
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
              locked={jobClosed}
              onJobClosed={handleJobClosedWrite}
            />
          ) : null
        }
      >
        {loading ? (
          /* The shared .loading class is a full-page one (it reserves a whole
             viewport), so inside the window it opened a screen-tall empty gap with
             a word adrift in it. This fills the window's own body instead, with the
             one spinner the rest of the app uses. */
          <div className="jc-modal-loading" role="status">
            <Spinner size={28} />
            <span>Opening this job card…</span>
          </div>
        ) : (
          /* noValidate: every check here is the app's own (a mark on the field),
             and a sub-form nested inside (the part's New supplier form) must not
             be able to veto Create with a browser bubble. */
          <form onSubmit={handleSubmit} onKeyDown={blockEnterSubmit} noValidate style={{ display: 'contents' }}>
            <BottomSheet.Body>
              <div className="jc-zoom-root">
              {jobClosed && (
                <div className="jc-closed-banner" role="status">
                  This job is invoiced and closed. Unarchive it to make changes.
                </div>
              )}
              {isEdit && (canSeePricing || canSeeActivity) && (
                <div className="modal-tabs">
                  <button type="button" className={`tab ${activeTab === 'details' ? 'active' : ''}`} onClick={() => handleTabChange('details')}>
                    Details
                    {jobNotes.notes.length > 0 && <span className="tab-badge">{jobNotes.notes.length}</span>}
                  </button>
                  {/* Each tab button below only renders when its own permission
                      allows it, so the bar itself doesn't re-ask a question the
                      tab content below already answers. */}
                  {canSeePricing && (
                    <button type="button" className={`tab ${activeTab === 'costing' ? 'active' : ''}`} onClick={() => handleTabChange('costing')}>Costing</button>
                  )}
                  {canSeeActivity && (
                    <button type="button" className={`tab ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => handleTabChange('activity')}>Activity</button>
                  )}
                </div>
              )}

              {(activeTab === 'details' || !isEdit) && (
                <DetailsTab
                  isEdit={isEdit}
                  canManage={canManage}
                  jobClosed={jobClosed}
                  jobCardId={jobCardId}
                  jobNumber={formHook.jobNumber}
                  activeTimer={timer.activeTimer}
                  timerElapsed={timer.elapsed}
                  timerLoading={timer.loading}
                  // A closed job can never have a timer running against it — invoicing
                  // is refused while one is — so there is never a live run left to
                  // stop; hiding both buttons rather than leaving Start live to fail
                  // with a toast is what jobLock.js's "read-only or hidden" means here.
                  onStartTimer={jobClosed ? undefined : handleStartItemTimer}
                  onStopTimer={jobClosed ? undefined : handleStopItemTimer}
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
                  noteCompanyTyping={contactHook.noteCompanyTyping}
                  selectCompany={selectCompany}
                  adoptExactCompany={adoptExactCompany}
                  typedCompanyMatch={contactHook.typedCompanyMatch}
                  showContactDropdown={contactHook.showContactDropdown}
                  contactSearchRef={contactHook.contactSearchRef}
                  fieldFocused={contactHook.fieldFocused}
                  handleFieldFocus={contactHook.handleFieldFocus}
                  handleFieldBlur={contactHook.handleFieldBlur}
                  contactGroupClass={contactFieldErrors.groupClass}
                  contactErrorFor={contactFieldErrors.errorFor}
                  contactErrorProps={contactFieldErrors.errorProps}
                  employees={employees || []}
                  assignees={formHook.assignees}
                  toggleAssignee={formHook.toggleAssignee}
                  lineItems={formHook.lineItems}
                  addLineItem={formHook.addLineItem}
                  updateLineItem={formHook.updateLineItem}
                  removeLineItem={instantItems.removeItem}
                  onItemFieldChange={instantItems.handleItemFieldChange}
                  onItemFieldBlur={instantItems.commitItemFieldBlur}
                  itemErrorFor={instantItems.itemErrorFor}
                  suppliers={suppliers || []}
                  onSuppliersChanged={reloadSuppliers}
                  attachmentWarnings={attachmentWarnings}
                  onAttachItemFile={isEdit && !jobClosed ? handleAttachItemFile : undefined}
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

              {activeTab === 'costing' && isEdit && canSeePricing && (
                // A closed job's pricing is read-only too (C1.3) — CostingTab locks its
                // editable sheet itself, leaving its view-only buttons usable.
                <CostingTab
                  locked={jobClosed}
                  costingForm={costingHook.costingForm}
                  openedAt={costingHook.openedAt}
                  handleCostingChange={costingHook.handleCostingChange}
                  resetTierHours={costingHook.resetTierHours}
                  resetTierMultiplier={costingHook.resetTierMultiplier}
                  useDefaultRate={costingHook.useDefaultRate}
                  calculateCostingTotals={costingHook.calculateCostingTotals}
                  saveState={costingHook.costingSaveState}
                  onFlushCosting={costingHook.flushCosting}
                  onBoxBlur={costingHook.saveOnBoxBlur}
                  onRevertField={costingHook.revertField}
                  loaded={costingHook.costingLoaded}
                  loadFailed={costingHook.costingLoadFailed}
                  onRetryLoad={costingHook.retryLoadCosting}
                  costingFieldError={costingHook.costingFieldError}
                  costingFieldProps={costingHook.costingFieldProps}
                  costingErrorProps={costingHook.costingErrorProps}
                  lineItems={formHook.lineItems}
                  timeEntries={timeEntries}
                  machines={machines || []}
                />
              )}

              {activeTab === 'activity' && isEdit && canSeeActivity && (
                <ActivityLogTab
                  history={activityLog.history}
                  loading={activityLog.loadingHistory}
                  failed={activityLog.historyFailed}
                  onRefresh={loadHistory}
                />
              )}
              </div>
            </BottomSheet.Body>

            {/* A new job keeps the Create button. An existing job writes itself, so
                there's no footer at all (an empty one would still draw its border) —
                just a bare sr-only status line, same approach as the pricing sheet's.
                That line is the spoken twin of the window frame and is held to the same
                standard: it only says everything is saved once something has actually
                been confirmed and nothing — pricing included — is still on its way. A
                card nobody has changed yet says nothing at all. */}
            {!isEdit ? (
              <BottomSheet.Footer>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Create'}
                </button>
              </BottomSheet.Footer>
            ) : canManage && (
              <span className="sr-only" role="status" aria-live="polite">
                {waitingOnSave
                  ? 'This job card has unsaved changes.'
                  : (anythingLanded ? 'All changes saved.' : '')}
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
