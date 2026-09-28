import { useState, useId, useMemo, useEffect } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { toTitleCase, capitalizeFirst } from '../../utils/formatters';
import { useFieldErrors, scrollFieldIntoView, showSaveRefusal } from '../../hooks/useFieldErrors';
import FieldError from './FieldError';

// The full add-supplier form, shown inline inside a line item so a supplier can be
// created on the spot while picking a treatment. Collects the same fields as the
// supplier admin page and uses the app's standard titled-card form idiom (matching
// the inline time-entry form). On save it creates the supplier already linked to the
// given treatment (so the treatment lands in the new supplier's "Services Provided"),
// then hands the created supplier back to the caller.
// Which box on this form each field named in a server refusal belongs to (a name
// clash names 'name'; a malformed phone or email names its own field). A box's
// name is also its on-page id, so it is built per form (`${prefix}supplierName`) —
// two parts can each have one of these open at once, and a fixed id would send a
// label, an error link or the scroll-into-view lookup to the other part's form.
const boxNamesFor = (prefix) => ({
  name: `${prefix}supplierName`,
  contactName: `${prefix}supplierContactName`,
  contactPhone: `${prefix}supplierContactPhone`,
  contactEmail: `${prefix}supplierContactEmail`,
  address: `${prefix}supplierAddress`,
  notes: `${prefix}supplierNotes`
});

export default function InlineSupplierForm({ initialName = '', treatmentTagId, onCreated, onCancel, onDraftChange }) {
  const prefix = useId();
  const box = useMemo(() => boxNamesFor(prefix), [prefix]);
  const [form, setForm] = useState({
    name: initialName,
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    address: '',
    notes: ''
  });
  const [saving, setSaving] = useState(false);
  const { setFieldErrors, groupClass, errorFor, fieldProps, errorProps } = useFieldErrors(
    (name) => form[Object.keys(box).find(field => box[field] === name)]
  );
  const supplierBoxes = { name: box.name, contactPhone: box.contactPhone, contactEmail: box.contactEmail };

  // Tells the job screen whether this form holds typing that would be lost if the
  // form went away (closing the job, leaving the Details tab, signing out) — the
  // form keeps what is typed only inside itself, so nothing else can see it.
  const hasTyping = Object.values(form).some(value => value.trim() !== '');
  useEffect(() => {
    onDraftChange?.(hasTyping);
  }, [hasTyping, onDraftChange]);
  // Gone (saved, cancelled, or the part removed) — nothing left to report.
  useEffect(() => () => onDraftChange?.(false), [onDraftChange]);

  const set = (field, val) => setForm(prev => ({ ...prev, [field]: val }));

  // Auto-format names/text when leaving a field (project convention). Phone/email
  // are left untouched.
  const formatOnBlur = (field, fn) => (e) => {
    const formatted = fn(e.target.value);
    if (formatted !== e.target.value) set(field, formatted);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFieldErrors({ [box.name]: 'Company name is required' });
      scrollFieldIntoView(box.name);
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const supplier = await api.createSupplier({
        name: form.name.trim(),
        contactName: form.contactName.trim() || null,
        contactPhone: form.contactPhone.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
        serviceTagIds: treatmentTagId ? [treatmentTagId] : []
      });
      toast.success('Supplier updated');
      onCreated(supplier);
    } catch (err) {
      showSaveRefusal(err, { boxFor: supplierBoxes, setFieldErrors, fallback: 'Could not add that supplier' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="inline-supplier-form">
      <div className="form-section-header">
        <h3 className="form-section-title">New supplier</h3>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>

      <div className="inline-supplier-form-body">
        <div className={groupClass(box.name)}>
          <label htmlFor={box.name}>Company Name <span className="required">*</span></label>
          <input
            type="text"
            {...fieldProps(box.name)}
            value={form.name}
            autoFocus
            onChange={(e) => set('name', e.target.value)}
            onBlur={formatOnBlur('name', toTitleCase)}
          />
          <FieldError {...errorProps(box.name)} message={errorFor(box.name)} />
        </div>

        <div className="form-group">
          <label htmlFor={box.contactName}>Contact Name</label>
          <input
            type="text"
            id={box.contactName}
            value={form.contactName}
            onChange={(e) => set('contactName', e.target.value)}
            onBlur={formatOnBlur('contactName', toTitleCase)}
          />
        </div>

        <div className={groupClass(box.contactPhone)}>
          <label htmlFor={box.contactPhone}>Phone</label>
          <input type="tel" {...fieldProps(box.contactPhone)} value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} />
          <FieldError {...errorProps(box.contactPhone)} message={errorFor(box.contactPhone)} />
        </div>

        <div className={groupClass(box.contactEmail)}>
          <label htmlFor={box.contactEmail}>Email</label>
          {/* Plain text, not type="email" (and no `required` on the name above): this
              form sits inside the job form, and a browser-checked box would veto the
              job's own Create with a native bubble. The name check is the app's own. */}
          <input type="text" inputMode="email" {...fieldProps(box.contactEmail)} value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
          <FieldError {...errorProps(box.contactEmail)} message={errorFor(box.contactEmail)} />
        </div>

        <div className="form-group">
          <label htmlFor={box.address}>Address</label>
          <textarea
            rows={2}
            id={box.address}
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
            onBlur={formatOnBlur('address', capitalizeFirst)}
          />
        </div>

        <div className="form-group">
          <label htmlFor={box.notes}>Notes</label>
          <textarea
            rows={2}
            id={box.notes}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            onBlur={formatOnBlur('notes', capitalizeFirst)}
          />
        </div>

        <div className="inline-supplier-form-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save supplier'}
          </button>
        </div>
      </div>
    </div>
  );
}
