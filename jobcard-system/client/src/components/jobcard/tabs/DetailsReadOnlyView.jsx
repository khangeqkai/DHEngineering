import { useTags } from '../../../hooks/useTags';
import ItemsTab from './ItemsTab';
import ToggleTiles from '../../common/ToggleTiles';

export default function DetailsReadOnlyView({
  formData,
  assignees,
  lineItems,
  updateLineItem,
  timeEntries = [],
  jobCardId,
  activeTimer,
  timerElapsed,
  timerLoading,
  onStartTimer,
  onStopTimer,
  handleStopActiveEntry
}) {
  const { tags: drawingsTags } = useTags('drawings');
  const { tags: customerPropertyTags } = useTags('customer_property');

  const drawingsLabels = (formData.drawingsType || '')
    .split(',')
    .filter(v => v && v !== 'NONE')
    .map(v => {
      const opt = drawingsTags.find(d => d.value === v);
      return opt ? opt.label : v;
    });

  const customerPropertyLabels = (formData.customerProperty || '')
    .split(',')
    .filter(v => v && v !== 'NONE')
    .map(v => {
      const opt = customerPropertyTags.find(c => c.value === v);
      return opt ? opt.label : v;
    });

  return (
    <div className="modal-form-grid readonly-view">
      {/* Line Items — read-only field shells with active timer + files menu + per-item progress */}
      <ItemsTab
        jobCardId={jobCardId}
        lineItems={lineItems}
        updateLineItem={updateLineItem}
        timeEntries={timeEntries}
        isAdmin={false}
        readOnly={true}
        activeTimer={activeTimer}
        timerElapsed={timerElapsed}
        timerLoading={timerLoading}
        onStartTimer={onStartTimer}
        onStopTimer={onStopTimer}
        handleStopActiveEntry={handleStopActiveEntry}
      />

      {/* Assignees */}
      {assignees && assignees.length > 0 && (
        <div className="form-section">
          <h3 className="form-section-title">Assignees</h3>
          <ToggleTiles
            ariaLabel="Assignees"
            readOnly
            minTileWidth={130}
            options={assignees.map(a => ({ value: a.userId, label: a.userName || a.username }))}
            selectedValues={assignees.map(a => a.userId)}
          />
        </div>
      )}

      {/* Customer Input — inline strip */}
      <div className="form-section">
        <h3 className="form-section-title">Customer Input</h3>
        <div className="customer-input-strip">
          <div className="cis-item">
            <span className="cis-label">Quality</span>
            <span className="cis-value">{formData.qualityLevel || 'STANDARD'}</span>
          </div>
          {customerPropertyLabels.length > 0 && (
            <div className="cis-item">
              <span className="cis-label">Property</span>
              <span className="cis-value">{customerPropertyLabels.join(', ')}</span>
            </div>
          )}
          {drawingsLabels.length > 0 && (
            <div className="cis-item">
              <span className="cis-label">Drawings</span>
              <span className="cis-value">{drawingsLabels.join(', ')}</span>
            </div>
          )}
          {formData.poNumber && (
            <div className="cis-item">
              <span className="cis-label">PO#</span>
              <span className="cis-value">{formData.poNumber}</span>
            </div>
          )}
          {formData.isRepeatJob && (
            <div className="cis-item">
              <span className="cis-label">Repeat</span>
              <span className="cis-value">{formData.repeatJobReference || 'Yes'}</span>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
