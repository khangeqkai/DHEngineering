import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Plus, ChevronDown } from 'lucide-react';
import { capitalizeFirst } from '../../../utils/formatters';
import { TREATMENT_OPTIONS } from '../constants';

const SELECTABLE_TREATMENTS = TREATMENT_OPTIONS.filter(o => o.value !== 'NONE');

function TreatmentMultiSelect({ selected, treatmentOther, onToggle, onOtherChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const values = selected ? selected.split(',').filter(v => v && v !== 'NONE') : [];

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open]);

  const toggle = (val) => {
    const current = new Set(values);
    if (current.has(val)) {
      current.delete(val);
    } else {
      current.add(val);
    }
    onToggle([...current].join(',') || '');
  };

  const labels = values
    .filter(v => v !== 'OTHER')
    .map(v => {
      const opt = SELECTABLE_TREATMENTS.find(t => t.value === v);
      return opt ? opt.label : v;
    });
  if (values.includes('OTHER') && treatmentOther) {
    labels.push(treatmentOther);
  } else if (values.includes('OTHER')) {
    labels.push('Other');
  }

  return (
    <div className="treatment-multiselect" ref={ref}>
      <button
        type="button"
        className={`treatment-multiselect-trigger${values.length > 0 ? ' has-values' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <span className="treatment-multiselect-text">
          {labels.length > 0 ? labels.join(', ') : 'No treatment'}
        </span>
        <ChevronDown size={14} className={`treatment-chevron${open ? ' open' : ''}`} />
      </button>
      {open && (
        <div className="treatment-multiselect-dropdown">
          {SELECTABLE_TREATMENTS.map(opt => (
            <label key={opt.value} className={`treatment-option${values.includes(opt.value) ? ' selected' : ''}`}>
              <input
                type="checkbox"
                checked={values.includes(opt.value)}
                onChange={() => toggle(opt.value)}
              />
              {opt.label}
            </label>
          ))}
          {values.includes('OTHER') && (
            <input
              type="text"
              className="treatment-other-input"
              value={treatmentOther || ''}
              onChange={(e) => onOtherChange(e.target.value)}
              onBlur={(e) => {
                const f = capitalizeFirst(e.target.value);
                if (f !== e.target.value) onOtherChange(f);
              }}
              placeholder="Specify other..."
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function ItemsTab({
  lineItems,
  addLineItem,
  updateLineItem,
  removeLineItem
}) {
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
                <div className="line-item-treatment">
                  <label>Treatment</label>
                  <TreatmentMultiSelect
                    selected={item.treatment}
                    treatmentOther={item.treatmentOther}
                    onToggle={(val) => updateLineItem(item.id, 'treatment', val)}
                    onOtherChange={(val) => updateLineItem(item.id, 'treatmentOther', val)}
                  />
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
