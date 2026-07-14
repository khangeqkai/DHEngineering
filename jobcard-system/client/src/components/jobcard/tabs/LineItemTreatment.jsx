import { useState, useEffect, useRef } from 'react';
import CreatableTagSelect from '../../common/CreatableTagSelect';
import LineItemSupplierPicker from './LineItemSupplierPicker';
import InlineSupplierForm from '../../common/InlineSupplierForm';
import { useTags } from '../../../hooks/useTags';

function isActive(s) {
  return s.active === 1 || s.active === true;
}

// Per-line-item Treatment + Supplier. Treatment is a type-or-create picker (any
// treatment, plus add-a-new-one on the spot) shown first. Once a treatment is
// picked, the Supplier picker appears: it lists the suppliers that provide that
// treatment, lets you search all suppliers, and can create a new supplier on the
// spot (attaching the treatment to it). A brand-new treatment requires a supplier.
// One pair per part, stored as the line item's `treatments` array (length 0 or 1)
// so the rest of the system (costing, PDF fill, history) is unchanged.
export default function LineItemTreatment({ treatments = [], suppliers = [], onChange, onSuppliersChanged }) {
  const { rawTags } = useTags('treatment');
  const current = (Array.isArray(treatments) && treatments[0]) || null;
  const value = current?.value || '';
  const supplierId = current?.supplierId || '';

  // Remember the treatment created fresh on this part. We keep the whole tag object
  // (not just the value) so we have its id immediately — this part's copy of the
  // treatment list may not have refreshed to include the brand-new option yet. Used
  // both to require a supplier (optional for treatments that already existed) and to
  // link the treatment onto the chosen/created supplier.
  const [createdTag, setCreatedTag] = useState(null);
  const createdValue = createdTag?.value || '';
  const supplierRequired = !!value && value === createdValue && !supplierId;

  const treatmentTagId = (createdTag && createdTag.value === value)
    ? createdTag.id
    : (rawTags.find(t => t.value === value)?.id || null);
  const providerCount = suppliers.filter(
    s => isActive(s) && (s.serviceTags || []).some(t => t.value === value)
  ).length;

  // Whether the inline "add supplier" form is showing in place of the picker.
  const [creating, setCreating] = useState(false);
  const [pendingName, setPendingName] = useState('');
  // Set when the user cancels the form, so it doesn't immediately reopen.
  const dismissedRef = useRef(false);

  // A brand-new treatment has nobody who provides it yet, so open the add-supplier
  // form straight away. The dismiss guard lets the user cancel back to the picker.
  useEffect(() => {
    if (supplierRequired && providerCount === 0 && !dismissedRef.current) {
      setPendingName('');
      setCreating(true);
    }
  }, [supplierRequired, providerCount]);

  const emit = (next) => {
    const v = next.value !== undefined ? next.value : value;
    const sid = next.supplierId !== undefined ? next.supplierId : supplierId;
    const sname = next.supplierName !== undefined ? next.supplierName : (current?.supplierName || '');
    if (!v && !sid) {
      onChange([]);
      return;
    }
    onChange([{ value: v, supplierId: sid, supplierName: sid ? sname : '' }]);
  };

  const handleTreatmentChange = (newVal) => {
    // Switching/clearing the treatment drops the supplier too — otherwise the part
    // keeps a supplier that no longer matches the treatment.
    if (newVal !== value) {
      if (newVal !== createdValue) setCreatedTag(null);
      dismissedRef.current = false;
      setCreating(false);
      emit({ value: newVal || '', supplierId: '', supplierName: '' });
    }
  };

  const handleSupplierCreated = (supplier) => {
    setCreating(false);
    emit({ supplierId: supplier.id, supplierName: supplier.name });
    if (onSuppliersChanged) onSuppliersChanged();
  };

  return (
    <>
      <div className="line-item-treatment-field">
        <label>Treatment</label>
        <CreatableTagSelect
          category="treatment"
          value={value}
          onChange={handleTreatmentChange}
          onCreate={(tag) => setCreatedTag(tag)}
          placeholder="Type or add a treatment…"
        />
      </div>

      {value && (
        creating ? (
          <div className="line-item-supplier-form-wrap">
            <InlineSupplierForm
              initialName={pendingName}
              treatmentTagId={treatmentTagId}
              onCreated={handleSupplierCreated}
              onCancel={() => { dismissedRef.current = true; setCreating(false); }}
            />
          </div>
        ) : (
          <div className="line-item-treatment-field">
            <label>Supplier{supplierRequired ? <span className="required"> *</span> : ''}</label>
            <LineItemSupplierPicker
              treatmentValue={value}
              treatmentTagId={treatmentTagId}
              suppliers={suppliers}
              supplierId={supplierId}
              supplierName={current?.supplierName || ''}
              required={supplierRequired}
              onChange={(sid, sname) => emit({ supplierId: sid, supplierName: sname })}
              onRequestCreate={(name) => { setPendingName(name); dismissedRef.current = false; setCreating(true); }}
              onSuppliersChanged={onSuppliersChanged}
            />
          </div>
        )
      )}
    </>
  );
}
