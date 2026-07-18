import { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Calendar, ChevronDown } from 'lucide-react';
import CalendarPicker from '../common/CalendarPicker';
import { capitalizeFirst, formatDate } from '../../utils/formatters';
import { api } from '../../services/api';
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from './constants';
import { statusToken } from '../JobCardList.constants';
import { confirmInvoiceAnyway } from './jobCardPrompts';

const PRIORITY_VALUES = ['NONE', 'LOW', 'MEDIUM', 'HIGH'];

export default function JobIdentityStrip({
  isEdit,
  canManage,
  jobCardId,
  jobNumber,
  formData,
  setFormData,
  isOverdue,
  showConfirm,
  onSuccess,
  costingDirty = false,
  saveCosting
}) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const priorityRef = useRef(null);

  useEffect(() => {
    if (!showPriorityMenu) return;
    const onMouse = (e) => {
      if (priorityRef.current && !priorityRef.current.contains(e.target)) {
        setShowPriorityMenu(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setShowPriorityMenu(false);
    };
    document.addEventListener('mousedown', onMouse);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, [showPriorityMenu]);

  const editable = canManage;
  const priority = formData.priority || 'NONE';
  const description = formData.description || '';
  const dueDate = formData.dueDate;
  const status = formData.status || 'OPEN';

  const priorityLabel =
    PRIORITY_OPTIONS.find(p => p.value === priority)?.label || 'Priority';
  const priorityClass = `jc-strip-priority jc-strip-priority-${priority.toLowerCase()}`;
  const formattedDate = formatDate(dueDate, { weekday: 'short', day: 'numeric', month: 'short' });
  const titleText = isEdit ? jobNumber : 'New Job Card';

  const baseStatusOptions = STATUS_OPTIONS.filter(opt => {
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

  const handleStatusChange = async (newStatus) => {
    if (!isEdit || !jobCardId) {
      setField('status', newStatus);
      return;
    }
    if (newStatus === 'INVOICED') {
      // Invoicing files the job away. If the pricing screen has unsaved edits, warn —
      // and if they go ahead, save those edits first so they aren't silently dropped.
      const ok = await showConfirm?.({
        title: 'Mark as Invoiced',
        message: costingDirty
          ? 'This will archive the job card. You have unsaved costing changes — they will be saved and billed. Continue?'
          : 'This will archive the job card. Continue?',
        confirmLabel: 'Archive',
        cancelLabel: 'Cancel',
        confirmVariant: 'danger'
      });
      if (!ok) return;
      if (costingDirty && saveCosting) {
        const saved = await saveCosting();
        if (!saved) {
          // Save already showed why it failed. Don't invoice: doing so would file the
          // job away without the edits the user just made.
          toast.error('Could not save the costing — invoicing cancelled.');
          return;
        }
      }
    }
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
          toast.error(e2.message || 'Failed to update status');
        }
        return;
      }
      toast.error(err.message || 'Failed to update status');
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
                className="jc-strip-priority-trigger"
                onClick={() => setShowPriorityMenu(v => !v)}
                aria-haspopup="listbox"
                aria-expanded={showPriorityMenu}
              >
                <span className="jc-strip-priority-dot" aria-hidden="true" />
                <span className="jc-strip-priority-label">{priorityLabel}</span>
                <ChevronDown size={12} className="jc-strip-priority-caret" />
              </button>
            ) : (
              <span className="jc-strip-priority-static">
                <span className="jc-strip-priority-dot" aria-hidden="true" />
                <span className="jc-strip-priority-label">{priorityLabel}</span>
              </span>
            )}
            {editable && showPriorityMenu && (
              <ul className="jc-strip-priority-menu" role="listbox">
                {PRIORITY_VALUES.map(val => {
                  const opt = PRIORITY_OPTIONS.find(p => p.value === val);
                  return (
                    <li
                      key={val}
                      role="option"
                      aria-selected={priority === val}
                      className={`jc-strip-priority-menu-item jc-strip-priority-menu-item-${val.toLowerCase()}${priority === val ? ' is-active' : ''}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setField('priority', val);
                        setShowPriorityMenu(false);
                      }}
                    >
                      <span className="jc-strip-priority-dot" aria-hidden="true" />
                      {opt?.label || val}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="jc-strip-description">
            {editable ? (
              <input
                type="text"
                className="jc-strip-description-input"
                value={description}
                onChange={(e) => setField('description', e.target.value)}
                onBlur={(e) => {
                  const formatted = capitalizeFirst(e.target.value);
                  if (formatted !== e.target.value) setField('description', formatted);
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
          </div>

          <div className={statusClass}>
            <span className="jc-strip-status-dot" aria-hidden="true" />
            <select
              className="jc-strip-status-select"
              value={status}
              onChange={(e) => handleStatusChange(e.target.value)}
              aria-label="Status"
            >
              {statusOptions.map(opt => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown size={12} className="jc-strip-status-caret" aria-hidden="true" />
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
              onSelect={(dateStr) => setField('dueDate', dateStr)}
              onClose={() => setShowCalendar(false)}
            />
      </div>
    </div>
  );
}
