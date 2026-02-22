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
  showEntryForm,
  entryForm,
  handleEntryFormChange,
  onSubmitEntry,
  onSkipEntry,
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

      {/* Complete time entry after stopping */}
      {showEntryForm && (
        <div className="form-section timer-entry-form">
          <div className="form-section-header">
            <h3 className="form-section-title">Complete Time Entry</h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onSkipEntry}>Skip</button>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Item #</label>
              <select name="itemNumber" value={entryForm.itemNumber} onChange={handleEntryFormChange}>
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
              <select name="machineNumber" value={entryForm.machineNumber} onChange={handleEntryFormChange}>
                <option value="">Select machine...</option>
                {machines.map(m => (
                  <option key={m.id} value={m.machineNumber}>{m.machineNumber} {m.name && `- ${m.name}`}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Qty</label>
              <input type="text" name="qty" value={entryForm.qty} onChange={handleEntryFormChange} />
            </div>
          </div>

          <div className="form-group">
            <label>Description</label>
            <input type="text" name="description" value={entryForm.description} onChange={handleEntryFormChange} />
          </div>

          <button type="button" className="btn btn-primary" onClick={onSubmitEntry}>
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
            {timeEntries.map(entry => (
                <div key={entry.id} className="time-entry-card">
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
                  </div>
                </div>
            ))}
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
            {timeEntries.map(entry => (
                <div key={entry.id} className="time-entry-card">
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
                  </div>
                </div>
            ))}
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
  showEntryForm,
  entryForm,
  handleEntryFormChange,
  onSubmitEntry,
  onSkipEntry
}) {
  if (!isAdmin) {
    return (
      <EmployeeTimerView
        activeTimer={activeTimer}
        elapsed={elapsed}
        timerLoading={timerLoading}
        onStart={onStartTimer}
        onStop={onStopTimer}
        showEntryForm={showEntryForm}
        entryForm={entryForm}
        handleEntryFormChange={handleEntryFormChange}
        onSubmitEntry={onSubmitEntry}
        onSkipEntry={onSkipEntry}
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
