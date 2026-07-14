import { useState, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../../services/api';

function isActive(s) {
  return s.active === 1 || s.active === true;
}

// Search/select control for one line item's supplier. By default it lists only the
// suppliers that provide the chosen treatment (their "Services Provided" includes
// it); typing searches across every supplier so an existing one can be attached to a
// brand-new treatment. If the typed name matches no one, a "Create" row asks the
// parent to open the full supplier form. Attaching a supplier that doesn't yet
// provide this treatment records the treatment onto that supplier so the filter
// learns it. `required` (a brand-new treatment) drops the "No supplier" choice.
export default function LineItemSupplierPicker({
  treatmentValue,
  treatmentTagId,
  suppliers = [],
  supplierId = '',
  supplierName = '',
  required = false,
  onChange,
  onRequestCreate,
  onSuppliersChanged
}) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const committingRef = useRef(false);

  const activeSuppliers = useMemo(() => suppliers.filter(isActive), [suppliers]);
  const providers = useMemo(
    () => activeSuppliers.filter(s => (s.serviceTags || []).some(t => t.value === treatmentValue)),
    [activeSuppliers, treatmentValue]
  );

  const selected = suppliers.find(s => s.id === supplierId) || null;
  const selectedRetired = !!supplierId && (!selected || !isActive(selected));
  const selectedName = selected ? selected.name : (supplierName || 'Unknown');

  const typed = query.trim();
  // Empty box shows the treatment's providers; typing searches all suppliers.
  const matches = useMemo(() => {
    if (!typed) return providers;
    const q = typed.toLowerCase();
    return activeSuppliers.filter(s => (s.name || '').toLowerCase().includes(q));
  }, [typed, providers, activeSuppliers]);

  const exactMatch = activeSuppliers.some(s => (s.name || '').toLowerCase() === typed.toLowerCase());
  const canCreate = typed.length > 0 && !exactMatch;

  // Attach a treatment onto a supplier that doesn't already list it, so future
  // filtering surfaces them. Fire-and-forget; the selection still stands if it fails.
  const linkTreatment = async (supplier) => {
    if (!treatmentTagId) return;
    if ((supplier.serviceTags || []).some(t => t.value === treatmentValue)) return;
    try {
      const ids = [...(supplier.serviceTags || []).map(t => t.id), treatmentTagId];
      await api.updateSupplier(supplier.id, {
        name: supplier.name,
        contactName: supplier.contactName ?? null,
        contactPhone: supplier.contactPhone ?? null,
        contactEmail: supplier.contactEmail ?? null,
        address: supplier.address ?? null,
        notes: supplier.notes ?? null,
        serviceTagIds: ids
      });
      if (onSuppliersChanged) onSuppliersChanged();
    } catch (err) {
      toast.error(err.message || 'Could not link the treatment to that supplier');
    }
  };

  const commit = (id) => {
    committingRef.current = true;
    setQuery('');
    setFocused(false);
    if (!id) {
      onChange('', '');
      return;
    }
    const supplier = suppliers.find(s => s.id === id) || null;
    onChange(id, supplier ? supplier.name : '');
    if (supplier) linkTreatment(supplier);
  };

  const requestCreate = () => {
    committingRef.current = true;
    setFocused(false);
    onRequestCreate(typed);
  };

  const handleBlur = () => {
    if (committingRef.current) {
      committingRef.current = false;
      setFocused(false);
      return;
    }
    setFocused(false);
    setQuery('');
  };

  const inputValue = focused ? query : (selectedRetired ? `${selectedName} (retired)` : selectedName);
  const showDropdown = focused && (matches.length > 0 || canCreate || (!required && !!supplierId));

  return (
    <div className="autocomplete-container">
      <input
        type="text"
        value={inputValue}
        onChange={(e) => { setQuery(e.target.value); setFocused(true); }}
        onFocus={() => { setFocused(true); setQuery(''); }}
        onBlur={handleBlur}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); e.target.blur(); } }}
        placeholder={required ? 'Choose or add a supplier…' : 'No supplier'}
        className={selectedRetired ? 'has-retired' : ''}
      />
      {showDropdown && (
        <div className="customer-dropdown">
          {matches.map(s => (
            <div key={s.id} className="customer-option" onMouseDown={() => commit(s.id)}>
              <strong>{s.name}</strong>
            </div>
          ))}
          {!required && supplierId && (
            <div className="customer-option" onMouseDown={() => commit('')}>
              <em>No supplier</em>
            </div>
          )}
          {canCreate && (
            <div className="customer-option" onMouseDown={requestCreate}>
              ＋ Create &ldquo;{typed}&rdquo; as a new supplier
            </div>
          )}
        </div>
      )}
    </div>
  );
}
