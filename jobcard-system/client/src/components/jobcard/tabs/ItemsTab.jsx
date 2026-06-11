import { useRef } from 'react';
import { X, Plus } from 'lucide-react';
import { capitalizeFirst } from '../../../utils/formatters';
import { ACCEPT_ATTR } from '../useJobFiles';
import { useTags } from '../../../hooks/useTags';
import LineItemTreatment from './LineItemTreatment';
import LineItemProgress from './LineItemProgress';
import LineItemTimerButton from '../LineItemTimerButton';
import LineItemTagSelect from './LineItemTagSelect';
import { itemWarningMap } from '../../../utils/attachmentWarnings';

function entriesForItem(entries, itemNumber) {
  const target = String(itemNumber);
  return entries.filter(e => {
    if (e.itemNumber === undefined || e.itemNumber === null) return false;
    return String(e.itemNumber) === target;
  });
}

export default function ItemsTab({
  jobCardId,
  lineItems,
  addLineItem,
  updateLineItem,
  removeLineItem,
  suppliers = [],
  timeEntries = [],
  isAdmin = false,
  readOnly = false,
  attachmentWarnings = null,
  onAttachItemFile,
  showTimeEntryForm = false,
  editingTimeEntryId = null,
  timeEntryForm,
  handleTimeEntryChange,
  machines = [],
  handleAddTimeEntry,
  handleEditTimeEntry,
  handleSaveTimeEntry,
  handleStopActiveEntry,
  handleDeleteTimeEntry,
  resetTimeEntryForm,
  onToggleSpecial,
  // Timer (per-item)
  activeTimer,
  timerElapsed,
  timerLoading,
  onStartTimer,
  onStopTimer
}) {
  const { tags: materialTags } = useTags('material');
  const { tags: jobTypeTags } = useTags('job_type');
  const { tags: drawingsTags } = useTags('drawings');
  const { tags: customerPropertyTags } = useTags('customer_property');
  const fieldsLocked = readOnly;
  const warningByItem = itemWarningMap(attachmentWarnings);

  // Only saved parts (which carry a permanent "item:" id) can take attachments;
  // a part added but not yet saved has no stable id to tie a file to.
  const isPersisted = (it) => typeof it.id === 'string' && it.id.startsWith('item:');

  // One shared hidden file picker drives every per-part "Attach" button. The
  // pending target (which part + which bucket) is held on a ref until the user
  // picks a file, then handed to the parent's upload handler.
  const attachInputRef = useRef(null);
  const pendingAttachRef = useRef(null);
  const triggerAttach = (itemId, category) => {
    if (!onAttachItemFile) return;
    pendingAttachRef.current = { itemId, category };
    attachInputRef.current?.click();
  };
  const handleAttachChosen = (e) => {
    const file = e.target.files?.[0];
    const target = pendingAttachRef.current;
    e.target.value = '';
    pendingAttachRef.current = null;
    if (file && target && onAttachItemFile) {
      onAttachItemFile(target.itemId, target.category, file);
    }
  };

  return (
    <div className="modal-form-grid">
      {onAttachItemFile && (
        <input
          type="file"
          ref={attachInputRef}
          accept={ACCEPT_ATTR}
          style={{ display: 'none' }}
          onChange={handleAttachChosen}
        />
      )}
      <div className="form-section">
        <div className="form-section-header">
          <h3 className="form-section-title">Line Items <span className="required">*</span></h3>
          {!fieldsLocked && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={addLineItem}>
              <Plus size={14} /> Add Item
            </button>
          )}
        </div>

        {isAdmin && showTimeEntryForm && timeEntryForm && (
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
              <div className="form-group">
                <label>Scrap</label>
                <input type="text" inputMode="numeric" name="scrapQty" value={timeEntryForm.scrapQty} onChange={handleTimeEntryChange} />
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

        <div className="line-items-list">
          {lineItems.map(item => {
            const itemEntries = entriesForItem(timeEntries, item.itemNumber);
            return (
              <div key={item.id} className="line-item-card">
                <div className="line-item-badge">#{item.itemNumber}</div>
                <div className="line-item-fields">
                  <div className="line-item-row line-item-row-primary">
                  <div className="line-item-job-type">
                    <label>Job Type {!fieldsLocked && <span className="required">*</span>}</label>
                    {fieldsLocked ? (
                      <div className="readonly-value">
                        {jobTypeTags.find(j => j.value === item.jobType)?.label || item.jobType || '-'}
                      </div>
                    ) : (
                      <select
                        value={item.jobType || ''}
                        onChange={(e) => updateLineItem(item.id, 'jobType', e.target.value)}
                      >
                        <option value="">Select...</option>
                        {jobTypeTags.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="line-item-qty">
                    <label>Qty</label>
                    {fieldsLocked ? (
                      <div className="readonly-value">{item.qty || '-'}</div>
                    ) : (
                      <input
                        type="text"
                        value={item.qty}
                        onChange={(e) => updateLineItem(item.id, 'qty', e.target.value)}
                        placeholder="-"
                      />
                    )}
                  </div>
                  <div className="line-item-desc">
                    <label>Description</label>
                    {fieldsLocked ? (
                      <div className="readonly-value">{item.description || '-'}</div>
                    ) : (
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                        onBlur={(e) => {
                          const formatted = capitalizeFirst(e.target.value);
                          if (formatted !== e.target.value) {
                            updateLineItem(item.id, 'description', formatted);
                          }
                        }}
                        placeholder="What needs to be done..."
                      />
                    )}
                  </div>
                  </div>
                  <div className="line-item-row line-item-row-secondary">
                  <div className="line-item-material">
                    <label>Material</label>
                    {fieldsLocked ? (
                      <div className="readonly-value">
                        {item.material ? (materialTags.find(m => m.value === item.material)?.label || item.material) : '-'}
                      </div>
                    ) : (
                      <select
                        value={item.material || ''}
                        onChange={(e) => updateLineItem(item.id, 'material', e.target.value)}
                      >
                        <option value="">No material</option>
                        {materialTags.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  {fieldsLocked ? (
                    <div className="line-item-treatment">
                      <label>Treatment &amp; Supplier</label>
                      <div className="readonly-value">
                        {(Array.isArray(item.treatments) && item.treatments.length > 0)
                          ? item.treatments.map((t, i) => {
                              const tName = t.value === 'OTHER' ? (t.otherText || 'Other') : t.value;
                              return <span key={i} className="readonly-badge treatment">{tName} → {t.supplierName || '(no supplier)'}</span>;
                            })
                          : '-'}
                      </div>
                    </div>
                  ) : (
                    <LineItemTreatment
                      treatments={Array.isArray(item.treatments) ? item.treatments : []}
                      suppliers={suppliers}
                      onChange={(arr) => updateLineItem(item.id, 'treatments', arr)}
                    />
                  )}

                  <LineItemTagSelect
                    label="Drawings"
                    required={!fieldsLocked}
                    readOnly={fieldsLocked}
                    value={item.drawingsType || ''}
                    options={drawingsTags.map(o => ({ value: o.value, label: o.label }))}
                    naValue="N_A"
                    onChange={(v) => updateLineItem(item.id, 'drawingsType', v)}
                    warning={!!warningByItem[item.itemNumber]?.missingDrawing}
                    onAttach={onAttachItemFile && isPersisted(item) ? () => triggerAttach(item.id, 'job-files') : undefined}
                  />

                  <LineItemTagSelect
                    label="Customer Property"
                    required={!fieldsLocked}
                    readOnly={fieldsLocked}
                    value={item.customerProperty || ''}
                    options={customerPropertyTags.map(o => ({ value: o.value, label: o.label }))}
                    naValue="N_A"
                    onChange={(v) => updateLineItem(item.id, 'customerProperty', v)}
                    warning={!!warningByItem[item.itemNumber]?.missingCustomerProperty}
                    onAttach={onAttachItemFile && isPersisted(item) ? () => triggerAttach(item.id, 'customer-property-files') : undefined}
                  />
                  </div>

                  {jobCardId && (onStartTimer || onStopTimer) && (
                    <div className="line-item-actions">
                      <LineItemTimerButton
                        itemNumber={item.itemNumber}
                        activeTimer={activeTimer}
                        elapsed={timerElapsed}
                        loading={timerLoading}
                        onStart={onStartTimer}
                        onStop={onStopTimer}
                      />
                    </div>
                  )}

                  {jobCardId && (
                    <LineItemProgress
                      entries={itemEntries}
                      targetQty={item.qty}
                      isAdmin={isAdmin}
                      onAdd={isAdmin && handleAddTimeEntry ? () => handleAddTimeEntry(item.itemNumber) : undefined}
                      onEdit={isAdmin ? handleEditTimeEntry : undefined}
                      onDelete={isAdmin ? handleDeleteTimeEntry : undefined}
                      onStop={handleStopActiveEntry}
                      onToggleSpecial={isAdmin ? onToggleSpecial : undefined}
                    />
                  )}
                </div>
                {!fieldsLocked && lineItems.length > 1 && (
                  <button type="button" className="line-item-remove" onClick={() => removeLineItem(item.id)} title="Remove item">
                    <X size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
