import { useState, useCallback, useMemo, useRef } from 'react';
import { api } from '../../services/api';
import { getDefaultFormData, mapLineItemFromApi, buildItemPayload } from './mappers';
import { isSavedLineItem } from './jobCardValidation.mjs';
import { lineItemHasContent } from './closeReasons';
import { useSaveQueue } from './useSaveQueue';

const makeEmptyLineItem = (itemNumber = 1) => ({
  id: Date.now() + Math.random(),
  itemNumber,
  qty: '',
  description: '',
  jobType: '',
  material: '',
  treatments: [],
  drawingsType: '',
  customerProperty: ''
});

// What the screen looked like the last time it was loaded or saved. Comparing the
// three snapshots below against what's on screen now is what lets the header say
// there are edits still waiting on a Save.
//
// Status is deliberately left out: choosing a new status sends itself straight
// away, and the server also nudges it on its own when work starts or finishes.
const snapshotForm = (formData) => {
  const { status, ...rest } = formData;
  return JSON.stringify(rest);
};
const snapshotAssignees = (assignees) =>
  JSON.stringify([...new Set(assignees.map(a => a.userId))].sort());
// Part ids are left out: a part added here carries a temporary id until it is
// saved, so the stored id coming back would otherwise read as an edit. A row added
// and left blank now counts as an unsaved edit too — the save refuses it until it's
// filled in or removed, so the header is right to say there's something waiting.
const snapshotItems = (lineItems) =>
  JSON.stringify(lineItems.map(({ id, ...rest }) => rest));

// What a brand-new, untouched job card looks like: the default form values, no
// assignees, and the single blank part row the state below starts with. This is
// the baseline a new card gets instead of null — see the comment on `saved` below.
//
// itemFields is the existing-job counterpart to `items` above: a brand-new job has
// no real ("item:"-id) rows yet, so it starts empty and is never read until one
// exists (see setFormDataFromJobCard and the isDirty comment below).
const pristineSaved = () => ({
  form: snapshotForm(getDefaultFormData()),
  assignees: snapshotAssignees([]),
  items: snapshotItems([makeEmptyLineItem(1)]),
  itemFields: {}
});

/**
 * Custom hook for job card form state management
 * Handles form data, line items, and assignees
 *
 * jobCardId is null/undefined for a brand-new job and the stored job's id once one
 * exists — it decides whether toggling a worker stays purely on screen (create) or
 * writes itself immediately (existing job), and which job an in-flight write belongs to.
 *
 * onInstantSave (optional) fires once for every write that actually lands here — an
 * assignee toggle, and (via markFieldSaved/markItemSaved/markItemRemoved, called by
 * useJobCardInstantSaves.js) a field or a part — never on every keystroke. This is
 * the one seam all of those seemingly-separate writes share, which is what lets
 * JobCardModal.jsx tell whether the job list behind it needs refreshing when this
 * card closes, without listening to each write path individually.
 *
 * Also owns the one save queue (useSaveQueue.js, Contract A) for this open job
 * card — every worker tick/untick routes through it under key
 * `assignee:<userId>`, and it's handed out (as `saveQueue` on the return value)
 * for the details fields and the parts list to write through too
 * (useJobCardInstantSaves.js), so every instant write on the card shares the one
 * record instead of each area keeping its own.
 */
export function useJobCardForm(jobCardId, { onInstantSave } = {}) {
  // Core form data
  const [formData, setFormData] = useState(getDefaultFormData());
  const [jobNumber, setJobNumber] = useState('');
  const saveQueue = useSaveQueue(jobCardId);

  // Related data (locally managed for create mode, from API for edit mode)
  const [assignees, setAssignees] = useState([]);
  const [lineItems, setLineItems] = useState([makeEmptyLineItem(1)]);

  // Starts at the pristine baseline (not null) so an untouched brand-new card reports
  // clean, but typing into it makes isDirty true right away — a null baseline made
  // isDirty permanently false until the first Save, which is exactly the card
  // handleRequestClose most needs to protect. loadJobCard/setFormDataFromJobCard
  // below replaces this with the loaded job's own snapshot once a job is loaded.
  const [saved, setSaved] = useState(pristineSaved);
  // False from the moment an existing job starts opening (resetForm runs first,
  // dropping in one blank local row) until setFormDataFromJobCard has replaced it
  // with the real one. Without this, itemsDirty below reads that placeholder row
  // as an unsaved part for the whole loading window — the header wears the amber
  // ring and Escape asks about a change nobody made. A brand-new job never sets
  // this at all, so its own itemsDirty branch (below) is untouched by it.
  const [loaded, setLoaded] = useState(false);
  // The job description's own required-box mark. Lifted up from JobIdentityStrip
  // (rather than kept as that component's local state) so the close question
  // (useUnsavedGuard.js, via closeReasons.js) can see it — JobIdentityStrip
  // unmounts on every close (JobCardModal returns null rather than hiding it), so
  // resetForm below clears this the same way a fresh mount would have.
  const [descriptionError, setDescriptionError] = useState(null);
  // Assigned during render rather than in an effect, so toggleAssignee below always
  // reads the people list and the open job as they stand right now, not one commit
  // behind: assigneesRef decides the next tap's direction without listing
  // `assignees` as a dependency (which would rebuild its promise-chaining closure
  // on every tick), and jobCardIdRef tells whether a write that lands late still
  // belongs to the job on screen.
  const assigneesRef = useRef(assignees);
  assigneesRef.current = assignees;
  const jobCardIdRef = useRef(jobCardId);
  jobCardIdRef.current = jobCardId;
  // Bumped every time resetForm runs — which is every time this window (re)opens,
  // on any job. A brand-new create that's still travelling when the window is
  // closed and reopened (same job or a different one) can capture this before it
  // sends and compare afterwards, so its reply knows the window it was meant for
  // is gone and must not close, or set warnings on, whichever job is open now.
  // See useJobCardSave.js.
  const sessionRef = useRef(0);

  // A part now saves itself row by row (useInstantItems.js), so "are the parts
  // dirty" is no longer one whole-list comparison — it's asked per row:
  //   - a brand-new job has nothing to write to yet, so every row is still local
  //     and the parts list is exactly the old whole-snapshot compare.
  //   - an existing job only ever has a row worth flagging in one of two states: a
  //     row that hasn't become real yet (isSavedLineItem false — nothing has been
  //     sent for it at all), or a real row whose on-screen value has drifted from
  //     what saved.itemFields last recorded the server actually storing for it
  //     (mid-typing before its blur/change write lands, or a write that failed).
  const itemsDirty = useMemo(() => {
    if (!jobCardId) {
      return snapshotItems(lineItems) !== saved.items;
    }
    // Still loading: lineItems is resetForm's placeholder blank row, not anything
    // the user has touched — nothing to flag yet.
    if (!loaded) return false;
    return lineItems.some(item => {
      // A still-local row only counts once something has actually been typed
      // into it — the normal starting state for a fresh "Add Part" row is a
      // blank row, not an edit waiting to be lost. closeReasons.js's own dirty
      // narration uses this exact same check (lineItemHasContent), so the two
      // can never disagree about whether there's really anything here (defect 5
      // — an untouched blank row used to flag this true regardless, which meant
      // Escape asked about "changes" the close-reason builder could never name).
      if (!isSavedLineItem(item)) return lineItemHasContent(item);
      const base = saved.itemFields[item.id];
      return base === undefined || JSON.stringify(buildItemPayload(item)) !== base;
    });
  }, [jobCardId, lineItems, saved, loaded]);

  // Named on its own (not just folded into isDirty below) so the close question
  // (closeReasons.js) can say a team assignment hasn't reached the job, without
  // having to re-derive the same comparison a second time.
  const assigneesDirty = useMemo(() => snapshotAssignees(assignees) !== saved.assignees, [assignees, saved.assignees]);

  const isDirty = useMemo(() => {
    return snapshotForm(formData) !== saved.form
      || assigneesDirty
      || itemsDirty;
  }, [saved, formData, assigneesDirty, itemsDirty]);

  // The last known persisted value for each form field — the baseline a blur write
  // (useInstantSave, wired up in JobIdentityStrip/DetailsTab) compares against so
  // tabbing through a field without editing it produces no write, and a value typed
  // back to what's already stored produces none either. Status is left out, same as
  // snapshotForm above, since it's never written through this path.
  const savedForm = useMemo(() => {
    try {
      return JSON.parse(saved.form);
    } catch {
      return {};
    }
  }, [saved.form]);

  // The per-row counterpart to savedForm above — each real row's last known
  // persisted field values, keyed by its stored id, for useInstantItems.js's
  // skip-if-unchanged blur check (commitItemFieldBlur) and for itemsDirty above.
  const savedItemFields = useMemo(() => {
    const out = {};
    for (const [id, json] of Object.entries(saved.itemFields || {})) {
      try {
        out[id] = JSON.parse(json);
      } catch {
        // Malformed baseline entry — treat as absent so the row reads as dirty
        // rather than silently comparing against garbage.
      }
    }
    return out;
  }, [saved.itemFields]);

  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  }, []);

  // Line Items handlers
  const addLineItem = useCallback(() => {
    setLineItems(prev => {
      const nextNum = prev.length > 0 ? Math.max(...prev.map(i => i.itemNumber)) + 1 : 1;
      return [...prev, makeEmptyLineItem(nextNum)];
    });
  }, []);

  const updateLineItem = useCallback((id, field, value) => {
    setLineItems(prev => prev.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  }, []);

  const removeLineItem = useCallback((id) => {
    setLineItems(prev => {
      if (prev.length > 1) {
        return prev.filter(item => item.id !== id);
      }
      return prev;
    });
  }, []);

  // Assignee handlers
  //
  // On a brand-new job there is nothing to write to yet, so the tick stays purely on
  // screen and travels in the create payload instead. On an existing job it's
  // optimistic: the screen updates immediately, then the one worker is written
  // through the shared save queue (useSaveQueue.js) under key `assignee:<userId>` —
  // same key runs in order for a fast tick/untick/tick of the same person, and a
  // write for one worker never blocks a write for somebody else. Success moves the
  // saved baseline to match, so the change stops reading as unsaved; failure leaves
  // the screen as the user set it and leaves the baseline where it was, so the amber
  // unsaved ring correctly flags it — writes are never re-sent automatically, so it
  // waits on the user to retry.
  const toggleAssignee = useCallback((employee) => {
    const workerId = employee.id;
    const willAssign = !assigneesRef.current.some(a => a.userId === workerId);

    setAssignees(prev => {
      const exists = prev.some(a => a.userId === workerId);
      if (willAssign) {
        return exists ? prev : [...prev, { userId: workerId, userName: employee.name || employee.username }];
      }
      return prev.filter(a => a.userId !== workerId);
    });

    const forJobCardId = jobCardIdRef.current;
    if (!forJobCardId) return; // new job — local only

    const label = `${employee.name || employee.username || 'that worker'}'s assignment`;
    saveQueue.enqueue(`assignee:${workerId}`, (isCurrent) => (willAssign
      ? api.assignWorker(forJobCardId, workerId)
      : api.unassignWorker(forJobCardId, workerId))
      .then(() => {
        // A reply for a job the user has since left — or for an earlier opening of
        // this same job — must not mark the people list now on screen as saved.
        if (!isCurrent()) return;
        onInstantSave?.();
        setSaved(prev => ({
          ...prev,
          assignees: willAssign
            ? snapshotAssignees([...JSON.parse(prev.assignees), workerId].map(id => ({ userId: id })))
            : snapshotAssignees(JSON.parse(prev.assignees).filter(id => id !== workerId).map(id => ({ userId: id })))
        }));
      }), { label });
  }, [onInstantSave, saveQueue]);

  // Moves one field's baseline forward after an instant-save write succeeds (see
  // useInstantSave.js) — the same idea as toggleAssignee moving the assignees
  // baseline forward one worker at a time, just for the details fields instead.
  // Only the one key changes: a field that failed to save, or one the user is
  // still mid-edit on, keeps reading as unsaved while everything that DID save
  // stops flagging itself. Replacing the whole form snapshot instead would
  // wrongly call both clean.
  const markFieldSaved = useCallback((name, value) => {
    onInstantSave?.();
    setSaved(prev => {
      const parsed = JSON.parse(prev.form);
      if (!(name in parsed)) {
        // Every instantly-saved field already exists on the form baseline — it's
        // seeded from getDefaultFormData/setFormDataFromJobCard — so a key that
        // isn't there yet would be appended instead of replacing, shifting
        // JSON.stringify's key order and making the form compare unequal to
        // itself forever. Safer to leave the baseline untouched than risk that.
        return prev;
      }
      parsed[name] = value;
      return { ...prev, form: JSON.stringify(parsed) };
    });
  }, [onInstantSave]);

  // The per-row counterpart to markFieldSaved above, called by useInstantItems.js
  // once a row's create or update actually lands. payload is what the server
  // confirmed it stored (buildItemPayload of its reply), not what was on screen at
  // send time — an edit made to the row while that request was travelling must stay
  // marked unsaved, and recording the server's own copy is what keeps it so.
  const markItemSaved = useCallback((itemId, payload) => {
    onInstantSave?.();
    setSaved(prev => ({
      ...prev,
      itemFields: { ...prev.itemFields, [itemId]: JSON.stringify(payload) }
    }));
  }, [onInstantSave]);

  // A row removed server-side has nothing left to track a baseline for.
  const markItemRemoved = useCallback((itemId) => {
    onInstantSave?.();
    setSaved(prev => {
      const { [itemId]: _removed, ...rest } = prev.itemFields;
      return { ...prev, itemFields: rest };
    });
  }, [onInstantSave]);

  // Crediting work to someone puts them on the job server-side — the write has
  // already happened, so this only brings the screen and its baseline into line with
  // it. Fold in just this one worker, since replacing the whole list would drop a
  // tick/untick made to somebody else that hasn't reached the server yet.
  //
  // Stands aside while this worker's own tick/untick is still queued or in flight
  // (defect 7): unticking someone and then starting a timer for them used to credit
  // them straight back onto the screen AND move the saved baseline, so the card read
  // as fully saved while the still-travelling unassign was about to remove them
  // server-side. Once that write has actually settled (landed or failed), there's
  // nothing left to race and this can run as normal.
  const creditAssignee = useCallback((workerId, employees = []) => {
    if (!workerId || saveQueue.isPending(`assignee:${workerId}`)) return;
    setAssignees(prev => prev.some(a => a.userId === workerId) ? prev
      : [...prev, { userId: workerId, userName: employees.find(e => e.id === workerId)?.name || '' }]);
    setSaved(prev => ({ ...prev, assignees: snapshotAssignees([...JSON.parse(prev.assignees), workerId].map(id => ({ userId: id }))) }));
  }, [saveQueue]);

  // A tap discarded as an accident takes its worker back off the job server-side.
  // Same reasoning as above, in reverse — including the same stand-aside guard.
  const dropAssignee = useCallback((workerId) => {
    if (!workerId || saveQueue.isPending(`assignee:${workerId}`)) return;
    setAssignees(prev => prev.filter(a => a.userId !== workerId));
    setSaved(prev => ({ ...prev, assignees: snapshotAssignees(JSON.parse(prev.assignees).filter(id => id !== workerId).map(id => ({ userId: id }))) }));
  }, [saveQueue]);

  // Set form data from loaded job card
  const setFormDataFromJobCard = useCallback((jobcardData) => {
    const loadedJobNumber = jobcardData.jobNumber || '';
    setJobNumber(loadedJobNumber);
    const loadedForm = {
      jobNumber: loadedJobNumber,
      status: jobcardData.status || 'OPEN',
      companyId: jobcardData.companyId || '',
      contactId: jobcardData.contactId || '',
      contactName: jobcardData.contactName || '',
      companyName: jobcardData.companyName || '',
      contactPhone: jobcardData.contactPhone || '',
      contactEmail: jobcardData.contactEmail || '',
      qualityLevel: jobcardData.qualityLevel || 'STANDARD',
      qaLevelId: jobcardData.qaLevelId || null,
      priority: jobcardData.priority || 'NONE',
      poNumber: jobcardData.poNumber || '',
      quoteReference: jobcardData.quoteReference || '',
      description: jobcardData.description || '',
      dueDate: jobcardData.dueDate || '',
      isRepeatJob: jobcardData.isRepeatJob || false,
      repeatJobReference: jobcardData.repeatJobReference || ''
    };
    setFormData(loadedForm);

    // Map assignees from API data
    const apiAssignees = jobcardData.assignees || [];
    const loadedAssignees = apiAssignees.map(a => ({
      userId: a.userId,
      userName: a.userName || a.username
    }));
    setAssignees(loadedAssignees);

    // Map line items from API data
    const apiItems = jobcardData.items || [];
    const mappedItems = apiItems.map(mapLineItemFromApi);
    const loadedItems = mappedItems.length > 0 ? mappedItems : [makeEmptyLineItem(1)];
    setLineItems(loadedItems);

    // Everything on screen now matches what is stored — the starting point the
    // header's unsaved-edits mark is measured against. `items` (the whole-array
    // snapshot) is left exactly as resetForm just set it — itemsDirty never reads
    // it once jobCardId is set, so there's nothing here worth computing again;
    // itemFields is its real replacement for an existing job, and only ever holds
    // real rows (a job always loads with at least one) — see the isDirty comment.
    setSaved(prev => ({
      ...prev,
      form: snapshotForm(loadedForm),
      assignees: snapshotAssignees(loadedAssignees),
      itemFields: Object.fromEntries(
        loadedItems.filter(isSavedLineItem).map(item => [item.id, JSON.stringify(buildItemPayload(item))])
      )
    }));
    // The real rows are in now — itemsDirty can safely look at them.
    setLoaded(true);
  }, []);

  const resetForm = useCallback(() => {
    setFormData(getDefaultFormData());
    setJobNumber('');
    setAssignees([]);
    setLineItems([makeEmptyLineItem(1)]);
    setDescriptionError(null);
    // Back to the pristine baseline, same as the hook's own initial state, so a
    // second new card starts clean exactly like the first one did.
    setSaved(pristineSaved());
    // Runs before an existing job's own data has arrived — see the comment on
    // `loaded`'s declaration above.
    setLoaded(false);
    // JobCardModal returns null when closed rather than unmounting, so the save
    // queue outlives a close the same way every other piece of state here does —
    // without this, opening the next job would still show whatever was left
    // queued or failed on the previous one.
    saveQueue.reset();
    sessionRef.current += 1;
  }, [saveQueue]);

  return {
    // Form state
    formData,
    setFormData,
    jobNumber,
    setJobNumber,
    // See its own declaration above — useJobCardSave.js reads this to tell
    // whether a create it sent still belongs to the window now on screen.
    sessionRef,
    // The one save queue for this open job card (Contract A) — shared out to
    // useJobCardInstantSaves.js and useJobCardCloseGuard.js so every instant
    // write on the card, and the close question, read the same record.
    saveQueue,
    // Related data
    assignees,
    lineItems,
    setLineItems,
    // Handlers
    handleChange,
    addLineItem,
    updateLineItem,
    removeLineItem,
    toggleAssignee,
    creditAssignee,
    dropAssignee,
    setFormDataFromJobCard,
    markFieldSaved,
    markItemSaved,
    markItemRemoved,
    savedForm,
    savedItemFields,
    resetForm,
    descriptionError,
    setDescriptionError,
    // True once a loaded job has edits that haven't reached the job yet — a failed
    // write, a required box left empty, or a part row still waiting on its own
    // create/update/delete. See the header comment on isDirty in
    // tasks/instant-save-job-card.md's Stage 4 section for why this is enough on
    // its own and nothing here invents a parallel "failed" flag to replace it.
    isDirty
  };
}
