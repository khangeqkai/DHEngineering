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
              <label>Machine #</label>
              <select name="machineNumber" value={timeEntryForm.machineNumber} onChange={handleTimeEntryChange}>
                <option value="">Select machine...</option>
                {machines.map(m => (
                  <option key={m.id} value={m.machineNumber}>{m.machineNumber} {m.name && `- ${m.name}`}</option>
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
              <input type="datetime-local" name="startTime" value={timeEntryForm.startTime} onChange={handleTimeEntryChange} />
            </div>
            <div className="form-group">
              <label>End Time</label>
              <input type="datetime-local" name="endTime" value={timeEntryForm.endTime} onChange={handleTimeEntryChange} />
            </div>
          </div>

          {/* Special Ops Section */}
          <div className="special-ops-section">
            <h4>Special Ops <span className="required">*</span></h4>
            <div className="form-row">
              <div className="form-group checkbox-group">
                <label>
                  <input type="checkbox" name="equipmentChecksDone" checked={timeEntryForm.equipmentChecksDone} onChange={handleTimeEntryChange} />
                  Equipment Checks Done
                </label>
              </div>
              <div className="form-group checkbox-group">
                <label>
                  <input type="checkbox" name="measuringVerificationDone" checked={timeEntryForm.measuringVerificationDone} onChange={handleTimeEntryChange} />
                  Measuring Equipment Verification Done
                </label>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>First Off Inspection</label>
                <select name="firstOffInspection" value={timeEntryForm.firstOffInspection} onChange={handleTimeEntryChange}>
                  <option value="NOT_APPLICABLE">Not Applicable</option>
                  <option value="OK">OK - Results recorded</option>
                  <option value="ERROR">Error</option>
                </select>
              </div>
              <div className="form-group">
                <label>In-process Validation</label>
                <select name="inProcessValidation" value={timeEntryForm.inProcessValidation} onChange={handleTimeEntryChange}>
                  <option value="NOT_APPLICABLE">Not Applicable</option>
                  <option value="OK">OK - Results recorded</option>
                  <option value="ERROR">Error</option>
                </select>
              </div>
            </div>

            {timeEntryForm.firstOffInspection === 'ERROR' && (
              <div className="form-group">
                <label>First Off Inspection Notes <span className="required">*</span></label>
                <input type="text" name="firstOffInspectionNotes" value={timeEntryForm.firstOffInspectionNotes} onChange={handleTimeEntryChange} placeholder="Describe the error..." />
              </div>
            )}
            {timeEntryForm.inProcessValidation === 'ERROR' && (
              <div className="form-group">
                <label>In-process Validation Notes <span className="required">*</span></label>
                <input type="text" name="inProcessValidationNotes" value={timeEntryForm.inProcessValidationNotes} onChange={handleTimeEntryChange} placeholder="Describe the error..." />
              </div>
            )}
          </div>

          {/* Scrap Rate Analysis */}
          <div className="scrap-rate-section">
            <h4>Scrap Rate Analysis</h4>
            <div className="form-group checkbox-group">
              <label>
                <input type="checkbox" name="scrapAllGood" checked={timeEntryForm.scrapAllGood} onChange={handleTimeEntryChange} />
                All Good (No Scrap)
              </label>
            </div>
            {!timeEntryForm.scrapAllGood && (
              <div className="form-row">
                <div className="form-group">
                  <label>Recycle In-House Qty</label>
                  <input type="number" name="scrapRecycleInhouseQty" value={timeEntryForm.scrapRecycleInhouseQty} onChange={handleTimeEntryChange} min="0" />
                </div>
                <div className="form-group">
                  <label>Recycle Bin Qty</label>
                  <input type="number" name="scrapRecycleBinQty" value={timeEntryForm.scrapRecycleBinQty} onChange={handleTimeEntryChange} min="0" />
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
              const hasError = entry.firstOffInspection === 'ERROR' || entry.inProcessValidation === 'ERROR';
              return (
                <div key={entry.id} className={`time-entry-card ${hasError ? 'has-error' : ''}`}>
                  <div className="entry-header">
                    <div className="entry-info">
                      <span className="user-name">{entry.userName}</span>
                      <span className="entry-date">{new Date(entry.startTime).toLocaleDateString()}</span>
                      {entry.machineNumber && <span className="machine-badge">M#{entry.machineNumber}</span>}
                      {entry.itemNumber && <span className="item-badge">Item #{entry.itemNumber}</span>}
                    </div>
                    <div className="entry-actions">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleEditTimeEntry(entry)}>Edit</button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteTimeEntry(entry.id)}>Delete</button>
                    </div>
                  </div>
                  <div className="entry-body">
                    <div className="entry-description">{entry.description || 'No description'}</div>
                    <div className="entry-time">
                      <span>{new Date(entry.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span> - </span>
                      <span>{entry.endTime ? new Date(entry.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'In progress'}</span>
                      {entry.endTime && (
                        <span className="duration">
                          ({Math.round((new Date(entry.endTime) - new Date(entry.startTime)) / 60000)} min)
                        </span>
                      )}
                    </div>
                    <div className="entry-special-ops">
                      <span className={entry.equipmentChecksDone ? 'status-ok' : 'status-pending'}>
                        Equip: {entry.equipmentChecksDone ? 'Done' : 'Pending'}
                      </span>
                      <span className={entry.measuringVerificationDone ? 'status-ok' : 'status-pending'}>
                        Measure: {entry.measuringVerificationDone ? 'Done' : 'Pending'}
                      </span>
                      <span className={entry.firstOffInspection === 'ERROR' ? 'status-error' : 'status-ok'}>
                        1st Off: {entry.firstOffInspection || 'N/A'}
                      </span>
                      <span className={entry.inProcessValidation === 'ERROR' ? 'status-error' : 'status-ok'}>
                        In-proc: {entry.inProcessValidation || 'N/A'}
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
