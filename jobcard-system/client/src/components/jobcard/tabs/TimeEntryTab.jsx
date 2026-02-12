export default function TimeEntryTab({
  timeEntries,
  showTimeEntryForm,
  editingTimeEntryId,
  timeEntryForm,
  handleTimeEntryChange,
  handleAddTimeEntry,
  handleEditTimeEntry,
  handleSaveTimeEntry,
  handleDeleteTimeEntry,
  resetTimeEntryForm,
  lineItems,
  machines
}) {
  return (
    <div className="modal-form-grid">
      {/* Add/Edit Time Entry Form */}
      {showTimeEntryForm && (
        <div className="form-section time-entry-form">
          <div className="form-section-header">
            <h3 className="form-section-title">
              {editingTimeEntryId ? 'Edit Time Entry' : 'New Time Entry'}
            </h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={resetTimeEntryForm}>
              Cancel
            </button>
          </div>

          {/* Basic Info */}
          <div className="form-row">
            <div className="form-group">
              <label>Item #</label>
              <select name="item_number" value={timeEntryForm.item_number} onChange={handleTimeEntryChange}>
                <option value="">Select item...</option>
                {lineItems.map(item => (
                  <option key={item.item_number} value={item.item_number}>
                    #{item.item_number} - {item.description?.substring(0, 30)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Machine #</label>
              <select name="machine_number" value={timeEntryForm.machine_number} onChange={handleTimeEntryChange}>
                <option value="">Select machine...</option>
                {machines.map(m => (
                  <option key={m.id} value={m.machine_number}>{m.machine_number} {m.name && `- ${m.name}`}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Qty</label>
              <input type="text" name="qty" value={timeEntryForm.qty} onChange={handleTimeEntryChange} />
            </div>
          </div>

          <div className="form-group">
            <label>Description</label>
            <input type="text" name="description" value={timeEntryForm.description} onChange={handleTimeEntryChange} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Start Time</label>
              <input type="datetime-local" name="start_time" value={timeEntryForm.start_time} onChange={handleTimeEntryChange} />
            </div>
            <div className="form-group">
              <label>End Time</label>
              <input type="datetime-local" name="end_time" value={timeEntryForm.end_time} onChange={handleTimeEntryChange} />
            </div>
          </div>

          {/* Special Ops Section */}
          <div className="special-ops-section">
            <h4>Special Ops <span className="required">*</span></h4>
            <div className="form-row">
              <div className="form-group checkbox-group">
                <label>
                  <input type="checkbox" name="equipment_checks_done" checked={timeEntryForm.equipment_checks_done} onChange={handleTimeEntryChange} />
                  Equipment Checks Done
                </label>
              </div>
              <div className="form-group checkbox-group">
                <label>
                  <input type="checkbox" name="measuring_verification_done" checked={timeEntryForm.measuring_verification_done} onChange={handleTimeEntryChange} />
                  Measuring Equipment Verification Done
                </label>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>First Off Inspection</label>
                <select name="first_off_inspection" value={timeEntryForm.first_off_inspection} onChange={handleTimeEntryChange}>
                  <option value="NOT_APPLICABLE">Not Applicable</option>
                  <option value="OK">OK - Results recorded</option>
                  <option value="ERROR">Error</option>
                </select>
              </div>
              <div className="form-group">
                <label>In-process Validation</label>
                <select name="in_process_validation" value={timeEntryForm.in_process_validation} onChange={handleTimeEntryChange}>
                  <option value="NOT_APPLICABLE">Not Applicable</option>
                  <option value="OK">OK - Results recorded</option>
                  <option value="ERROR">Error</option>
                </select>
              </div>
            </div>

            {timeEntryForm.first_off_inspection === 'ERROR' && (
              <div className="form-group">
                <label>First Off Inspection Notes <span className="required">*</span></label>
                <input type="text" name="first_off_inspection_notes" value={timeEntryForm.first_off_inspection_notes} onChange={handleTimeEntryChange} placeholder="Describe the error..." />
              </div>
            )}
            {timeEntryForm.in_process_validation === 'ERROR' && (
              <div className="form-group">
                <label>In-process Validation Notes <span className="required">*</span></label>
                <input type="text" name="in_process_validation_notes" value={timeEntryForm.in_process_validation_notes} onChange={handleTimeEntryChange} placeholder="Describe the error..." />
              </div>
            )}
          </div>

          {/* Scrap Rate Analysis */}
          <div className="scrap-rate-section">
            <h4>Scrap Rate Analysis</h4>
            <div className="form-group checkbox-group">
              <label>
                <input type="checkbox" name="scrap_all_good" checked={timeEntryForm.scrap_all_good} onChange={handleTimeEntryChange} />
                All Good (No Scrap)
              </label>
            </div>
            {!timeEntryForm.scrap_all_good && (
              <div className="form-row">
                <div className="form-group">
                  <label>Recycle In-House Qty</label>
                  <input type="number" name="scrap_recycle_inhouse_qty" value={timeEntryForm.scrap_recycle_inhouse_qty} onChange={handleTimeEntryChange} min="0" />
                </div>
                <div className="form-group">
                  <label>Recycle Bin Qty</label>
                  <input type="number" name="scrap_recycle_bin_qty" value={timeEntryForm.scrap_recycle_bin_qty} onChange={handleTimeEntryChange} min="0" />
                </div>
              </div>
            )}
          </div>

          <button type="button" className="btn btn-primary" onClick={handleSaveTimeEntry}>
            {editingTimeEntryId ? 'Update Entry' : 'Save Entry'}
          </button>
        </div>
      )}

      {/* Time Entries List */}
      <div className="form-section">
        <div className="form-section-header">
          <h3 className="form-section-title" data-section="T1">Time Entries</h3>
          {!showTimeEntryForm && (
            <button type="button" className="btn btn-primary btn-sm" onClick={handleAddTimeEntry}>
              + Add Entry
            </button>
          )}
        </div>

        {timeEntries.length === 0 ? (
          <p className="empty-message">No time entries recorded yet.</p>
        ) : (
          <div className="time-entries-list">
            {timeEntries.map(entry => {
              const hasError = entry.first_off_inspection === 'ERROR' || entry.in_process_validation === 'ERROR';
              return (
                <div key={entry.id} className={`time-entry-card ${hasError ? 'has-error' : ''}`}>
                  <div className="entry-header">
                    <div className="entry-info">
                      <span className="user-name">{entry.user_name}</span>
                      <span className="entry-date">{new Date(entry.start_time).toLocaleDateString()}</span>
                      {entry.machine_number && <span className="machine-badge">M#{entry.machine_number}</span>}
                      {entry.item_number && <span className="item-badge">Item #{entry.item_number}</span>}
                    </div>
                    <div className="entry-actions">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleEditTimeEntry(entry)}>Edit</button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteTimeEntry(entry.id)}>Delete</button>
                    </div>
                  </div>
                  <div className="entry-body">
                    <div className="entry-description">{entry.description || 'No description'}</div>
                    <div className="entry-time">
                      <span>{new Date(entry.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span> - </span>
                      <span>{entry.end_time ? new Date(entry.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'In progress'}</span>
                      {entry.end_time && (
                        <span className="duration">
                          ({Math.round((new Date(entry.end_time) - new Date(entry.start_time)) / 60000)} min)
                        </span>
                      )}
                    </div>
                    <div className="entry-special-ops">
                      <span className={entry.equipment_checks_done ? 'status-ok' : 'status-pending'}>
                        Equip: {entry.equipment_checks_done ? 'Done' : 'Pending'}
                      </span>
                      <span className={entry.measuring_verification_done ? 'status-ok' : 'status-pending'}>
                        Measure: {entry.measuring_verification_done ? 'Done' : 'Pending'}
                      </span>
                      <span className={entry.first_off_inspection === 'ERROR' ? 'status-error' : 'status-ok'}>
                        1st Off: {entry.first_off_inspection || 'N/A'}
                      </span>
                      <span className={entry.in_process_validation === 'ERROR' ? 'status-error' : 'status-ok'}>
                        In-proc: {entry.in_process_validation || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
