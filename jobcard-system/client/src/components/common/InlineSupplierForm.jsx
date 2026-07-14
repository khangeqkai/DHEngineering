import { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { toTitleCase, capitalizeFirst } from '../../utils/formatters';

// The full add-supplier form, shown inline inside a line item so a supplier can be
// created on the spot while picking a treatment. Collects the same fields as the
// supplier admin page and uses the app's standard titled-card form idiom (matching
// the inline time-entry form). On save it creates the supplier already linked to the
// given treatment (so the treatment lands in the new supplier's "Services Provided"),
// then hands the created supplier back to the caller.
export default function InlineSupplierForm({ initialName = '', treatmentTagId, onCreated, onCancel }) {
  const [form, setForm] = useState({
    name: initialName,
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    address: '',
    notes: ''
  });
  const [saving, setSaving] = useState(false);

  const set = (field, val) => setForm(prev => ({ ...prev, [field]: val }));

  // Auto-format names/text when leaving a field (project convention). Phone/email
  // are left untouched.
  const formatOnBlur = (field, fn) => (e) => {
    const formatted = fn(e.target.value);
    if (formatted !== e.target.value) set(field, formatted);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Company name is required');
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
      toast.success('Supplier added');
      onCreated(supplier);
    } catch (err) {
      toast.error(err.message || 'Could not add that supplier');
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
        <div className="form-group">
          <label>Company Name <span className="required">*</span></label>
          <input
            type="text"
            value={form.name}
            autoFocus
            onChange={(e) => set('name', e.target.value)}
            onBlur={formatOnBlur('name', toTitleCase)}
          />
        </div>

        <div className="form-group">
          <label>Contact Name</label>
          <input
            type="text"
            value={form.contactName}
            onChange={(e) => set('contactName', e.target.value)}
            onBlur={formatOnBlur('contactName', toTitleCase)}
          />
        </div>

        <div className="form-group">
          <label>Phone</label>
          <input type="tel" value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} />
        </div>

        <div className="form-group">
          <label>Email</label>
          <input type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
        </div>

        <div className="form-group">
          <label>Address</label>
          <textarea
            rows={2}
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
            onBlur={formatOnBlur('address', capitalizeFirst)}
          />
        </div>

        <div className="form-group">
          <label>Notes</label>
          <textarea
            rows={2}
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
