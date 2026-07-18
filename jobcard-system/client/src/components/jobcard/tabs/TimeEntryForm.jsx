import { capitalizeFirst } from '../../../utils/formatters';
import CheckboxDropdown from '../../common/CheckboxDropdown';

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
  resetTimeEntryForm
}) {
  return (
    <div className="time-entry-form costing-entry-form">
      <div className="form-section-header">
        <h3 className="form-section-title">
          {editingTimeEntryId ? 'Edit Time Entry' : 'New Time Entry'}
        </h3>
        <button type="button" className="btn btn-secondary btn-sm" onClick={resetTimeEntryForm}>
          Cancel
        </button>
      </div>

      <div className="form-group">
        <label>Worker <span className="required">*</span></label>
        <select name="workerId" value={timeEntryForm.workerId} onChange={handleTimeEntryChange}>
          <option value="">Select worker...</option>
          {employees.map(u => (
            <option key={u.id} value={u.id}>{u.name || u.username}</option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Item #</label>
          <select name="itemNumber" value={timeEntryForm.itemNumber} onChange={handleTimeEntryChange}>
            <option value="">Select item...</option>
            {lineItems.map(item => (
              <option key={item.itemNumber} value={item.itemNumber}>
                #{item.itemNumber} - {item.description?.substring(0, 30)}
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
          <label>Qty</label>
          <input type="text" name="qty" value={timeEntryForm.qty} onChange={handleTimeEntryChange} />
        </div>
        <div className="form-group">
          <label>Scrap — Bin</label>
          <input type="text" inputMode="numeric" name="scrapBinQty" value={timeEntryForm.scrapBinQty} onChange={handleTimeEntryChange} />
        </div>
        <div className="form-group">
          <label>Scrap — Recycle</label>
          <input type="text" inputMode="numeric" name="scrapRecycleQty" value={timeEntryForm.scrapRecycleQty} onChange={handleTimeEntryChange} />
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
        <label>Description</label>
        <input
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
        <div className="form-group">
          <label>Start Time</label>
          <input type="datetime-local" name="startTime" value={timeEntryForm.startTime} onChange={handleTimeEntryChange} />
        </div>
        <div className="form-group">
          <label>End Time</label>
          <input type="datetime-local" name="endTime" value={timeEntryForm.endTime} onChange={handleTimeEntryChange} />
        </div>
      </div>

      <button type="button" className="btn btn-primary" onClick={handleSaveTimeEntry}>
        {editingTimeEntryId ? 'Update Entry' : 'Save Entry'}
      </button>
    </div>
  );
}
