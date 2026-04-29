import { X, Plus } from 'lucide-react';
import { capitalizeFirst } from '../../../utils/formatters';
import { useTags } from '../../../hooks/useTags';
import TreatmentChips from './TreatmentChips';

export default function ItemsTab({
  lineItems,
  addLineItem,
  updateLineItem,
  removeLineItem,
  suppliers = []
}) {
  const { tags: materialTags } = useTags('material');
  const { tags: jobTypeTags } = useTags('job_type');

  return (
    <div className="modal-form-grid">
      <div className="form-section">
        <div className="form-section-header">
          <h3 className="form-section-title">Line Items <span className="required">*</span></h3>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addLineItem}><Plus size={14} /> Add Item</button>
        </div>
        <div className="line-items-list">
          {lineItems.map(item => (
            <div key={item.id} className="line-item-card">
              <div className="line-item-badge">#{item.itemNumber}</div>
              <div className="line-item-fields">
                <div className="line-item-job-type">
                  <label>Job Type <span className="required">*</span></label>
                  <select
                    value={item.jobType || ''}
                    onChange={(e) => updateLineItem(item.id, 'jobType', e.target.value)}
                    className={!item.jobType ? 'field-required' : ''}
                  >
                    <option value="">Select...</option>
                    {jobTypeTags.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="line-item-qty">
                  <label>Qty</label>
                  <input
                    type="text"
                    value={item.qty}
                    onChange={(e) => updateLineItem(item.id, 'qty', e.target.value)}
                    placeholder="-"
                  />
                </div>
                <div className="line-item-desc">
                  <label>Description</label>
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
                </div>
                <div className="line-item-material">
                  <label>Material</label>
                  <select
                    value={item.material || ''}
                    onChange={(e) => updateLineItem(item.id, 'material', e.target.value)}
                  >
                    <option value="">No material</option>
                    {materialTags.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="line-item-treatment">
                  <label>Treatment &amp; Supplier</label>
                  <TreatmentChips
                    treatments={Array.isArray(item.treatments) ? item.treatments : []}
                    suppliers={suppliers}
                    onChange={(arr) => updateLineItem(item.id, 'treatments', arr)}
                  />
                </div>
              </div>
              {lineItems.length > 1 && (
                <button type="button" className="line-item-remove" onClick={() => removeLineItem(item.id)} title="Remove item"><X size={14} /></button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
