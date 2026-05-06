import { useTags } from '../../../hooks/useTags';
import ItemsTab from './ItemsTab';

function LabelValue({ label, value, className }) {
  return (
    <div className={`readonly-field ${className || ''}`}>
      <span className="readonly-label">{label}</span>
      <span className="readonly-value">{value || '-'}</span>
    </div>
  );
}

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
          <div className="readonly-badges">
            {assignees.map(a => (
              <span key={a.userId} className="readonly-badge assignee">{a.userName || a.username}</span>
            ))}
          </div>
        </div>
      )}

      {/* Customer Input */}
      <div className="form-section">
        <h3 className="form-section-title">Customer Input</h3>
        <div className="readonly-row">
          <LabelValue label="Quality Level" value={formData.qualityLevel || 'STANDARD'} />
        </div>
        {customerPropertyLabels.length > 0 && (
          <div className="readonly-row">
            <LabelValue label="Customer Property" value={customerPropertyLabels.join(', ')} />
          </div>
        )}
        {drawingsLabels.length > 0 && (
          <div className="readonly-row">
            <LabelValue label="Drawings" value={drawingsLabels.join(', ')} />
          </div>
        )}
        {formData.poNumber && (
          <div className="readonly-row">
            <LabelValue label="Customer's PO Number" value={formData.poNumber} />
          </div>
        )}
        {formData.isRepeatJob && (
          <div className="readonly-row">
            <LabelValue label="Repeat Job" value={formData.repeatJobReference || 'Yes'} />
          </div>
        )}
      </div>

    </div>
  );
}
