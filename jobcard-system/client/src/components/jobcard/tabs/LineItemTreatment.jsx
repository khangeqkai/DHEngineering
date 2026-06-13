import { useMemo } from 'react';
import { useTags } from '../../../hooks/useTags';
import { capitalizeFirst } from '../../../utils/formatters';

const OTHER = 'OTHER';

function isActive(s) {
  return s.active === 1 || s.active === true;
}

// Whether a supplier offers a given treatment. 'Other' (free-text) works with any
// supplier, so it always matches.
function supplierOffers(supplier, treatmentValue) {
  if (!treatmentValue || treatmentValue === OTHER) return true;
  return (supplier.serviceTags || []).some(t => t.value === treatmentValue);
}

// Per-line-item Treatment + Supplier. Treatment is the primary choice and is
// shown first; the Supplier dropdown only appears once a treatment is picked
// (no treatment → no supplier needed), narrowed to suppliers who offer that
// treatment, with a supplier then required. One pair per part. Stored as the
// line item's `treatments` array (length 0 or 1) so the rest of the system
// (costing, PDF fill, history) is unchanged.
export default function LineItemTreatment({ treatments = [], suppliers = [], onChange }) {
  const { tags: treatmentTags, labelOf: treatmentLabelOf } = useTags('treatment');

  const current = (Array.isArray(treatments) && treatments[0]) || null;
  const value = current?.value || '';
  const supplierId = current?.supplierId || '';
  const otherText = current?.otherText || '';

  const activeSuppliers = useMemo(() => suppliers.filter(isActive), [suppliers]);

  // Treatment list: only treatments that at least one active supplier offers.
  // 'Other' is always offered, and the current pick is always kept visible.
  const treatmentOptions = useMemo(() => {
    const base = treatmentTags.filter(t => activeSuppliers.some(s => supplierOffers(s, t.value)));
    const list = base.map(t => ({ value: t.value, label: t.label || t.name }));
    list.push({ value: OTHER, label: 'Other' });
    if (value && value !== OTHER && !list.some(o => o.value === value)) {
      const tag = treatmentTags.find(t => t.value === value);
      // No matching active tag → the treatment was archived; show it tagged "(retired)".
      list.unshift(tag
        ? { value, label: tag.label || tag.name }
        : { value, label: `${treatmentLabelOf(value)} (retired)`, retired: true });
    }
    return list;
  }, [treatmentTags, treatmentLabelOf, activeSuppliers, value]);

  // Supplier list: filtered by the chosen treatment (who offers it), or all active
  // suppliers when none / 'Other' is chosen. The current pick is always kept.
  const supplierOptions = useMemo(() => {
    const base = (value && value !== OTHER)
      ? activeSuppliers.filter(s => supplierOffers(s, value))
      : activeSuppliers;
    const list = base.map(s => ({ value: s.id, label: s.name }));
    if (supplierId && !list.some(o => o.value === supplierId)) {
      // The saved supplier isn't in the active list — it was archived. Keep it visible and
      // tagged "(retired)", matching how a retired treatment reads. Use the live name when
      // we still have the record, falling back to the name frozen on the job.
      const s = suppliers.find(x => x.id === supplierId);
      const name = s ? s.name : (current?.supplierName || 'Unknown');
      list.unshift({ value: supplierId, label: `${name} (retired)`, retired: true });
    }
    return list;
  }, [activeSuppliers, suppliers, value, supplierId, current]);

  const emit = (next) => {
    const v = next.value !== undefined ? next.value : value;
    const sid = next.supplierId !== undefined ? next.supplierId : supplierId;
    const ot = next.otherText !== undefined ? next.otherText : otherText;
    if (!v && !sid) {
      onChange([]);
      return;
    }
    const supplier = suppliers.find(s => s.id === sid) || null;
    onChange([{
      value: v,
      otherText: v === OTHER ? ot : '',
      supplierId: sid,
      supplierName: supplier ? supplier.name : (sid ? (current?.supplierName || '') : '')
    }]);
  };

  const handleTreatmentChange = (newVal) => {
    // "No treatment" clears the supplier too — otherwise the part keeps a dangling
    // supplier with no treatment, an invalid half-entry the server rejects on save.
    if (!newVal) {
      emit({ value: '', supplierId: '' });
      return;
    }
    // Drop the supplier if it doesn't offer the newly chosen treatment.
    let sid = supplierId;
    if (newVal !== OTHER && sid) {
      const s = suppliers.find(x => x.id === sid);
      if (s && !supplierOffers(s, newVal)) sid = '';
    }
    emit({ value: newVal, supplierId: sid });
  };

  const handleSupplierChange = (newSid) => {
    // The supplier list is already filtered to suppliers that offer the chosen
    // treatment, so the picked supplier always matches the current treatment.
    emit({ supplierId: newSid });
  };

  return (
    <>
      <div className="line-item-treatment-field">
        <label>Treatment</label>
        <select
          className={treatmentOptions.some(o => o.retired && o.value === value) ? 'has-retired' : ''}
          value={value}
          onChange={(e) => handleTreatmentChange(e.target.value)}
        >
          <option value="">No treatment</option>
          {treatmentOptions.map(o => (
            <option key={o.value} value={o.value} className={o.retired ? 'retired-option' : ''}>{o.label}</option>
          ))}
        </select>
      </div>

      {value && (
        <div className="line-item-treatment-field">
          <label>Supplier <span className="required">*</span></label>
          <select
            value={supplierId}
            onChange={(e) => handleSupplierChange(e.target.value)}
            className={`${!supplierId ? 'field-required' : ''}${supplierOptions.some(o => o.retired && o.value === supplierId) ? ' has-retired' : ''}`.trim()}
          >
            <option value="">No supplier</option>
            {supplierOptions.map(o => (
              <option key={o.value} value={o.value} className={o.retired ? 'retired-option' : ''}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      {value === OTHER && (
        <div className="line-item-treatment-field">
          <label>Specify</label>
          <input
            type="text"
            value={otherText}
            placeholder="Treatment name…"
            onChange={(e) => emit({ otherText: e.target.value })}
            onBlur={(e) => {
              const f = capitalizeFirst(e.target.value);
              if (f !== e.target.value) emit({ otherText: f });
            }}
          />
        </div>
      )}
    </>
  );
}
