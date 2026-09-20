import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { getDefaultFormData, mapLineItemFromApi } from './mappers';
import { isSavedLineItem } from './jobCardValidation.mjs';

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
const pristineSaved = () => ({
  form: snapshotForm(getDefaultFormData()),
  assignees: snapshotAssignees([]),
  items: snapshotItems([makeEmptyLineItem(1)])
});

/**
 * Custom hook for job card form state management
 * Handles form data, line items, and assignees
 */
export function useJobCardForm() {
  // Core form data
  const [formData, setFormData] = useState(getDefaultFormData());
  const [jobNumber, setJobNumber] = useState('');

  // Related data (locally managed for create mode, from API for edit mode)
  const [assignees, setAssignees] = useState([]);
  const [lineItems, setLineItems] = useState([makeEmptyLineItem(1)]);

  // Starts at the pristine baseline (not null) so an untouched brand-new card reports
  // clean, but typing into it makes isDirty true right away — a null baseline made
  // isDirty permanently false until the first Save, which is exactly the card
  // handleRequestClose most needs to protect. loadJobCard/setFormDataFromJobCard
  // below replaces this with the loaded job's own snapshot once a job is loaded.
  const [saved, setSaved] = useState(pristineSaved);
  const liveRef = useRef({ formData, assignees, lineItems });
  useEffect(() => {
    liveRef.current = { formData, assignees, lineItems };
  }, [formData, assignees, lineItems]);
  // Assigned during render rather than in an effect, so the two handlers below always
  // compare against the baseline as it stands right now, not one commit behind.
  const savedRef = useRef(saved);
  savedRef.current = saved;

  const isDirty = useMemo(() => {
    return snapshotForm(formData) !== saved.form
      || snapshotAssignees(assignees) !== saved.assignees
      || snapshotItems(lineItems) !== saved.items;
  }, [saved, formData, assignees, lineItems]);

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
  const toggleAssignee = useCallback((employee) => {
    setAssignees(prev => {
      const exists = prev.find(a => a.userId === employee.id);
      if (exists) {
        return prev.filter(a => a.userId !== employee.id);
      } else {
        return [...prev, { userId: employee.id, userName: employee.name || employee.username }];
      }
    });
  }, []);

  // Has the user made an unsaved change about THIS worker — ticked them on, or unticked
  // them — that no Save has sent yet? Compared one worker at a time, because the two
  // handlers below are each about one worker and must not read a change to somebody else
  // as a reason to back off.
  const hasPendingChangeFor = (workerId) => {
    const inBaseline = JSON.parse(savedRef.current.assignees).includes(workerId);
    const onScreen = liveRef.current.assignees.some(a => a.userId === workerId);
    return inBaseline !== onScreen;
  };

  // Crediting work to someone puts them on the job server-side. Fold that one worker
  // into the on-screen list so a later Save doesn't send a list without them and undo
  // it — only them, since replacing the whole list would drop unsaved ticks/unticks.
  //
  // Unless the user has already decided otherwise about this same worker: a manager who
  // unticks someone and hasn't saved it yet has made a deliberate choice, and putting
  // that person straight back — and calling the card saved while doing it — threw the
  // choice away without a word. When the two disagree the user wins and the card stays
  // marked unsaved, so the decision is theirs to keep or undo.
  const creditAssignee = useCallback((workerId, employees = []) => {
    if (!workerId || hasPendingChangeFor(workerId)) return;
    setAssignees(prev => prev.some(a => a.userId === workerId) ? prev
      : [...prev, { userId: workerId, userName: employees.find(e => e.id === workerId)?.name || '' }]);
    // The server put them on the job already, so this is not an edit awaiting a Save.
    // Unless a Save is in flight, which carries a people list built before this and will
    // take them straight back off — markSaved measures against that list and hands the
    // worker back as an unsaved edit when the reply lands.
    setSaved(prev => prev
      ? { ...prev, assignees: snapshotAssignees([...JSON.parse(prev.assignees), workerId].map(id => ({ userId: id }))) }
      : prev);
  }, []);

  // A tap discarded as an accident takes its worker back off the job server-side.
  // Same reasoning as above in reverse, including standing aside for an unsaved tick
  // the user has made about this same worker.
  const dropAssignee = useCallback((workerId) => {
    if (!workerId || hasPendingChangeFor(workerId)) return;
    setAssignees(prev => prev.filter(a => a.userId !== workerId));
    setSaved(prev => prev
      ? { ...prev, assignees: snapshotAssignees(JSON.parse(prev.assignees).filter(id => id !== workerId).map(id => ({ userId: id }))) }
      : prev);
  }, []);

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
    // header's unsaved-edits mark is measured against.
    setSaved({
      form: snapshotForm(loadedForm),
      assignees: snapshotAssignees(loadedAssignees),
      items: snapshotItems(loadedItems)
    });
  }, []);

  // Take a copy of what is about to be sent — form, assignees and parts alike.
  // Nothing on screen is locked while a save is in flight, so anything typed in the
  // meantime has to stay marked unsaved — measuring against what came back would
  // quietly swallow it. The form/assignees baseline in markSaved is taken straight
  // from the string snapshots below; the line items are handled differently there
  // (see markSaved) because merging in the reply's ids and numbers means matching
  // rows first, which needs the raw, un-stringified rows as they stood at send time.
  const captureSent = useCallback(() => {
    return {
      form: snapshotForm(liveRef.current.formData),
      assignees: snapshotAssignees(liveRef.current.assignees),
      items: snapshotItems(liveRef.current.lineItems),
      // The actual rows (with ids) as they stood at send time. Used only by markSaved,
      // to work out which reply row belongs to which on-screen row.
      sentLineItems: liveRef.current.lineItems
    };
  }, []);

  // Called after a save that leaves the job open, with what the reply carried back and
  // what captureSent recorded before the request went out. Two jobs, kept separate on
  // purpose:
  //
  // 1. Adopt the stored ids and numbers onto the screen — a part added on screen carries
  //    a temporary id until it is saved, and logged work is matched to a part by its
  //    stored id and number, so without this the hours logged from here on could land on
  //    the wrong part, or on one that no longer exists. The rows themselves come from
  //    React's own current state (a functional update), not from a ref that is a beat
  //    behind: only the id and itemNumber move across, so an edit made while the request
  //    was in flight is never quietly overwritten by the reply's older copy of that row.
  //
  //    Reply rows are matched to sent rows by id, not by position: a row that already
  //    had a stored id (isSavedLineItem) keeps that same id across the save (the server
  //    only ever reassigns numbers on kept rows), so the reply row carrying that id is
  //    unambiguously its match. A row that had no stored id when it was sent — a newly
  //    added part — can't be matched this way, because the server mints its id fresh;
  //    for those, the reply is ordered by stored number and new rows are always appended
  //    last (addLineItem), so pairing the leftover new sent-rows with the leftover reply
  //    rows in that same order is the best available match, not a guaranteed one.
  //    Once a sent row is matched to a reply row, that match is applied to whichever
  //    on-screen row carries the same id the sent row had — the row that was actually
  //    sent, even if it was edited, added or removed on screen since. A row added to the
  //    screen after the request went out was never sent and has nothing to match against,
  //    so it's left with its temporary id, waiting for the next save.
  //
  //    If a sent row carried a stored id and NO reply row comes back with that same id,
  //    while the reply is non-empty, someone else deleted that part from the server while
  //    this job was open — the server then recreated the row under a fresh id, which would
  //    otherwise fall through to the "new part" matching above and hand it to the wrong
  //    sent row. Rather than guess, the parts are taken wholesale from the reply and the
  //    caller is told (see the return value below) so it can say what happened. Only the
  //    parts: the job's own fields and its people were never in doubt, so they keep what
  //    is on screen, including anything typed while the request was in flight.
  //
  // 2. Move the starting point forward. The form and assignees baseline still comes from
  //    `sent`, not the reply — nothing on screen is locked mid-save, so anything typed or
  //    ticked while the request was travelling must stay marked unsaved. The line-item
  //    baseline is built from those same sent rows too (with each matched reply row's id
  //    and itemNumber folded in), never from the rows on screen when the reply lands —
  //    the screen can carry edits, additions or removals made after the request went out,
  //    and none of those are saved yet, so a baseline built from the screen would wrongly
  //    call them clean.
  const markSaved = useCallback((apiItems, sent) => {
    const reply = (apiItems || []).map(mapLineItemFromApi);
    const sentItems = sent.sentLineItems || [];

    // Reply rows already claimed by a sent row that carried a stored id.
    const claimedReplyIds = new Set(
      sentItems.filter(isSavedLineItem).map(item => item.id)
    );
    // What's left over, in reply order, is for the new rows — order-matched below.
    const leftoverReply = reply.filter(row => !claimedReplyIds.has(row.id));
    let leftoverIdx = 0;

    // sent-row local id -> the reply row that belongs to it.
    const matchForSentId = new Map();
    // A sent row that carried a stored id but has no reply row carrying that id,
    // even though the reply carried rows — see the comment above markSaved.
    let conflict = false;
    for (const sentItem of sentItems) {
      if (isSavedLineItem(sentItem)) {
        const match = reply.find(row => row.id === sentItem.id);
        if (match) {
          matchForSentId.set(sentItem.id, match);
        } else if (reply.length > 0) {
          conflict = true;
        }
      } else {
        const match = leftoverReply[leftoverIdx++];
        if (match) matchForSentId.set(sentItem.id, match);
      }
    }

    // The people baseline is exactly what was sent, because a save hands over a whole
    // list and the server throws its own away and stores that list verbatim. So anything
    // the server had done to the list while the request was travelling — crediting the
    // worker on a timer started mid-save, taking back a discarded run — is undone the
    // moment this save lands. Those workers are still on screen, and measuring against
    // what was sent is what leaves them marked unsaved, so the next Save puts them back.
    // Folding them into the baseline instead showed them assigned while calling the card
    // saved, and the server no longer had them on the job at all.
    const assigneesSnapshot = sent.assignees;

    if (conflict) {
      // Only the parts are in doubt, so only the parts are replaced. The reply's rows go
      // straight onto the screen — that is the whole point, since guessing which row is
      // which risks logging later work against the wrong part — but the job's own fields
      // and its people are left exactly as they are. They were never ambiguous, and
      // anything typed into them while the request was travelling is unsaved work that
      // reloading the server's copy over the top would destroy without asking. The form
      // and people baselines still move forward from what was sent, because that much
      // really did save. (`reply` is never empty here: an empty reply can't raise this.)
      setLineItems(reply);
      setSaved({
        form: sent.form,
        assignees: assigneesSnapshot,
        items: snapshotItems(reply)
      });
      return { conflict: true };
    }

    const savedItems = reply.length === 0
      ? sentItems
      : sentItems.map(item => {
        const match = matchForSentId.get(item.id);
        return match ? { ...item, id: match.id, itemNumber: match.itemNumber } : item;
      });

    setLineItems(prev => reply.length === 0 ? prev : prev.map(item => {
      const match = matchForSentId.get(item.id);
      return match ? { ...item, id: match.id, itemNumber: match.itemNumber } : item;
    }));
    setSaved({
      form: sent.form,
      assignees: assigneesSnapshot,
      items: snapshotItems(savedItems)
    });
    return { conflict: false };
  }, []);

  const resetForm = useCallback(() => {
    setFormData(getDefaultFormData());
    setJobNumber('');
    setAssignees([]);
    setLineItems([makeEmptyLineItem(1)]);
    // Back to the pristine baseline, same as the hook's own initial state, so a
    // second new card starts clean exactly like the first one did.
    setSaved(pristineSaved());
  }, []);

  return {
    // Form state
    formData,
    setFormData,
    jobNumber,
    setJobNumber,
    // Related data
    assignees,
    lineItems,
    // Handlers
    handleChange,
    addLineItem,
    updateLineItem,
    removeLineItem,
    toggleAssignee,
    creditAssignee,
    dropAssignee,
    setFormDataFromJobCard,
    captureSent,
    markSaved,
    resetForm,
    // True once a loaded job has edits that no Save has sent yet.
    isDirty
  };
}
