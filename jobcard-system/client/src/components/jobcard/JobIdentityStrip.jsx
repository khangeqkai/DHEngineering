import { useState, useRef, useEffect, useCallback, useId } from 'react';
import toast from 'react-hot-toast';
import { Calendar, ChevronDown } from 'lucide-react';
import CalendarPicker from '../common/CalendarPicker';
import { pushModal, removeModal, isTopModal } from '../common/modalStack';
import { capitalizeFirst, formatDate } from '../../utils/formatters';
import { api } from '../../services/api';
import { PRIORITY_OPTIONS, STATUS_OPTIONS, canChangeStatus, getSettableStatusValues } from './constants';
import { statusToken, priorityToken } from '../JobCardList.constants';
import { confirmInvoiceAnyway } from './jobCardPrompts';
import { summarizeFieldStates, INSTANT_SAVE_STATUS_TEXT } from './useInstantSave';
import { jobFieldMessage } from './fieldRules.mjs';
import FieldError from '../common/FieldError';

const PRIORITY_VALUES = PRIORITY_OPTIONS.map(p => p.value);

export default function JobIdentityStrip({
  isEdit,
  canManage,
  jobCardId,
  jobNumber,
  formData,
  setFormData,
  savedForm = {},
  saveField,
  fieldStates = {},
  isOverdue,
  showConfirm,
  onSuccess,
  costingDirty = false,
  canSeeTotal = false,
  saveCosting,
  fetchCurrentTotal,
  descriptionError = null,
  setDescriptionError,
  whenPartSavesSettled
}) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  // True for the whole of a status change, not just the total fetch in the middle of one.
  // Invoicing sends any unsaved pricing FIRST, and that send is slow enough that a second
  // pick could land during it and start a second invoicing, with two questions stacked on
  // top of each other. The status control is disabled while this is true.
  const [statusBusy, setStatusBusy] = useState(false);
  const priorityRef = useRef(null);
  const priorityTriggerRef = useRef(null);
  const priorityMenuRef = useRef(null);
  const priorityMenuId = useId();

  // Closing the menu always hands the keyboard back to the button that opened it —
  // otherwise Escape (or a pick) drops focus onto the document body and the next Tab
  // restarts from the top of the dialog.
  const closePriorityMenu = useCallback(({ refocus = true } = {}) => {
    setShowPriorityMenu(false);
    if (refocus) priorityTriggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!showPriorityMenu) return;
    // Join the shared modal stack while open: this menu sits on top of the job
    // card dialog, and registering as the top layer keeps that dialog's
    // Escape-to-close (and Tab trap) from firing while the menu is open.
    pushModal(priorityMenuId);
    const onMouse = (e) => {
      if (priorityRef.current && !priorityRef.current.contains(e.target)) {
        // A click elsewhere has already chosen where focus goes; taking it back to
        // the trigger would yank it out of whatever was just clicked.
        closePriorityMenu({ refocus: false });
      }
    };
    const onKey = (e) => {
      if (!isTopModal(priorityMenuId)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closePriorityMenu();
      }
    };
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    return () => {
      removeModal(priorityMenuId);
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, [showPriorityMenu, priorityMenuId, closePriorityMenu]);

  // Opening the menu puts the keyboard on the priority the job already has, so the
  // arrow keys start from where the job actually is rather than from the top of the list.
  useEffect(() => {
    if (!showPriorityMenu) return;
    const menu = priorityMenuRef.current;
    if (!menu) return;
    const items = Array.from(menu.querySelectorAll('[role="menuitemradio"]'));
    (items.find(el => el.getAttribute('aria-checked') === 'true') || items[0])?.focus();
  }, [showPriorityMenu]);

  // Up/Down walk the list, Home/End jump to its ends — the behaviour every other
  // menu in the app gets from the browser and this one has to state for itself.
  const handlePriorityMenuKeyDown = (e) => {
    const menu = priorityMenuRef.current;
    if (!menu) return;
    const items = Array.from(menu.querySelectorAll('[role="menuitemradio"]'));
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement);
    let next = null;
    if (e.key === 'ArrowDown') next = current < items.length - 1 ? current + 1 : 0;
    else if (e.key === 'ArrowUp') next = current > 0 ? current - 1 : items.length - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next === null) return;
    e.preventDefault();
    items[next].focus();
  };

  const editable = canManage;
  const priority = formData.priority || 'NONE';
  const description = formData.description || '';
  // A job must have a description. With no Save button to refuse, clearing the box
  // is marked on the field and simply not sent — the stored description stands
  // until a valid one is typed, so a cleared box can never destroy it. The server
  // doesn't check this field on an update, so without this the empty value would
  // save silently. Marking the field rather than firing a toast is the house rule
  // for a check that belongs to a named field, and the two must never both fire.
  // Lifted up into useJobCardForm.js (rather than local state here) so the close
  // question can name it — see the comment there.
  const dueDate = formData.dueDate;
  const status = formData.status || 'OPEN';

  const priorityLabel =
    PRIORITY_OPTIONS.find(p => p.value === priority)?.label || 'Priority';
  const priorityClass = `jc-strip-priority jc-strip-priority-${priorityToken(priority)}`;
  // The year is left out for a due date in the current year (the common case) and
  // shown for any other — a bare "Fri, 25 Dec" left every date before or after this
  // year looking like it belonged to it.
  const dueDateYear = dueDate ? dueDate.slice(0, 4) : null;
  const currentYear = String(new Date().getFullYear());
  const formattedDate = formatDate(dueDate, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(dueDateYear && dueDateYear !== currentYear ? { year: 'numeric' } : {})
  });
  const titleText = isEdit ? jobNumber : 'New Job Card';

  // A non-management user only gets to pick among the statuses the server allows
  // them to set, plus whatever the job currently sits on. When the job has already
  // moved past the point where they may touch it at all, the control is locked —
  // office statuses stay with management.
  const statusChangeable = canChangeStatus(canManage, status);
  const settableStatusValues = getSettableStatusValues(canManage, status);
  const baseStatusOptions = STATUS_OPTIONS.filter(opt => {
    if (settableStatusValues && !settableStatusValues.has(opt.value)) return false;
    if (opt.value !== 'INVOICED') return true;
    // Invoicing files a job away and runs the missing-files check + auto-archive,
    // which only happen on an existing job. Never offer it while creating a new
    // job (and never to non-management).
    return isEdit && canManage;
  });
  const statusOptions = baseStatusOptions.some(o => o.value === status)
    ? baseStatusOptions
    : [
        ...baseStatusOptions,
        {
          ...(STATUS_OPTIONS.find(o => o.value === status) || { value: status, label: status }),
          disabled: true
        }
      ];
  const statusClass = `jc-strip-status status-${statusToken(status)}`;

  const setField = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  // An existing job writes each of these fields the moment it changes; a brand-new
  // job has nothing to write to yet, so the change stays purely on screen and
  // travels in the create payload instead — same seam runStatusChange below uses.
  const canWriteInstantly = isEdit && Boolean(jobCardId);
  // baseline is what the server last confirmed storing for this field. The screen
  // always takes the new value regardless, but the write is only sent when it
  // actually differs from what's stored — comparing against the on-screen value
  // instead would mean a failed write can never be retried by re-picking the same
  // value, since the screen already shows it. Same reasoning as the description
  // box's own `formatted !== (savedForm.description ?? '')` check below.
  // saveField itself decides whether that comparison means "send it" or, if a
  // prior attempt at some other value is sitting there failed, just "drop that
  // stale mark" (defect C, root-causes.md) — so this always calls it and hands
  // the baseline along rather than skipping the call itself.
  const setFieldInstant = (field, value, baseline) => {
    setField(field, value);
    if (canWriteInstantly) saveField(field, value, { baseline });
  };

  // One combined status for the whole strip rather than one per field — an aria-live
  // region announcing three separate lines for one tab-through would be unusable.
  const identityStatus = summarizeFieldStates(fieldStates, ['priority', 'dueDate', 'description']);

  const runStatusChange = async (newStatus) => {
    if (!isEdit || !jobCardId) {
      setField('status', newStatus);
      return;
    }
    if (newStatus === 'INVOICED') {
      // Invoicing files the job away, so the figure in this question has to be the figure
      // that actually gets billed. Unsaved pricing edits are therefore sent FIRST, before
      // the question is asked, rather than after it is answered. The on-screen total can't
      // stand in for them: the server recalculates from the job's own rules and folds in
      // every minute logged since the pricing screen loaded, so what it stores is often a
      // different number from what the boxes add up to. Saving first means the total below
      // is read back from the server after the recalculation — the real one. Nothing is
      // given away by saving first: this sheet has no Save button and files itself a second
      // after the last keystroke anyway, so these edits were already on their way. Backing
      // out of the question still leaves the job un-invoiced.
      if (costingDirty && saveCosting) {
        const saved = await saveCosting();
        if (!saved) {
          // The save already said why it failed. Don't go on to ask about invoicing: the
          // total would be wrong and the job would be filed away without these edits.
          toast.error('Could not save the costing — invoicing cancelled.');
          return;
        }
      }
      const baseMessage = costingDirty
        ? 'This will archive the job card. Your costing changes have been saved and will be billed. Continue?'
        : 'This will archive the job card. Continue?';
      // The total is always asked of the server, never taken from the boxes on screen: the
      // server works it out afresh from the job's own rules every time it is asked, so it
      // carries every minute logged since this screen loaded, which the boxes do not.
      // A manager, or an admin who can't see a total, gets the plain message with no total
      // line and no fetch. A failed fetch falls back to the plain message too: never show
      // a total that might be wrong.
      let freshTotal = null;
      if (canSeeTotal && fetchCurrentTotal) {
        const toastId = toast.loading('Getting the current total…');
        try {
          const fetched = await fetchCurrentTotal();
          if (typeof fetched === 'number') freshTotal = fetched;
        } catch {
          freshTotal = null;
        } finally {
          toast.dismiss(toastId);
        }
      }
      // No shared money formatter exists in utils/formatters.js, and that file is out of
      // scope for this change, so this mirrors CostingTab.jsx's `money()` (en-AU, two
      // decimals) inline rather than adding a second maintained copy of it.
      const message = typeof freshTotal === 'number'
        ? <>{baseMessage}<br />Total: ${freshTotal.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
        : baseMessage;
      const ok = await showConfirm?.({
        title: 'Mark as Invoiced',
        message,
        confirmLabel: 'Archive',
        cancelLabel: 'Cancel',
        confirmVariant: 'danger'
      });
      if (!ok) return;
    }
    // A part save already in flight (or queued behind one) must land BEFORE this
    // status write is sent — its reply can carry its own jobStatus (see
    // useInstantItems.js's applyItemReply) and, unguarded, a slow one of those could
    // still arrive after this and stomp the status the user just picked by hand back
    // to whatever the part write computed. Waiting here, not there, is what actually
    // closes that race. Never rejects, so a part save failing doesn't block the
    // status change — see useSaveQueue.js's whenSettled. statusBusy (set by the
    // caller before runStatusChange is called) stays held across the wait.
    await whenPartSavesSettled?.();
    const applyLocally = () => {
      setField('status', newStatus);
      onSuccess?.();
      toast.success('Status updated');
    };
    try {
      await api.updateJobcardStatus(jobCardId, newStatus);
      applyLocally();
    } catch (err) {
      // Invoicing with declared-but-missing files: confirm, then resend.
      if (err.status === 409 && err.data?.attachmentWarnings) {
        const proceed = await confirmInvoiceAnyway(err.data.attachmentWarnings, showConfirm);
        if (!proceed) return;
        try {
          await api.updateJobcardStatus(jobCardId, newStatus, true);
          applyLocally();
        } catch (e2) {
          toast.error(e2.message || 'Failed to update status', { id: 'status-update-failed' });
        }
        return;
      }
      toast.error(err.message || 'Failed to update status', { id: 'status-update-failed' });
    }
  };

  // Everything above runs behind one lock, held from the first moment of the change to
  // the last, so a second pick made while the first is still working is simply ignored.
  const handleStatusChange = async (newStatus) => {
    if (statusBusy) return;
    setStatusBusy(true);
    try {
      await runStatusChange(newStatus);
    } finally {
      setStatusBusy(false);
    }
  };

  return (
    <div className="jc-identity-strip" role="group" aria-label="Job card identity">
      <span id="modal-title" className="jc-strip-jobnumber">{titleText}</span>

      <div className="jc-strip-divider" aria-hidden="true" />

      <div className={priorityClass} ref={priorityRef}>
            {editable ? (
              <button
                type="button"
                ref={priorityTriggerRef}
                className="jc-strip-priority-trigger"
                onClick={() => (showPriorityMenu ? closePriorityMenu() : setShowPriorityMenu(true))}
                aria-haspopup="menu"
                aria-expanded={showPriorityMenu}
                aria-label={`Priority: ${priorityLabel}`}
              >
                <span className="jc-strip-priority-dot" aria-hidden="true" />
                <span className="jc-strip-priority-label">{priorityLabel}</span>
                <ChevronDown size={14} className="jc-strip-priority-caret" />
              </button>
            ) : (
              <span className="jc-strip-priority-static">
                <span className="jc-strip-priority-dot" aria-hidden="true" />
                <span className="jc-strip-priority-label">{priorityLabel}</span>
              </span>
            )}
            {editable && showPriorityMenu && (
              <ul
                className="jc-strip-priority-menu"
                role="menu"
                ref={priorityMenuRef}
                aria-label="Priority"
                onKeyDown={handlePriorityMenuKeyDown}
              >
                {PRIORITY_VALUES.map(val => {
                  const opt = PRIORITY_OPTIONS.find(p => p.value === val);
                  return (
                    <li key={val} role="none">
                      {/* A real button, not a clickable row: this menu is reached and
                          worked entirely from the keyboard, and only a button answers
                          Enter and Space on its own. */}
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={priority === val}
                        className={`jc-strip-priority-menu-item jc-strip-priority-menu-item-${priorityToken(val)}${priority === val ? ' is-active' : ''}`}
                        onClick={() => {
                          setFieldInstant('priority', val, savedForm.priority ?? 'NONE');
                          closePriorityMenu();
                        }}
                      >
                        <span className="jc-strip-priority-dot" aria-hidden="true" />
                        {opt?.label || val}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className={descriptionError ? 'jc-strip-description field-error' : 'jc-strip-description'}>
            {editable ? (
              <input
                id="jc-description"
                type="text"
                className="jc-strip-description-input"
                // Hand-wired rather than useFieldErrors' fieldProps/errorProps: this
                // field's error lives in useJobCardForm.js (outside this component),
                // which only ever hands the strip the bare message, not a hook
                // instance to draw the wiring from. Same id-naming shape as the hook
                // (`${id}-error`) so a field that tabs away and back still gets told
                // why it failed.
                aria-invalid={descriptionError ? true : undefined}
                aria-describedby={descriptionError ? 'jc-description-error' : undefined}
                value={description}
                onChange={(e) => {
                  setField('description', e.target.value);
                  if (descriptionError && e.target.value.trim()) setDescriptionError(null);
                }}
                onBlur={(e) => {
                  // The tidy-up and the write are one action: capitalizeFirst runs
                  // first, and the tidied value — not what was actually typed — is
                  // what gets sent.
                  const formatted = capitalizeFirst(e.target.value);
                  if (formatted !== e.target.value) setField('description', formatted);
                  // A brand-new job has no instant write to hold back — Create still
                  // runs the whole-form check, and that pop-up is the only thing
                  // that should complain about this box. Marking it here too would
                  // fire both signals for the one mistake (CLAUDE.md house rule), so
                  // the mark is gated on there being a write to hold back at all.
                  if (!canWriteInstantly) return;
                  const message = jobFieldMessage('description', formatted);
                  if (message) {
                    // Emptied: mark the field, send nothing, leave the stored
                    // description alone. Typing a real one clears the mark above.
                    setDescriptionError(message);
                    return;
                  }
                  setDescriptionError(null);
                  // Always calls saveField, even when nothing changed — see its
                  // own baseline comment (useInstantSave.js): that's what lets it
                  // drop a stale failure left over from reverting the box back to
                  // what's already stored, instead of only skipping the write.
                  saveField('description', formatted, { baseline: savedForm.description ?? '' });
                }}
                placeholder="Describe the work…"
                aria-label="Job description"
                title={description}
              />
            ) : (
              <span
                className="jc-strip-description-static"
                title={description}
              >
                {description || '—'}
              </span>
            )}
            <FieldError id="jc-description-error" message={descriptionError} />
          </div>

          <div
            className={statusClass}
            title={!statusChangeable ? 'Only management can change this status' : undefined}
          >
            <span className="jc-strip-status-dot" aria-hidden="true" />
            <select
              className="jc-strip-status-select"
              value={status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={statusBusy || !statusChangeable}
              aria-label="Status"
            >
              {statusOptions.map(opt => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="jc-strip-status-caret" aria-hidden="true" />
          </div>

          <div className={`jc-strip-duedate${isOverdue ? ' is-overdue' : ''}`}>
            {editable ? (
              <button
                type="button"
                className="jc-strip-duedate-trigger"
                onClick={() => setShowCalendar(true)}
              >
                <Calendar size={14} className="jc-strip-duedate-icon" />
                <span className="jc-strip-duedate-value">
                  {formattedDate || 'Set due date'}
                </span>
                {isOverdue && <span className="jc-strip-duedate-flag">OVERDUE</span>}
              </button>
            ) : (
              <span className="jc-strip-duedate-static">
                <Calendar size={14} className="jc-strip-duedate-icon" />
                <span className="jc-strip-duedate-value">
                  {formattedDate || 'No due date'}
                </span>
                {isOverdue && <span className="jc-strip-duedate-flag">OVERDUE</span>}
              </span>
            )}
            <CalendarPicker
              isOpen={showCalendar}
              value={dueDate}
              onSelect={(dateStr) => setFieldInstant('dueDate', dateStr, savedForm.dueDate ?? '')}
              onClose={() => setShowCalendar(false)}
              // The due date is optional — unlike the public holidays list
              // (the picker's other caller), where a blank entry makes no sense.
              allowClear
            />
      </div>

      {/* Only a failure gets words here. "Saving…" and "Saved" are now the window
          frame's job (amber, then green — see .modal-unsaved / .modal-saved in
          App.css), because this bar already carries the job number, priority,
          description, status and due date and a sixth thing in it stopped being
          read. A failure is the one state that has to name itself: the frame
          simply stays amber, which on its own doesn't say anything is wrong. */}
      {identityStatus === 'failed' && (
        <span className="instant-save-status instant-save-status--failed">
          {INSTANT_SAVE_STATUS_TEXT.failed}
        </span>
      )}
      {/* A colour says nothing to a screen reader, so the words the strip no longer
          shows are still announced here, unseen — same shape as before. */}
      <span className="sr-only" role="status" aria-live="polite">
        {identityStatus === 'idle' ? '' : INSTANT_SAVE_STATUS_TEXT[identityStatus]}
      </span>
    </div>
  );
}
