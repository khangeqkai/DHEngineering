import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { getDefaultFormData, mapLineItemFromApi } from './mappers';

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
// saved, so the stored id coming back would otherwise read as an edit.
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

  // Crediting work to someone puts them on the job server-side. Fold that one worker
  // into the on-screen list so a later Save doesn't send a list without them and undo
  // it — only them, since replacing the whole list would drop unsaved ticks/unticks.
  const creditAssignee = useCallback((workerId, employees = []) => {
    if (!workerId) return;
    setAssignees(prev => prev.some(a => a.userId === workerId) ? prev
      : [...prev, { userId: workerId, userName: employees.find(e => e.id === workerId)?.name || '' }]);
    // The server put them on the job already, so this is not an edit awaiting a Save.
    setSaved(prev => prev
      ? { ...prev, assignees: snapshotAssignees([...JSON.parse(prev.assignees), workerId].map(id => ({ userId: id }))) }
      : prev);
  }, []);

  // A tap discarded as an accident takes its worker back off the job server-side.
  // Same reasoning as above in reverse: the baseline moves with it.
  const dropAssignee = useCallback((workerId) => {
    if (!workerId) return;
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
  // quietly swallow it. markSaved uses this as the new baseline instead of the reply,
  // for the same reason.
  const captureSent = useCallback(() => ({
    form: snapshotForm(liveRef.current.formData),
    assignees: snapshotAssignees(liveRef.current.assignees),
    items: snapshotItems(liveRef.current.lineItems)
  }), []);

  // Called after a save that leaves the job open, with what the reply carried back and
  // what captureSent recorded before the request went out. Two jobs, kept separate on
  // purpose:
  //
  // 1. Adopt the stored ids — a part added on screen carries a temporary id until it is
  //    saved, and logged work is matched to a part by its stored id, so without this the
  //    hours logged from here on would look like work on a part that no longer exists.
  //    The rows themselves are left exactly as they are on screen: only the id moves
  //    across, matched reply-row to screen-row by position. That position match is safe
  //    because the reply is ordered by item_number (job_items query, server-side) and
  //    the on-screen array is already in that same order — items only ever get appended
  //    with the next-highest item_number (addLineItem) and are never reordered — so the
  //    reply's Nth row is always the screen's Nth row, as long as the two lists are the
  //    same rows. They can drift apart while the request is in flight: a blank new row
  //    never reaches the server at all (it's filtered out of what's sent), and a row can
  //    be added or removed on screen before the reply lands. Either way the row count on
  //    screen no longer matches the reply, which is the signal used below — when it
  //    doesn't match, there's no safe position to trust, so fall back to the previous
  //    behaviour of taking the reply wholesale rather than guessing.
  // 2. Move the starting point forward from what was sent (not from the reply — a part
  //    edited on screen while the request was in flight must not be quietly discarded
  //    just because the server's reply carries an older copy of it) so the header stops
  //    reporting unsaved edits.
  const markSaved = useCallback((apiItems, sent) => {
    const mapped = (apiItems || []).map(mapLineItemFromApi);
    const current = liveRef.current.lineItems;
    let items;
    if (mapped.length === 0) {
      items = current;
    } else if (mapped.length === current.length) {
      items = current.map((item, i) => ({ ...item, id: mapped[i].id }));
    } else {
      items = mapped;
    }
    setLineItems(items);
    setSaved({
      form: sent.form,
      assignees: sent.assignees,
      items: sent.items
    });
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
