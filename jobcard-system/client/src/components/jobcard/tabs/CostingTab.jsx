import { useState, useEffect } from 'react';
import { capitalizeFirst } from '../../../utils/formatters';

function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function LiveElapsed({ startTime }) {
  const [elapsed, setElapsed] = useState(() => Math.max(0, Math.floor((Date.now() - new Date(startTime).getTime()) / 1000)));

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(startTime).getTime()) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <span className="timer-indicator">
      <span className="timer-dot" />
      {formatElapsed(elapsed)}
    </span>
  );
}

function TimeEntriesSection({
  timeEntries,
  showTimeEntryForm,
  editingTimeEntryId,
  timeEntryForm,
  handleTimeEntryChange,
  handleAddTimeEntry,
  handleEditTimeEntry,
  handleSaveTimeEntry,
  handleDeleteTimeEntry,
  handleStopActiveEntry,
  resetTimeEntryForm,
  onToggleSpecial,
  lineItems,
  machines
}) {
  const activeEntries = timeEntries.filter(e => !e.endTime);
  const completedEntries = timeEntries.filter(e => e.endTime);

  const renderEntryCard = (entry) => {
    const itemNums = entry.itemNumber ? String(entry.itemNumber).split(',').map(s => s.trim()) : [];
    const qtys = entry.qty ? String(entry.qty).split(',').map(s => s.trim()) : [];
    const itemMap = new Map(lineItems.map(li => [String(li.itemNumber), li.description]));
    const descMap = new Map();
    if (entry.description && itemNums.length > 1) {
      const pattern = /#(\d+):\s*(.*?)(?=;\s*#\d+:|$)/g;
      let m;
      while ((m = pattern.exec(entry.description)) !== null) {
        descMap.set(m[1], m[2].trim());
      }
    }
    const isActive = !entry.endTime;
    const durationSec = entry.endTime
      ? Math.round((new Date(entry.endTime) - new Date(entry.startTime)) / 1000)
      : null;
    const machinesList = entry.machineNumber
      ? String(entry.machineNumber).split(',').map(s => s.trim()).filter(Boolean)
      : [];

    return (
      <div key={entry.id} className={`te-card${isActive ? ' te-card--active' : ''}${entry.isSpecialLabour ? ' te-card--special' : ''}`}>
        {/* Top bar: duration badge + actions */}
        <div className="te-topbar">
          <div className="te-duration-zone">
            {isActive ? (
              <LiveElapsed startTime={entry.startTime} />
            ) : (
              <span className="te-duration-badge">{formatElapsed(durationSec)}</span>
            )}
          </div>
          <div className="te-actions">
            {entry.endTime && (
              <label className="te-special-toggle" title="Mark as special labour">
                <input
                  type="checkbox"
                  checked={entry.isSpecialLabour || false}
                  onChange={() => onToggleSpecial(entry.id)}
                />
                <span>Special</span>
              </label>
            )}
            {entry.endTime ? (
              <>
                <button type="button" className="te-btn te-btn--edit" onClick={() => handleEditTimeEntry(entry)}>Edit</button>
                <button type="button" className="te-btn te-btn--del" onClick={() => handleDeleteTimeEntry(entry.id)}>Delete</button>
              </>
            ) : (
              <button type="button" className="te-btn te-btn--stop" onClick={() => handleStopActiveEntry(entry)}>Stop Timer</button>
            )}
          </div>
        </div>

        {/* Main content row */}
        <div className="te-body">
          {/* Left: who + when */}
          <div className="te-meta">
            <span className="te-worker">{entry.userName}</span>
            <span className="te-date">{new Date(entry.startTime).toLocaleDateString([], { day: '2-digit', month: 'short' })}</span>
            <span className="te-timerange">
              {new Date(entry.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {entry.endTime && (
                <> — {new Date(entry.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>
              )}
            </span>
          </div>

          {/* Center: what was worked on */}
          <div className="te-work">
            {machinesList.length > 0 && (
              <div className="te-machines">
                {machinesList.map((mn, i) => (
                  <span key={i} className="te-machine-tag">M{mn}</span>
                ))}
              </div>
            )}
            {itemNums.length > 0 ? (
              <div className="te-items">
                {itemNums.map((num, i) => {
                  const userDesc = descMap.get(num) || (itemNums.length === 1 ? entry.description : '');
                  return (
                    <div key={i} className="te-item-row">
                      <span className="te-item-num">#{num}</span>
                      <span className="te-item-desc">{itemMap.get(num) || ''}</span>
                      {qtys[i] && <span className="te-item-qty">{qtys[i]} pcs</span>}
                      {userDesc && <span className="te-item-note">{userDesc}</span>}
                    </div>
                  );
                })}
              </div>
            ) : entry.description ? (
              <div className="te-desc-only">{entry.description}</div>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="form-section">
      {showTimeEntryForm && (
        <div className="time-entry-form costing-entry-form">
          <div className="form-section-header">
            <h3 className="form-section-title">
              {editingTimeEntryId ? 'Edit Time Entry' : 'New Time Entry'}
            </h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={resetTimeEntryForm}>
              Cancel
            </button>
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
        <div className="te-list">
          {activeEntries.length > 0 && (
            <div className="te-group">
              <div className="te-group-label te-group-label--active">
                <span className="te-group-dot" />
                Active ({activeEntries.length})
              </div>
              {activeEntries.map(renderEntryCard)}
            </div>
          )}
          {completedEntries.length > 0 && (
            <div className="te-group">
              {activeEntries.length > 0 && (
                <div className="te-group-label">Completed ({completedEntries.length})</div>
              )}
              {completedEntries.map(renderEntryCard)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CostingTab({
  costingForm,
  handleCostingChange,
  calculateCostingTotals,
  handleSaveCosting,
  savingCosting,
  timeEntries,
  showTimeEntryForm,
  editingTimeEntryId,
  timeEntryForm,
  handleTimeEntryChange,
  handleAddTimeEntry,
  handleEditTimeEntry,
  handleSaveTimeEntry,
  handleDeleteTimeEntry,
  handleStopActiveEntry,
  resetTimeEntryForm,
  onToggleSpecial,
  lineItems,
  machines
}) {
  return (
    <div className="modal-form-grid">
      <TimeEntriesSection
        timeEntries={timeEntries || []}
        showTimeEntryForm={showTimeEntryForm}
        editingTimeEntryId={editingTimeEntryId}
        timeEntryForm={timeEntryForm}
        handleTimeEntryChange={handleTimeEntryChange}
        handleAddTimeEntry={handleAddTimeEntry}
        handleEditTimeEntry={handleEditTimeEntry}
        handleSaveTimeEntry={handleSaveTimeEntry}
        handleDeleteTimeEntry={handleDeleteTimeEntry}
        handleStopActiveEntry={handleStopActiveEntry}
        resetTimeEntryForm={resetTimeEntryForm}
        onToggleSpecial={onToggleSpecial}
        lineItems={lineItems || []}
        machines={machines || []}
      />

      <div className="form-section">
        <h3 className="form-section-title">Costing Summary</h3>

        {/* Labour */}
        <div className="costing-row">
          <span className="costing-label">Labour</span>
          <div className="costing-inputs">
            <div className="costing-field">
              <label>Hours</label>
              <input type="number" name="labourHours" value={costingForm.labourHours} readOnly disabled className="input-readonly" />
            </div>
            <div className="costing-field">
              <label>Rate ($/hr)</label>
              <input type="number" name="labourRate" value={costingForm.labourRate} onChange={handleCostingChange} min="0" step="0.01" />
            </div>
            <div className="costing-field total">
              <label>Total</label>
              <span className="costing-total">${(costingForm.labourHours * costingForm.labourRate).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Labour Special */}
        <div className="costing-row">
          <span className="costing-label">Labour Special</span>
          <div className="costing-inputs">
            <div className="costing-field">
              <label>Hours</label>
              <input type="number" name="labourSpecialHours" value={costingForm.labourSpecialHours} readOnly disabled className="input-readonly" />
            </div>
            <div className="costing-field">
              <label>Rate ($/hr)</label>
              <input type="number" name="labourSpecialRate" value={costingForm.labourSpecialRate} onChange={handleCostingChange} min="0" step="0.01" />
            </div>
            <div className="costing-field total">
              <label>Total</label>
              <span className="costing-total">${(costingForm.labourSpecialHours * costingForm.labourSpecialRate).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Materials */}
        <div className="costing-row">
          <span className="costing-label">Materials</span>
          <div className="costing-inputs">
            <div className="costing-field">
              <label>Cost</label>
              <input type="number" name="materialsCost" value={costingForm.materialsCost} onChange={handleCostingChange} min="0" step="0.01" />
            </div>
            <div className="costing-field">
              <label>Profit %</label>
              <input type="number" name="materialsProfitPercent" value={costingForm.materialsProfitPercent} onChange={handleCostingChange} min="0" />
            </div>
            <div className="costing-field total">
              <label>Total</label>
              <span className="costing-total">${(costingForm.materialsCost * (1 + costingForm.materialsProfitPercent / 100)).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Subcontractor */}
        <div className="costing-row">
          <span className="costing-label">Subcontractor</span>
          <div className="costing-inputs">
            <div className="costing-field">
              <label>Cost</label>
              <input type="number" name="subcontractorCost" value={costingForm.subcontractorCost} onChange={handleCostingChange} min="0" step="0.01" />
            </div>
            <div className="costing-field">
              <label>Profit %</label>
              <input type="number" name="subcontractorProfitPercent" value={costingForm.subcontractorProfitPercent} onChange={handleCostingChange} min="0" />
            </div>
            <div className="costing-field total">
              <label>Total</label>
              <span className="costing-total">${(costingForm.subcontractorCost * (1 + costingForm.subcontractorProfitPercent / 100)).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Grand Total */}
        <div className="costing-grand-total">
          <span className="costing-label">GRAND TOTAL</span>
          <span className="grand-total-value">${calculateCostingTotals().grandTotal.toFixed(2)}</span>
        </div>

        <button type="button" className="btn btn-primary" onClick={handleSaveCosting} disabled={savingCosting}>
          {savingCosting ? 'Saving...' : 'Save Costing'}
        </button>
      </div>
    </div>
  );
}
