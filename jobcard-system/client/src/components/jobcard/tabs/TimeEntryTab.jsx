import { capitalizeFirst } from '../../../utils/formatters';

function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function EmployeeTimerView({
  activeTimer,
  elapsed,
  timerLoading,
  onStart,
  onStop,
  showQaForm,
  qaForm,
  handleQaChange,
  onSubmitQa,
  onSkipQa,
  timeEntries,
  lineItems,
  machines
}) {
  return (
    <div className="modal-form-grid">
      {/* Start/Stop Timer */}
      <div className="form-section timer-section">
        <div className="timer-display">
          {activeTimer ? (
            <>
              <div className="timer-elapsed">{formatElapsed(elapsed)}</div>
              <button
                type="button"
                className="btn btn-danger btn-timer"
                onClick={onStop}
                disabled={timerLoading}
              >
                {timerLoading ? 'Stopping...' : 'Stop Timer'}
              </button>
              <div className="timer-started">
                Started {new Date(activeTimer.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-timer"
              onClick={onStart}
              disabled={timerLoading}
            >
              {timerLoading ? 'Starting...' : 'Start Timer'}
            </button>
          )}
        </div>
      </div>

      {/* QA Form after stopping */}
      {showQaForm && (
        <div className="form-section timer-qa-form">
          <div className="form-section-header">
            <h3 className="form-section-title">Complete Time Entry</h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onSkipQa}>Skip</button>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Item #</label>
              <select name="itemNumber" value={qaForm.itemNumber} onChange={handleQaChange}>
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
              <select name="machineNumber" value={qaForm.machineNumber} onChange={handleQaChange}>
                <option value="">Select machine...</option>
                {machines.map(m => (
                  <option key={m.id} value={m.machineNumber}>{m.machineNumber} {m.name && `- ${m.name}`}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Qty</label>
              <input type="text" name="qty" value={qaForm.qty} onChange={handleQaChange} />
            </div>
          </div>

          <div className="form-group">
            <label>Description</label>
            <input type="text" name="description" value={qaForm.description} onChange={handleQaChange} />
          </div>

          <div className="special-ops-section">
            <h4>Special Ops</h4>
            <div className="form-row">
              <div className="form-group checkbox-group">
                <label>
                  <input type="checkbox" name="equipmentChecksDone" checked={qaForm.equipmentChecksDone} onChange={handleQaChange} />
                  Equipment Checks Done
                </label>
              </div>
              <div className="form-group checkbox-group">
                <label>
                  <input type="checkbox" name="measuringVerificationDone" checked={qaForm.measuringVerificationDone} onChange={handleQaChange} />
                  Measuring Verification Done
                </label>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>First Off Inspection</label>
                <select name="firstOffInspection" value={qaForm.firstOffInspection} onChange={handleQaChange}>
                  <option value="NOT_APPLICABLE">Not Applicable</option>
                  <option value="OK">OK - Results recorded</option>
                  <option value="ERROR">Error</option>
                </select>
              </div>
              <div className="form-group">
                <label>In-process Validation</label>
                <select name="inProcessValidation" value={qaForm.inProcessValidation} onChange={handleQaChange}>
                  <option value="NOT_APPLICABLE">Not Applicable</option>
                  <option value="OK">OK - Results recorded</option>
                  <option value="ERROR">Error</option>
                </select>
              </div>
            </div>
            {qaForm.firstOffInspection === 'ERROR' && (
              <div className="form-group">
                <label>First Off Inspection Notes</label>
                <input type="text" name="firstOffInspectionNotes" value={qaForm.firstOffInspectionNotes} onChange={handleQaChange} placeholder="Describe the error..." />
              </div>
            )}
            {qaForm.inProcessValidation === 'ERROR' && (
              <div className="form-group">
                <label>In-process Validation Notes</label>
                <input type="text" name="inProcessValidationNotes" value={qaForm.inProcessValidationNotes} onChange={handleQaChange} placeholder="Describe the error..." />
              </div>
            )}
          </div>

          <div className="scrap-rate-section">
            <h4>Scrap Rate</h4>
            <div className="form-group checkbox-group">
              <label>
                <input type="checkbox" name="scrapAllGood" checked={qaForm.scrapAllGood} onChange={handleQaChange} />
                No Scrap
              </label>
            </div>
            {!qaForm.scrapAllGood && (
              <div className="form-row">
                <div className="form-group">
                  <label>Recycle In-House Qty</label>
                  <input type="number" name="scrapRecycleInhouseQty" value={qaForm.scrapRecycleInhouseQty} onChange={handleQaChange} min="0" />
                </div>
                <div className="form-group">
                  <label>Recycle Bin Qty</label>
                  <input type="number" name="scrapRecycleBinQty" value={qaForm.scrapRecycleBinQty} onChange={handleQaChange} min="0" />
                </div>
              </div>
            )}
          </div>

          <button type="button" className="btn btn-primary" onClick={onSubmitQa}>
            Save Entry
          </button>
        </div>
      )}

      {/* Past Time Entries (read-only for employees) */}
      <div className="form-section">
        <h3 className="form-section-title">Time Entries</h3>
        {timeEntries.length === 0 ? (
          <p className="empty-message">No time entries</p>
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
                  </div>
                  <div className="entry-body">
                    {entry.description && <div className="entry-description">{entry.description}</div>}
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
                    {(!entry.equipmentChecksDone || !entry.measuringVerificationDone || entry.firstOffInspection === 'ERROR' || entry.inProcessValidation === 'ERROR') && (
                      <div className="entry-special-ops">
                        {!entry.equipmentChecksDone && <span className="status-pending">Equip: Pending</span>}
                        {!entry.measuringVerificationDone && <span className="status-pending">Measure: Pending</span>}
                        {entry.firstOffInspection === 'ERROR' && <span className="status-error">1st Off: Error</span>}
                        {entry.inProcessValidation === 'ERROR' && <span className="status-error">In-proc: Error</span>}
                      </div>
                    )}
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

function AdminTimeEntryView({
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

          {/* Special Ops Section */}
          <div className="special-ops-section">
            <h4>Special Ops</h4>
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
                <input
                  type="text"
                  name="firstOffInspectionNotes"
                  value={timeEntryForm.firstOffInspectionNotes}
                  onChange={handleTimeEntryChange}
                  onBlur={(e) => {
                    const formatted = capitalizeFirst(e.target.value);
                    if (formatted !== e.target.value) {
                      handleTimeEntryChange({ target: { name: 'firstOffInspectionNotes', value: formatted } });
                    }
                  }}
                  placeholder="Describe the error..."
                />
              </div>
            )}
            {timeEntryForm.inProcessValidation === 'ERROR' && (
              <div className="form-group">
                <label>In-process Validation Notes <span className="required">*</span></label>
                <input
                  type="text"
                  name="inProcessValidationNotes"
                  value={timeEntryForm.inProcessValidationNotes}
                  onChange={handleTimeEntryChange}
                  onBlur={(e) => {
                    const formatted = capitalizeFirst(e.target.value);
                    if (formatted !== e.target.value) {
                      handleTimeEntryChange({ target: { name: 'inProcessValidationNotes', value: formatted } });
                    }
                  }}
                  placeholder="Describe the error..."
                />
              </div>
            )}
          </div>

          {/* Scrap Rate Analysis */}
          <div className="scrap-rate-section">
            <h4>Scrap Rate</h4>
            <div className="form-group checkbox-group">
              <label>
                <input type="checkbox" name="scrapAllGood" checked={timeEntryForm.scrapAllGood} onChange={handleTimeEntryChange} />
                No Scrap
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
          <h3 className="form-section-title">Time Entries</h3>
          {!showTimeEntryForm && (
            <button type="button" className="btn btn-primary btn-sm" onClick={handleAddTimeEntry}>
              + Add Entry
            </button>
          )}
        </div>

        {timeEntries.length === 0 ? (
          <p className="empty-message">No time entries</p>
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
                    {entry.description && <div className="entry-description">{entry.description}</div>}
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
                    {(!entry.equipmentChecksDone || !entry.measuringVerificationDone || entry.firstOffInspection === 'ERROR' || entry.inProcessValidation === 'ERROR') && (
                    <div className="entry-special-ops">
                      {!entry.equipmentChecksDone && <span className="status-pending">Equip: Pending</span>}
                      {!entry.measuringVerificationDone && <span className="status-pending">Measure: Pending</span>}
                      {entry.firstOffInspection === 'ERROR' && <span className="status-error">1st Off: Error</span>}
                      {entry.inProcessValidation === 'ERROR' && <span className="status-error">In-proc: Error</span>}
                    </div>
                    )}
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

export default function TimeEntryTab({
  isAdmin,
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
  machines,
  // Timer props (employee mode)
  activeTimer,
  elapsed,
  timerLoading,
  onStartTimer,
  onStopTimer,
  showQaForm,
  qaForm,
  handleQaChange,
  onSubmitQa,
  onSkipQa
}) {
  if (!isAdmin) {
    return (
      <EmployeeTimerView
        activeTimer={activeTimer}
        elapsed={elapsed}
        timerLoading={timerLoading}
        onStart={onStartTimer}
        onStop={onStopTimer}
        showQaForm={showQaForm}
        qaForm={qaForm}
        handleQaChange={handleQaChange}
        onSubmitQa={onSubmitQa}
        onSkipQa={onSkipQa}
        timeEntries={timeEntries}
        lineItems={lineItems}
        machines={machines}
      />
    );
  }

  return (
    <AdminTimeEntryView
      timeEntries={timeEntries}
      showTimeEntryForm={showTimeEntryForm}
      editingTimeEntryId={editingTimeEntryId}
      timeEntryForm={timeEntryForm}
      handleTimeEntryChange={handleTimeEntryChange}
      handleAddTimeEntry={handleAddTimeEntry}
      handleEditTimeEntry={handleEditTimeEntry}
      handleSaveTimeEntry={handleSaveTimeEntry}
      handleDeleteTimeEntry={handleDeleteTimeEntry}
      resetTimeEntryForm={resetTimeEntryForm}
      lineItems={lineItems}
      machines={machines}
    />
  );
}
