import { useId, useState } from 'react';
import { capitalizeFirst } from '../../../utils/formatters';
import CheckboxDropdown from '../../common/CheckboxDropdown';
import FieldError from '../../common/FieldError';

// Machines on a time entry are kept as one comma-joined string (e.g. "5, 9") to
// match how the worker's stop-timer form stores them. Split it back into a list
// for the tick-box picker, and join the list back into that string on each change.
function machineListToArray(value) {
  return value ? String(value).split(',').map(s => s.trim()).filter(Boolean) : [];
}

// The admin's add/edit time-entry form. Rendered inline, directly under the line
// item it belongs to, so opening it never yanks the screen away from the button
// the user just clicked.
export default function TimeEntryForm({
  editingTimeEntryId,
  timeEntryForm,
  handleTimeEntryChange,
  employees = [],
  lineItems = [],
  machines = [],
  isCritical = false,
  handleSaveTimeEntry,
  resetTimeEntryForm,
  groupClass = () => 'form-group',
  errorFor = () => null
}) {
  // A double-click here records the block twice, doubling the job's hours.
  // One save at a time: the button greys out until the save finishes.
  const [saving, setSaving] = useState(false);
  // Every box here already carries the name the form state uses; this turns that
  // same name into the id its label points at, so clicking a label lands in its box
  // and a screen reader reads the two together.
  const formId = useId();
  const idFor = (name) => `${formId}-${name}`;
  // Same `${id}-error` shape as useFieldErrors' fieldProps/errorProps, applied here
  // by hand: groupClass/errorFor arrive as plain functions from the caller's own
  // hook instance, not the hook object itself, so there's no fieldProps to spread.
  const errorIdFor = (name) => `${idFor(name)}-error`;
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await handleSaveTimeEntry();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="time-entry-form costing-entry-form">
      <div className="form-section-header">
        <h3 className="form-section-title">
          {editingTimeEntryId ? 'Edit Time Entry' : 'New Time Entry'}
        </h3>
        <button type="button" className="btn btn-secondary btn-sm" onClick={resetTimeEntryForm} disabled={saving}>
          Cancel
        </button>
      </div>

      <div className={groupClass('workerId')}>
        <label htmlFor={idFor('workerId')}>Worker <span className="required">*</span></label>
        <select
          id={idFor('workerId')}
          name="workerId"
          value={timeEntryForm.workerId}
          onChange={handleTimeEntryChange}
          aria-invalid={errorFor('workerId') ? true : undefined}
          aria-describedby={errorFor('workerId') ? errorIdFor('workerId') : undefined}
        >
          <option value="">Select worker...</option>
          {employees.map(u => (
            <option key={u.id} value={u.id}>{u.name || u.username}</option>
          ))}
        </select>
        <FieldError id={errorIdFor('workerId')} message={errorFor('workerId')} />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor={idFor('itemId')}>Part</label>
          {/* Identifies the part to the server by its permanent id — never its
              item_number, which is only a sort order and may have gaps. The
              number shown here is the row's position in this same list, so it
              always matches the badge on the part's own card. */}
          <select id={idFor('itemId')} name="itemId" value={timeEntryForm.itemId} onChange={handleTimeEntryChange}>
            <option value="">Select part…</option>
            {lineItems.map((item, idx) => (
              <option key={item.id} value={item.id}>
                #{item.position != null ? item.position : idx + 1} - {item.description?.substring(0, 30)}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Machines</label>
          <CheckboxDropdown
            ariaLabel="Machines used"
            placeholder="Select machines..."
            options={machines.map(m => ({
              value: String(m.machineNumber),
              label: String(m.machineNumber),
              sublabel: m.name || undefined
            }))}
            selectedValues={machineListToArray(timeEntryForm.machineNumber)}
            onToggle={(value) => {
              const current = machineListToArray(timeEntryForm.machineNumber);
              const next = current.includes(value)
                ? current.filter(v => v !== value)
                : [...current, value];
              handleTimeEntryChange({ target: { name: 'machineNumber', value: next.join(', ') } });
            }}
          />
        </div>
        <div className="form-group">
          <label htmlFor={idFor('qty')}>Qty</label>
          <input id={idFor('qty')} type="text" inputMode="numeric" name="qty" value={timeEntryForm.qty} onChange={handleTimeEntryChange} />
        </div>
        <div className="form-group">
          <label htmlFor={idFor('scrapBinQty')}>Scrap — Bin</label>
          <input id={idFor('scrapBinQty')} type="text" inputMode="numeric" name="scrapBinQty" value={timeEntryForm.scrapBinQty} onChange={handleTimeEntryChange} />
        </div>
        <div className="form-group">
          <label htmlFor={idFor('scrapRecycleQty')}>Scrap — Recycle</label>
          <input id={idFor('scrapRecycleQty')} type="text" inputMode="numeric" name="scrapRecycleQty" value={timeEntryForm.scrapRecycleQty} onChange={handleTimeEntryChange} />
        </div>
      </div>

      {isCritical && (
        <div className="form-group te-inspection-admin">
          <label>Critical Job — Inspection Checks</label>
          <div className="te-inspection-grid">
            {[
              { field: 'firstOffInspection', label: 'First-Off Inspection' },
              { field: 'inProcessValidation', label: 'In-Process Validation' },
              { field: 'measuringEquipmentVerification', label: 'Measuring Equipment Verification' },
              { field: 'equipmentChecks', label: 'Equipment Checks' }
            ].map(({ field, label }) => (
              <div key={field} className="te-inspection-item">
                <span className="te-inspection-name">{label}</span>
                <div className="te-yesno" role="group" aria-label={label}>
                  <button
                    type="button"
                    className={`te-yesno-btn${timeEntryForm[field] === true ? ' is-yes' : ''}`}
                    aria-pressed={timeEntryForm[field] === true}
                    onClick={() => handleTimeEntryChange({ target: { name: field, value: true } })}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    className={`te-yesno-btn${timeEntryForm[field] === false ? ' is-no' : ''}`}
                    aria-pressed={timeEntryForm[field] === false}
                    onClick={() => handleTimeEntryChange({ target: { name: field, value: false } })}
                  >
                    No
                  </button>
                </div>
              </div>
            ))}
          </div>
          <input
            type="text"
            name="equipmentChecksComments"
            placeholder="Equipment checks comments (optional)"
            value={timeEntryForm.equipmentChecksComments}
            onChange={handleTimeEntryChange}
          />
        </div>
      )}

      <div className="form-group">
        <label htmlFor={idFor('description')}>Description</label>
        <input
          id={idFor('description')}
          type="text"
          name="description"
          value={timeEntryForm.description}
          onChange={handleTimeEntryChange}
          onBlur={(e) => {
            const formatted = capitalizeFirst(e.target.value);
            if (formatted !== e.target.value) {
              handleTimeEntryChange({ target: { name: 'description', value: formatted } });
            }
          }}
        />
      </div>

      <div className="form-row">
        <div className={groupClass('startTime')}>
          <label htmlFor={idFor('startTime')}>Start Time</label>
          <input
            id={idFor('startTime')}
            type="datetime-local"
            name="startTime"
            value={timeEntryForm.startTime}
            onChange={handleTimeEntryChange}
            aria-invalid={errorFor('startTime') ? true : undefined}
            aria-describedby={errorFor('startTime') ? errorIdFor('startTime') : undefined}
          />
          <FieldError id={errorIdFor('startTime')} message={errorFor('startTime')} />
        </div>
        <div className={groupClass('endTime')}>
          <label htmlFor={idFor('endTime')}>End Time</label>
          <input
            id={idFor('endTime')}
            type="datetime-local"
            name="endTime"
            value={timeEntryForm.endTime}
            onChange={handleTimeEntryChange}
            aria-invalid={errorFor('endTime') ? true : undefined}
            aria-describedby={errorFor('endTime') ? errorIdFor('endTime') : undefined}
          />
          <FieldError id={errorIdFor('endTime')} message={errorFor('endTime')} />
        </div>
      </div>

      <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : editingTimeEntryId ? 'Update Entry' : 'Save Entry'}
      </button>
    </div>
  );
}
