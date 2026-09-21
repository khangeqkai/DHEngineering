import { useState, useMemo, useRef, useEffect, useId } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
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
  id,
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
  // No supplier chosen → empty, so the box shows its "No supplier" hint rather than a
  // word that reads like a supplier's name. A retired one keeps its saved name.
  const selectedName = selected ? selected.name : (supplierName || '');

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
      // A repeat of the same failure replaces the first rather than stacking under it.
      toast.error(err.message || 'Could not link the treatment to that supplier', { id: 'supplier-link-failed' });
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

  // One list for every row the dropdown can show — the suppliers, the "No supplier"
  // choice and the "create this one" row — so the arrow keys walk all of them in the
  // order they are read, rather than only the part that happens to be suppliers.
  const options = useMemo(() => {
    const rows = matches.map(s => ({ key: `supplier-${s.id}`, kind: 'supplier', supplier: s }));
    if (!required && supplierId) rows.push({ key: 'none', kind: 'none' });
    if (canCreate) rows.push({ key: 'create', kind: 'create' });
    return rows;
  }, [matches, required, supplierId, canCreate]);

  const listId = useId();
  const [activeIndex, setActiveIndex] = useState(-1);
  // A changed list starts with nothing highlighted — keeping the old position would
  // point the keyboard at a different supplier than the one that was under it.
  useEffect(() => { setActiveIndex(-1); }, [options]);

  const showDropdown = focused && options.length > 0;

  const choose = (opt) => {
    if (opt.kind === 'supplier') commit(opt.supplier.id);
    else if (opt.kind === 'none') commit('');
    else requestCreate();
  };

  // Worked from the keyboard without focus leaving the box: moving focus into the
  // list would fire the blur that closes it.
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); e.target.blur(); return; }
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => (i < options.length - 1 ? i + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => (i > 0 ? i - 1 : options.length - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      choose(options[activeIndex]);
    }
  };

  return (
    <div className="autocomplete-container">
      <input
        id={id}
        type="text"
        value={inputValue}
        onChange={(e) => { setQuery(e.target.value); setFocused(true); }}
        onFocus={() => { setFocused(true); setQuery(''); }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        placeholder={required ? 'Choose or add a supplier…' : 'No supplier'}
        className={selectedRetired ? 'has-retired' : ''}
      />
      <ChevronDown size={14} className={`autocomplete-caret${focused ? ' is-open' : ''}`} />
      {showDropdown && (
        <div className="customer-dropdown" id={listId} role="listbox" aria-label="Matching suppliers">
          {options.map((opt, i) => (
            <div
              key={opt.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`customer-option${i === activeIndex ? ' is-active' : ''}`}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={() => choose(opt)}
            >
              {opt.kind === 'supplier' && <strong>{opt.supplier.name}</strong>}
              {opt.kind === 'none' && <em>No supplier</em>}
              {opt.kind === 'create' && (
                <span className="customer-option-create">
                  <Plus size={14} /> Create &ldquo;{typed}&rdquo; as a new supplier
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
