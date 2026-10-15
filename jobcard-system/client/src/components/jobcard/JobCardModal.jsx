import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { toastJobWriteFailure } from './jobWriteFailure';
import BottomSheet from '../common/BottomSheet';
import Spinner from '../common/Spinner';
import ConfirmDialog from '../common/ConfirmDialog';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { isManagement, can } from '../../utils/roles';
import { todayIsoDate } from '../../utils/formatters';
import { isJobOverdue } from '../JobCardList.constants';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { useStillMounted } from '../../hooks/useStillMounted';
import { useFieldErrors, scrollFieldIntoView } from '../../hooks/useFieldErrors';
import { fieldErrorKey } from './fieldRules.mjs';
import { isJobClosed, JOB_DELETED_MESSAGE, JOB_DELETED_TOAST_ID } from '../../utils/jobLock';
import { JOB_CLOSED_MESSAGE } from '../../../../server/src/shared/closedJob';
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
import { useActivityLog } from './useActivityLog';
import { useTimer } from './useTimer';
import { useFinishQuestion } from '../../context/FinishQuestionContext';
import { useMentions } from '../../context/MentionsContext';
import { useJobNotes } from './useJobNotes';
import JobCommentsPanel from './JobCommentsPanel';
import JobHistoryPanel from './JobHistoryPanel';
import StopTimerForm from './StopTimerForm';
import JobPaperworkHub from './JobPaperworkHub';
import JobIdentityStrip from './JobIdentityStrip';
import { mapTimeEntryFromApi } from './mappers';

// The later of two moments (UTC ISO text compares in time order); either may be missing.
// One shared empty list, so a missing staff list doesn't hand the panels a new array every render.
const NO_EMPLOYEES = [];
const newerMoment = (a, b) => (!a ? b : !b ? a : (a > b ? a : b));

// The job window. Closed it is nothing at all, and every opening — even of the same job —
// mounts a fresh JobCardWindow, so no state, pending reply or "decide once" flag of one
// opening can reach the next. The key makes a different job a fresh window too.
export default function JobCardModal(props) {
  if (!props.isOpen) return null;
  return <JobCardWindow key={props.jobCardId ?? 'new'} {...props} />;
}

// A reply that comes back after the window has closed: one that only updates this
// window's own screen needs no check (React drops it). One that reaches outside it must
// either name its job (the callbacks into the list behind: onNotesChange, onCommentsRead)
// or ask isWindowUp first — but only for screen changes, closing, and read-failure
// messages. A failure of the person's own write is always told, window or not.
function JobCardWindow({ onClose, jobCardId = null, onSuccess, onTimerChange, onNotesChange, onCommentsRead, onPrinted, initialTab = null, initialHistoryOpen = false, initialStopEntry = null, initialCommentNoteId = null, ownsStopForm = false }) {
  const { user, logout } = useAuth();
  const isWindowUp = useStillMounted();
  const isEdit = Boolean(jobCardId);
  // Two permissions, both admin-only today: pricing gates the Costing tab and its
  // countdown, activityTrail gates the History window. Everything else managerial on
  // this screen (editing, tabs, time-entry corrections) is admin-or-manager.
  const canSeePricing = can(user, 'pricing');
  const canSeeActivity = can(user, 'activityTrail');
  const canManage = isManagement(user);
  // Which side window is open. History starts open when the job is opened from a search
  // result for an activity entry (initialHistoryOpen), whatever tab that result lands on.
  // Only one can be open at a time, so it is one value: null, 'comments' or 'history'.
  const [sideWindow, setSideWindow] = useState(() => (initialHistoryOpen && canSeeActivity ? 'history' : null));
  const historyOpen = sideWindow === 'history';
  const setCommentsOpen = useCallback((next) => {
    setSideWindow(prev => (next ? 'comments' : (prev === 'comments' ? null : prev)));
  }, []);
  const setHistoryOpen = useCallback((next) => {
    setSideWindow(prev => (next ? 'history' : (prev === 'history' ? null : prev)));
  }, []);
  // Only tabs this user can actually open are valid; anything else (a stale 'costing'
  // for someone who can't see it) lands on Details.
  const [activeTab, setActiveTab] = useState(() => {
    const validTabs = ['details'].concat(canSeePricing ? ['costing'] : []);
    return validTabs.includes(initialTab) ? initialTab : 'details';
  });
  // An existing job starts out loading, so its first frame is the spinner and never the
  // empty form.
  const [loading, setLoading] = useState(isEdit);
  // The job this window has finished loading once (null until then). Holding the id, not a
  // flag, means the window opening on another job starts again from not-yet-loaded.
  const [firstLoadDoneFor, setFirstLoadDoneFor] = useState(null);
  const [timeEntries, setTimeEntries] = useState([]);
  const [attachmentWarnings, setAttachmentWarnings] = useState(null);
  // An instant write never touches the list behind this modal — useJobCardCloseGuard.js.
  const { flagInstantSave, closeAndRefresh } = useJobCardListRefresh({ isEdit, onSuccess, onClose });
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
  // formHook (below) holds the job number, but this callback is built before it exists.
  const jobNumberRef = useRef(null);
  // A write refused because the job was closed is lost work, so the person is always told
  // — even when the window has gone since, which is why the message names the job — but
  // the reload only means anything while the window is still up. This is the one place
  // that rule lives.
  const handleJobClosedWrite = useCallback(() => {
    toastJobWriteFailure({ jobNumber: jobNumberRef.current, jobCardId }, JOB_CLOSED_MESSAGE, 'job-closed');
    if (isWindowUp()) {
      reloadOnJobClosedRef.current?.();
    }
  }, [isWindowUp, jobCardId]);
  // formHook also owns the one save queue for this open job card (Contract A) —
  // formHook.saveQueue — that every instant write (a field, a part, a worker)
  // routes through, so what's queued, in flight or failed is one recorded fact
  // instead of three separate hand-rolled promise-chain registries.
  const formHook = useJobCardForm(jobCardId, { onInstantSave: flagInstantSave, onJobClosed: handleJobClosedWrite, isWindowUp });
  jobNumberRef.current = formHook.jobNumber;
  // The details fields and the parts list save themselves through these (see
  // useJobCardInstantSaves.js). A part write's reply also refreshes the file
  // notes here (Contract B) — setAttachmentWarnings is the one landing point,
  // whether the write came from a part being added, edited or removed, or a
  // field such as the quality level.
  const { instantSave, instantItems, detailFieldErrors } = useJobCardInstantSaves(formHook, isEdit, jobCardId, formHook.saveQueue, {
    onAttachmentWarnings: setAttachmentWarnings,
    onJobClosed: handleJobClosedWrite
  });
  const activityLog = useActivityLog(jobCardId, isWindowUp);
  const reloadTimeEntriesRef = useRef(null);
  const hubRef = useRef(null);
  // `changedJobId` is the job whose clock actually changed — a refused stop can be for
  // a clock on another job. This job's work list only reloads when it is this job's.
  const onExternalStop = useCallback((changedJobId) => {
    const changed = changedJobId || jobCardId;
    if (String(changed) === String(jobCardId) && reloadTimeEntriesRef.current) reloadTimeEntriesRef.current();
    // Work changed from outside this PC's own writes: announce it so History catches up.
    api.noteJobChanged(changed);
  }, [jobCardId]);
  // lineItems is handed in so the timer's own toasts and switch-timer prompts can
  // name a part by its position in this job's list, never by its stored number.
  const timer = useTimer(isEdit ? jobCardId : null, { onExternalStop, lineItems: formHook.lineItems, onJobClosed: handleJobClosedWrite });
  const showStopFormForEntry = timer.showStopFormForEntry;
  const shownStopEntryIds = timer.shownStopEntryIds;
  // While this screen is open on an existing job, the shell shows that job's stop form here
  // instead of opening a second copy, and tells it to reload when an answer to the "when
  // did you finish?" question changed this job's clock and work from outside this screen.
  // The shell's own copy (ownsStopForm) never registers.
  const finishQuestion = useFinishQuestion();
  const registerJobScreen = finishQuestion?.registerJobScreen;
  const reloadAfterAnswerRef = useRef(null);
  const jobScreen = useMemo(() => ({
    showStopForm: showStopFormForEntry,
    shownStopEntryIds,
    reload: () => reloadAfterAnswerRef.current?.()
  }), [showStopFormForEntry, shownStopEntryIds]);
  useEffect(() => {
    if (!registerJobScreen || ownsStopForm || !isEdit || !jobCardId) return undefined;
    return registerJobScreen(jobCardId, jobScreen);
  }, [registerJobScreen, ownsStopForm, isEdit, jobCardId, jobScreen]);
  // Questions belong to this window: the hook answers any still waiting "no" when the
  // window unmounts, so none is left outstanding behind a box that can no longer be seen.
  const { dialogState, showConfirm, handleCancel, handleConfirm, handleAlt } = useConfirmDialog();

  // The lists every picker on this screen draws from — suppliers, workers, machines —
  // loaded when the window opens (useJobCardReferenceData.js).
  const { suppliers, employees, machines, reloadSuppliers, reloadEmployees } = useJobCardReferenceData({ isWindowUp });
  // A posted comment answers the questions waiting on this person for this job.
  const mentionsAnsweredOnJob = useMentions()?.mentionsAnsweredOnJob;
  const jobNotes = useJobNotes({
    jobcardId: isEdit ? jobCardId : null,
    showConfirm,
    onChange: onNotesChange,
    onJobClosed: handleJobClosedWrite,
    isWindowUp,
    jobNumber: formHook.jobNumber,
    staff: employees,
    onPosted: mentionsAnsweredOnJob,
    reloadStaff: reloadEmployees
  });
  // Pricing: the load when the Costing tab is first shown and the save-on-the-way-out
  // paths all live in this hook — see useJobCardCosting.js.
  const costingHook = useJobCardCosting({ isEdit, canSeePricing, jobCardId, jobNumber: formHook.jobNumber, activeTab, onJobClosed: handleJobClosedWrite });


  const { setFormDataFromJobCard, setFormData } = formHook;
  const { setContactFromJobCard } = contactHook;
  const { loadHistory } = activityLog;
  const { loadNotes } = jobNotes;
  // How far this person has read the job's comments (null until the job has loaded). Only
  // ever moves forward: a late reply carrying an older value can't un-read anything.
  const [commentsSeenUpTo, setCommentsSeenUpTo] = useState(null);
  // The same fact twice on purpose: the state drives the History effect below, the ref
  // lets the loader itself read it without a stale closure. Only ever written here, so
  // the two can't drift.
  const firstLoadDoneRef = useRef(null);
  const markFirstLoadDone = useCallback((id) => {
    firstLoadDoneRef.current = id;
    setFirstLoadDoneFor(id);
  }, []);
  const loadJobCard = useCallback(async () => {
    if (!isEdit || !jobCardId) return;

    setLoading(true);
    try {
      const [jobcardRes, timeEntriesRes] = await Promise.all([
        api.getJobcard(jobCardId),
        api.getTimeEntries(jobCardId)
      ]);

      // The window closed while this was on its way: nothing to fill in, and loading
      // the comments now would be a request for a screen that is gone.
      if (!isWindowUp()) return;

      const jobcardData = jobcardRes;
      setFormDataFromJobCard(jobcardData);
      setContactFromJobCard(jobcardData);
      setAttachmentWarnings(jobcardData.attachmentWarnings || null);
      setCommentsSeenUpTo(prev => newerMoment(prev, jobcardData.commentsSeenUpTo || null));
      setTimeEntries((timeEntriesRes || []).map(mapTimeEntryFromApi));

      loadNotes();

      // Every full reload after the first brings an open History up to date, through the
      // same signal a write uses.
      if (firstLoadDoneRef.current === jobCardId) api.noteJobChanged(jobCardId);

      // Costing loads separately, in useJobCardCosting, and only once the pricing screen
      // has actually been opened — the fetch walks every logged minute, and most job
      // opens never touch pricing at all.
    } catch (err) {
      // A failure for a window that has closed must not toast or close — onClose would
      // close whichever job the person opened since.
      if (!isWindowUp()) return;
      // A 404 means the job was deleted (from another PC, or this screen was opened
      // from a stale row or activity entry) — trying again can never work.
      if (err.status === 404) toast.error(JOB_DELETED_MESSAGE, { id: JOB_DELETED_TOAST_ID });
      else toast.error('Couldn\'t load the job card. Try again in a moment.');
      onClose();
    } finally {
      setLoading(false);
      markFirstLoadDone(jobCardId);
    }
  }, [isEdit, jobCardId, setFormDataFromJobCard, setContactFromJobCard, loadNotes, onClose, isWindowUp, markFirstLoadDone]);
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
    reloadTimeEntriesAndCosting,
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
    isWindowUp
  });

  // What the shell asks for after an answer: the running clock (a "still working" answer
  // started one), then the work list, the pricing hours and the job's status. Only what
  // the answer can have moved — the form on screen, a stop form included, is left alone.
  const { loadActiveTimer } = timer;
  reloadAfterAnswerRef.current = () => {
    loadActiveTimer();
    reloadTimeEntriesAndCosting().catch(() => {
      // Non-fatal — the work list catches up next time the job is opened.
    });
  };

  const timeEntry = useTimeEntries(jobCardId, {
    ...apiTimeEntryOperations,
    reloadTimeEntries: reloadTimeEntriesAndCosting,
    showConfirm,
    isInvoiced,
    onJobClosed: handleJobClosedWrite
  });
  // Tells the server the person has read the thread up to this comment. Silent on failure
  // (the panel tries again next time it is open with newer comments). The callback into
  // the list names its job, so it still fires if the window closed meanwhile: the server
  // has marked the comments read either way and the list row should clear.
  const markCommentsRead = useCallback(async (seenUpTo) => {
    try {
      const res = await api.markJobNotesRead(jobCardId, seenUpTo);
      setCommentsSeenUpTo(prev => newerMoment(prev, res.commentsSeenUpTo));
      onCommentsRead?.(jobCardId, res.unreadNotes);
    } catch {
      // Not worth a pop-up: the unread mark simply stays until the next try.
    }
  }, [jobCardId, onCommentsRead]);
  // Pricing/activity access can also be lost while the window is already open. The
  // tab strip and the Costing/Activity panels vanish on that render, so without
  // this the body would draw nothing at all.
  useEffect(() => {
    if (activeTab === 'costing' && !canSeePricing) setActiveTab('details');
    if (!canSeeActivity) setHistoryOpen(false);
  }, [canSeePricing, canSeeActivity, activeTab, setHistoryOpen]);

  // Once, as the window mounts: an existing job loads (the running clock is loaded by
  // useTimer's own effect), and a stop form this opening was handed (from the shell's
  // "when did you finish?" question: the clock the server stopped by itself now needs
  // the usual form) is shown. Showing the same form twice is a no-op, so strict mode's
  // second mount can't stack a copy.
  useEffect(() => {
    if (isEdit) loadJobCard();
    if (initialStopEntry) showStopFormForEntry(initialStopEntry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectCompany = (company) => contactHook.selectCompany(company, formHook.setFormData);
  const selectPerson = (personId) => contactHook.selectPerson(personId, formHook.setFormData);
  const handleContactFieldChange = (field, value) => contactHook.handleContactFieldChange(field, value, formHook.setFormData);
  const adoptExactCompany = (name) => contactHook.adoptExactCompany(name, formHook.setFormData);

  // Marks a contact box instead of a pop-up when Create (or the "Update contact" /
  // "Add as new person" prompt it can run first) comes back with a 400 naming
  // companyName (the new-customer step)/contactName/contactPhone/contactEmail — see useJobCardSave.js's
  // fieldErrorsFromRefusal (hooks/useFieldErrors.js). Declared before useJobCardSave so its callback can
  // close over it.
  const contactFieldErrors = useFieldErrors((name) => {
    if (name === 'companyName') return contactHook.contactFormData.companyName;
    if (name === 'contactName') return contactHook.contactFormData.contactName;
    if (name === 'contactPhone') return contactHook.contactFormData.phone;
    if (name === 'contactEmail') return contactHook.contactFormData.email;
    return undefined;
  });
  const handleContactFieldErrors = useCallback((errors) => {
    contactFieldErrors.setFieldErrors(errors);
    const order = ['companyName', 'contactName', 'contactPhone', 'contactEmail'];
    const first = order.find(k => errors[k]);
    const boxId = { companyName: 'jc-company-name', contactName: 'jc-contact', contactPhone: 'jc-phone', contactEmail: 'jc-email' }[first];
    if (boxId) scrollFieldIntoView(boxId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactFieldErrors.setFieldErrors]);

  // Create's own check (jobCardValidation.mjs) marks the boxes at fault — the
  // customer, the description and each part's boxes — and brings the first one, in
  // the order they sit on screen, into view. Each mark goes by itself once its box
  // holds something else (hooks/useFieldErrors.js).
  const { markDescription } = formHook;
  const { markItemFields } = instantItems;
  const handleFormMarks = useCallback(({ job, items }) => {
    if (job.companyName) contactFieldErrors.setFieldErrors({ companyName: job.companyName });
    if (job.description) markDescription(job.description, formHook.formData.description);
    if (Object.keys(items).length > 0) markItemFields(items);
    const firstItemKey = formHook.lineItems
      .flatMap(item => ['description', 'qty', 'jobType', 'drawingsType', 'customerProperty']
        .map(field => fieldErrorKey(item.id, field)))
      .find(key => items[key]);
    const first = (job.description && 'jc-description') || (job.companyName && 'jc-company-name') || firstItemKey;
    if (first) scrollFieldIntoView(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactFieldErrors.setFieldErrors, markDescription, markItemFields, formHook.formData.description, formHook.lineItems]);

  // Create-only now (useJobCardSave.js) — an existing job has nothing left for a
  // Save to do; every field, row and worker writes itself the moment it changes.
  const { saving, handleSubmit } = useJobCardSave({
    canManage, isEdit, formHook, contactHook,
    showConfirm, onSuccess, onClose, setAttachmentWarnings, isWindowUp,
    onContactFieldErrors: handleContactFieldErrors,
    onFormMarks: handleFormMarks
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

  // A part's New supplier form keeps what is typed only inside itself, so each open
  // one reports here under its own key whether it holds typing (LineItemTreatment.jsx).
  // Counted as unsaved work by the close question, the leave-page question and the
  // inactivity sign-out, and asked about before leaving the Details tab — the form
  // goes with the tab. A form reports false as it goes, so nothing outlives a close.
  const [supplierDrafts, setSupplierDrafts] = useState(() => new Set());
  const reportSupplierDraft = useCallback((key, hasTyping) => {
    setSupplierDrafts(prev => {
      if (prev.has(key) === hasTyping) return prev;
      const next = new Set(prev);
      if (hasTyping) next.add(key); else next.delete(key);
      return next;
    });
  }, []);
  const supplierDraftOpen = supplierDrafts.size > 0;

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
    if (activeTab === 'details' && tab !== 'details' && supplierDraftOpen) {
      const leave = await showConfirm({
        title: 'Unsaved supplier',
        message: "The new supplier you started hasn't been saved. Leave it and lose it?",
        confirmLabel: 'Discard supplier',
        cancelLabel: 'Keep editing',
        confirmVariant: 'danger'
      });
      if (!leave) return;
    }
    setActiveTab(tab);
  }, [activeTab, canSeePricing, costingHook, showConfirm, supplierDraftOpen]);
  // The strip's "For <company>" and assignee buttons: bring the named section of the
  // Details tab into view, switching to that tab first when the person is elsewhere.
  const revealSection = useCallback(async (sectionId) => {
    if (activeTab !== 'details') {
      await handleTabChange('details');
    }
    requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [activeTab, handleTabChange]);

  // Removing a part that has anything filled in asks first — its answers are lost with
  // it. A blank part goes without a question. Time logged on a part is never lost by this
  // (the server refuses the removal while any is logged, and that message still shows).
  const requestRemoveItem = useCallback(async (item) => {
    const hasContent = Boolean(
      (item.description || '').trim() ||
      item.material ||
      (Array.isArray(item.treatments) && item.treatments.length > 0) ||
      item.drawingsType ||
      item.customerProperty
    );
    if (hasContent) {
      const idx = formHook.lineItems.findIndex(it => it.id === item.id);
      const number = item.position != null ? item.position : idx + 1;
      const description = (item.description || '').trim();
      const keep = await showConfirm({
        title: description ? `Remove part ${number}, "${description}"?` : `Remove part ${number}?`,
        message: 'Its material, service, supplier and drawing answers will be lost. Logged time on it is kept.',
        confirmLabel: 'Remove part',
        cancelLabel: 'Keep part',
        confirmVariant: 'danger'
      });
      if (!keep) return;
    }
    instantItems.removeItem(item);
  }, [formHook.lineItems, showConfirm, instantItems]);

  // Part cards that hold a failed write, for the "Not saved · Retry" chip: a saved
  // part's failed write is read from the save queue (keyed `item:<id>`), a new part's
  // failed create from the parts list itself.
  const failedItemIds = useMemo(() => {
    const out = new Set(instantItems.createFailedIds);
    for (const { key, state } of formHook.saveQueue.pending()) {
      if (state === 'failed' && key.startsWith('item:')) out.add(key.slice('item:'.length));
    }
    return out;
  }, [instantItems.createFailedIds, formHook.saveQueue]);

  const { handleRequestClose } = useJobCardCloseGuard({
    isEdit, jobCardId, canSeePricing, isDirty, supplierDraftOpen,
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
  // touched money would turn the frame amber and then never answer it. Both counts
  // start from zero in each window, so a previous opening's tally can never be mistaken
  // for this one's.
  const landedOnJob = formHook.saveQueue.landedCount + costingHook.costingLandedCount;

  // History reads on exactly three occasions: (a) when it opens, once the job's FIRST load
  // in this window is done (`firstLoadDoneFor`), so a window opened with History already
  // open reads once, not once per piece of data arriving; (b) api.onJobChanged, the one
  // signal every accepted write under this job announces; (c) after every full reload of
  // the job once the first is done, which loadJobCard announces through that same signal.
  // It must not wait on `loading` itself, which every reload flips. A second read right
  // after a write is accepted: reads coalesce (useActivityLog), so one is queued behind
  // the other, never concurrent, and the newest result wins. A trigger is never removed
  // to avoid a second read.
  const firstLoadDone = firstLoadDoneFor === jobCardId;
  useEffect(() => {
    if (!isEdit || !historyOpen || !firstLoadDone) return undefined;
    loadHistory();
    return api.onJobChanged(jobCardId, loadHistory);
  }, [isEdit, historyOpen, firstLoadDone, loadHistory, jobCardId]);

  // The window frame is the whole answer to "did that save?" on an existing job —
  // amber while something on screen hasn't reached the job, green for a moment once
  // the last of it has landed. It replaces the small "Saving… / Saved" the header used
  // to carry, which there is no longer room for beside the job number, priority,
  // description, status and due date. Green is driven by writes the server actually
  // confirmed rather than by unsaved work disappearing, so abandoning an edit no longer
  // reads as saving it.
  const { flashing: savedFlash, anythingLanded } = useSavedFlash({
    landedCount: landedOnJob,
    waiting: waitingOnSave
  });

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
      onReload={loadJobCard}
      companyName={contactHook.contactFormData.companyName}
      assignees={formHook.assignees}
      revealSection={revealSection}
    />
  );

  return (
    <>
      <BottomSheet
        isOpen
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
        // The comments live in their own window to the left of the job, for every
        // role and on every tab; a job that does not exist yet has no thread.
        aside={isEdit && jobCardId ? (
          <>
          <JobCommentsPanel
            jobNumber={formHook.jobNumber}
            notes={jobNotes.notes}
            newNote={jobNotes.newNote}
            setNewNote={jobNotes.setNewNote}
            onPickMention={jobNotes.addPickedMention}
            checking={jobNotes.checking}
            willAsk={jobNotes.willAsk}
            commentError={jobNotes.commentError}
            commentFieldProps={jobNotes.commentFieldProps}
            commentErrorProps={jobNotes.commentErrorProps}
            initialCommentNoteId={initialCommentNoteId}
            onAddNote={jobNotes.addNote}
            onDeleteNote={jobNotes.deleteNote}
            loading={jobNotes.loading}
            sending={jobNotes.sending}
            loadError={jobNotes.loadError}
            onRetry={jobNotes.loadNotes}
            notesLoaded={jobNotes.notesLoaded}
            seenUpTo={commentsSeenUpTo}
            onMarkRead={markCommentsRead}
            canManage={canManage}
            employees={employees || NO_EMPLOYEES}
            locked={jobClosed}
            open={sideWindow === 'comments'}
            onOpenChange={setCommentsOpen}
            otherOpen={historyOpen}
          />
          {canSeeActivity && (
            <JobHistoryPanel
              jobNumber={formHook.jobNumber}
              history={activityLog.history}
              loading={activityLog.loadingHistory}
              loaded={activityLog.historyLoaded}
              failed={activityLog.historyFailed}
              onRefresh={loadHistory}
              open={historyOpen}
              onOpenChange={setHistoryOpen}
              otherOpen={sideWindow === 'comments'}
            />
          )}
          </>
        ) : null}
        headerActions={
          isEdit && jobCardId ? (
            <JobPaperworkHub
              ref={hubRef}
              jobcardId={jobCardId}
              jobNumber={formHook.jobNumber}
              onFilesChanged={refreshAttachmentWarnings}
              onPrinted={onPrinted}
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
                  {JOB_CLOSED_MESSAGE}
                </div>
              )}
              {isEdit && canSeePricing && (
                <div className="modal-tabs">
                  <button type="button" className={`tab ${activeTab === 'details' ? 'active' : ''}`} onClick={() => handleTabChange('details')}>
                    Details
                  </button>
                  {/* Each tab button below only renders when its own permission
                      allows it, so the bar itself doesn't re-ask a question the
                      tab content below already answers. */}
                  {canSeePricing && (
                    <button type="button" className={`tab ${activeTab === 'costing' ? 'active' : ''}`} onClick={() => handleTabChange('costing')}>Costing</button>
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
                  detailGroupClass={detailFieldErrors.groupClass}
                  detailErrorFor={detailFieldErrors.errorFor}
                  detailErrorProps={detailFieldErrors.errorProps}
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
                  typedCompanyArchived={contactHook.typedCompanyArchived}
                  showContactDropdown={contactHook.showContactDropdown}
                  contactSearchRef={contactHook.contactSearchRef}
                  fieldFocused={contactHook.fieldFocused}
                  handleFieldFocus={contactHook.handleFieldFocus}
                  handleFieldBlur={contactHook.handleFieldBlur}
                  contactGroupClass={contactFieldErrors.groupClass}
                  contactErrorFor={contactFieldErrors.errorFor}
                  contactErrorProps={contactFieldErrors.errorProps}
                  employees={employees || NO_EMPLOYEES}
                  assignees={formHook.assignees}
                  toggleAssignee={formHook.toggleAssignee}
                  lineItems={formHook.lineItems}
                  addLineItem={formHook.addLineItem}
                  updateLineItem={formHook.updateLineItem}
                  removeLineItem={requestRemoveItem}
                  failedItemIds={failedItemIds}
                  onRetryItem={instantItems.retryItem}
                  onItemFieldChange={instantItems.handleItemFieldChange}
                  onItemFieldBlur={instantItems.commitItemFieldBlur}
                  itemErrorFor={instantItems.itemErrorFor}
                  suppliers={suppliers || []}
                  onSuppliersChanged={reloadSuppliers}
                  onSupplierDraftChange={reportSupplierDraft}
                  attachmentWarnings={attachmentWarnings}
                  onAttachItemFile={isEdit && !jobClosed ? handleAttachItemFile : undefined}
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
                  timeEntryInspectionRequired={timeEntry.inspectionRequired}
                  timeEntryEditingSignOffRequired={timeEntry.editingSignOffRequired}
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
                  {saving ? 'Saving…' : 'Create'}
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
        mustFillIn={timer.mustFillIn}
        onSignOut={logout}
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
