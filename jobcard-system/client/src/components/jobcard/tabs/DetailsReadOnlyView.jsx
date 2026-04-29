import {
  PRIORITY_OPTIONS,
  STATUS_OPTIONS
} from '../constants';
import { useTags } from '../../../hooks/useTags';
import { snakeToTitleCase } from '../../../utils/formatters';

function StatusBadge({ status }) {
  const opt = STATUS_OPTIONS.find(s => s.value === status);
  return <span className={`readonly-badge status-${(status || '').toLowerCase().replace('_', '-')}`}>{opt?.label || status}</span>;
}

function PriorityBadge({ priority }) {
  if (!priority || priority === 'NONE') return <span className="readonly-value">None</span>;
  const opt = PRIORITY_OPTIONS.find(p => p.value === priority);
  return <span className={`readonly-badge priority-${priority.toLowerCase()}`}>{opt?.label || priority}</span>;
}

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
  subcontracts,
  isOverdue,
  onStatusChange
}) {
  const { tags: drawingsTags } = useTags('drawings');
  const { tags: customerPropertyTags } = useTags('customer_property');
  const { tags: treatmentTags } = useTags('treatment');
  const { tags: materialTags } = useTags('material');

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

  const dueDateDisplay = formData.dueDate?.trim()
    ? new Date(formData.dueDate + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : '-';

  return (
    <div className="modal-form-grid readonly-view">
      {/* Classification */}
      <div className="form-section">
        <h3 className="form-section-title">Classification</h3>
        <div className="readonly-row">
          <div className="readonly-field">
            <span className="readonly-label">Status</span>
            {onStatusChange ? (
              <select
                value={formData.status}
                onChange={(e) => onStatusChange(e.target.value)}
                className="readonly-status-select"
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <span className="readonly-value"><StatusBadge status={formData.status} /></span>
            )}
          </div>
          <LabelValue label="Job Type" value={snakeToTitleCase(formData.jobType) || '-'} />
        </div>
      </div>

      {/* Scheduling */}
      <div className="form-section">
        <h3 className="form-section-title">Scheduling</h3>
        <div className="readonly-row">
          <LabelValue label="Priority" value={<PriorityBadge priority={formData.priority} />} />
          <div className={`readonly-field${isOverdue ? ' overdue' : ''}`}>
            <span className="readonly-label">Due Date</span>
            <span className="readonly-value">{dueDateDisplay}{isOverdue && <span className="overdue-text"> OVERDUE</span>}</span>
          </div>
        </div>
      </div>

      {/* Description */}
      {formData.description && (
        <div className="form-section">
          <h3 className="form-section-title">Job Description</h3>
          <p className="readonly-text">{formData.description}</p>
        </div>
      )}

      {/* Line Items */}
      {lineItems && lineItems.length > 0 && (
        <div className="form-section">
          <h3 className="form-section-title">Line Items</h3>
          <div className="readonly-items-list">
            {lineItems.map(item => {
              const itemTreatments = (item.treatment || '')
                .split(',')
                .filter(v => v && v !== 'NONE')
                .map(v => {
                  const opt = treatmentTags.find(t => t.value === v);
                  return opt ? opt.label : v;
                });
              if (item.treatmentOther) itemTreatments.push(item.treatmentOther);
              const materialLabel = item.material
                ? (materialTags.find(m => m.value === item.material)?.label || item.material)
                : null;
              return (
                <div key={item.id || item.itemNumber} className="readonly-item">
                  <span className="readonly-item-badge">#{item.itemNumber}</span>
                  {item.qty && <span className="readonly-item-qty">Qty: {item.qty}</span>}
                  <span className="readonly-item-desc">{item.description}</span>
                  {materialLabel && (
                    <span className="readonly-badge material">{materialLabel}</span>
                  )}
                  {itemTreatments.length > 0 && (
                    <span className="readonly-item-treatments">
                      {itemTreatments.map(label => (
                        <span key={label} className="readonly-badge treatment">{label}</span>
                      ))}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Subcontracts */}
      {subcontracts && subcontracts.length > 0 && (
        <div className="form-section">
          <h3 className="form-section-title">Subcontracts</h3>
          <div className="readonly-items-list">
            {subcontracts.map(sub => (
              <div key={sub.id} className="readonly-item">
                <span className="readonly-value">{sub.supplierName}</span>
                <span className={`readonly-badge status-${(sub.status || '').toLowerCase()}`}>{sub.status}</span>
                {sub.dateExpected && <span className="readonly-item-desc">Expected: {new Date(sub.dateExpected).toLocaleDateString()}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

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
