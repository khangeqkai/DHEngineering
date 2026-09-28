import { useState, useMemo } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../../services/api';
import { isActiveRecord } from '../../../../../server/src/shared/records';
import { sameName, nameMatchKey } from '../../../../../server/src/shared/names';
import { useComboboxNav } from '../useComboboxNav';

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

  const activeSuppliers = useMemo(() => suppliers.filter(isActiveRecord), [suppliers]);
  const providers = useMemo(
    () => activeSuppliers.filter(s => (s.serviceTags || []).some(t => t.value === treatmentValue)),
    [activeSuppliers, treatmentValue]
  );

  const selected = suppliers.find(s => s.id === supplierId) || null;
  const selectedRetired = !!supplierId && (!selected || !isActiveRecord(selected));
  // No supplier chosen → empty, so the box shows its "No supplier" hint rather than a
  // word that reads like a supplier's name. A retired one keeps its saved name.
  const selectedName = selected ? selected.name : (supplierName || '');

  const typed = query.trim();
  // Empty box shows the treatment's providers; typing searches all suppliers.
  const matches = useMemo(() => {
    if (!typed) return providers;
    // Same name rule as below, so "acme  coatings" still finds "Acme Coatings".
    const q = nameMatchKey(typed);
    return activeSuppliers.filter(s => nameMatchKey(s.name).includes(q));
  }, [typed, providers, activeSuppliers]);

  // A typed name already taken — by any supplier, archived ones included — under
  // the same name rule the server refuses a duplicate with (capitals and spacing
  // ignored), so "Create …" is never offered for a name the save would refuse.
  const nameTakenBy = typed ? suppliers.find(s => sameName(s.name, typed)) || null : null;
  const archivedMatch = nameTakenBy && !isActiveRecord(nameTakenBy) ? nameTakenBy : null;
  const canCreate = typed.length > 0 && !nameTakenBy;

  // Attach a treatment onto a supplier that doesn't already list it, so future
  // filtering surfaces them. Fire-and-forget; the selection still stands if it fails.
  const linkTreatment = async (supplier) => {
    if (!treatmentTagId) return;
    if ((supplier.serviceTags || []).some(t => t.value === treatmentValue)) return;
    try {
      // Only the one service is sent — never the rest of the supplier from this
      // screen's copy, which can be stale or have the contact details blanked.
      await api.addSupplierServiceTag(supplier.id, treatmentTagId);
      if (onSuppliersChanged) onSuppliersChanged();
    } catch (err) {
      // A repeat of the same failure replaces the first rather than stacking under it.
      toast.error(err.message || 'Could not link the treatment to that supplier', { id: 'supplier-link-failed' });
    }
  };

  const commit = (id) => {
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
    setFocused(false);
    onRequestCreate(typed);
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

  const showDropdown = focused && options.length > 0;

  const pickOption = (opt) => {
    if (opt.kind === 'supplier') commit(opt.supplier.id);
    else if (opt.kind === 'none') commit('');
    else requestCreate();
  };

  // Highlight index, wrap-around, reset-on-change, Enter-to-pick and Escape are
  // all shared with the job screen's other combos (useComboboxNav.js) — worked
  // from the keyboard without focus leaving the box, since moving focus into the
  // list would fire the blur that closes it. `choose` also arms the pick guard
  // below, so the blur that follows a pick (mouse or Enter) knows to stand aside
  // rather than clear the box a second time.
  const { listId, activeIndex, setActiveIndex, handleKeyDown, choose, consumePickGuard } = useComboboxNav({
    items: options,
    isOpen: showDropdown,
    onChoose: (i) => pickOption(options[i])
  });

  // A pick already cleared the box (or, for Create, left it as typed) and
  // dropped focus — the blur that follows must not also clear the query.
  const handleBlur = () => {
    if (consumePickGuard()) {
      setFocused(false);
      return;
    }
    setFocused(false);
    setQuery('');
  };

  return (
    <>
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
                onMouseDown={() => choose(i)}
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
      {/* Outside the box's own wrapper, so the caret and the list stay placed on the box. */}
      {focused && archivedMatch && (
        <p className="field-hint" role="status">
          &ldquo;{archivedMatch.name}&rdquo; is an archived supplier. Restore it on the Suppliers page to use it here.
        </p>
      )}
    </>
  );
}
