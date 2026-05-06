import { useState, useRef, useEffect, useMemo } from 'react';
import { Plus, X, ChevronDown } from 'lucide-react';
import { capitalizeFirst } from '../../../utils/formatters';
import { useTags } from '../../../hooks/useTags';
import { makeEmptyTreatment } from '../mappers';

function findSupplier(suppliers, supplierId) {
  return suppliers.find(s => s.id === supplierId) || null;
}

function suppliersForTreatment(suppliers, value) {
  if (!value) return suppliers;
  if (value === 'OTHER') return suppliers;
  return suppliers.filter(s => (s.serviceTags || []).some(t => t.value === value));
}

function AddTreatmentPopover({ existingValues, treatmentTags, suppliers, onAdd, onClose }) {
  const [step, setStep] = useState('treatment');
  const [chosenTreatment, setChosenTreatment] = useState(null);
  const [otherText, setOtherText] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onClose]);

  const availableTreatments = useMemo(() => {
    const opts = [...treatmentTags, { value: 'OTHER', label: 'Other', name: 'Other' }];
    return opts.filter(opt => !existingValues.includes(opt.value));
  }, [treatmentTags, existingValues]);

  const supplierList = useMemo(() => {
    if (!chosenTreatment) return [];
    return suppliersForTreatment(suppliers, chosenTreatment.value);
  }, [chosenTreatment, suppliers]);

  const handlePickTreatment = (opt) => {
    setChosenTreatment(opt);
    setStep('supplier');
  };

  const handlePickSupplier = (supplier) => {
    if (!chosenTreatment) return;
    if (chosenTreatment.value === 'OTHER' && !otherText.trim()) return;
    const treatment = makeEmptyTreatment(chosenTreatment.value, supplier);
    treatment.otherText = chosenTreatment.value === 'OTHER' ? otherText.trim() : '';
    onAdd(treatment);
    onClose();
  };

  return (
    <div className="treatment-add-popover" ref={ref}>
      {step === 'treatment' && (
        <>
          <div className="treatment-add-header">Pick treatment</div>
          {availableTreatments.length === 0 ? (
            <div className="treatment-add-empty">All treatments added.</div>
          ) : (
            <div className="treatment-add-list">
              {availableTreatments.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className="treatment-add-option"
                  onClick={() => handlePickTreatment(opt)}
                >
                  {opt.label || opt.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {step === 'supplier' && chosenTreatment && (
        <>
          <div className="treatment-add-header">
            <button
              type="button"
              className="treatment-add-back"
              onClick={() => { setStep('treatment'); setChosenTreatment(null); setOtherText(''); }}
            >&larr; Back</button>
            Pick supplier for {chosenTreatment.label || chosenTreatment.name}
          </div>
          {chosenTreatment.value === 'OTHER' && (
            <input
              type="text"
              className="treatment-add-other-input"
              placeholder="Specify treatment..."
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              onBlur={(e) => {
                const f = capitalizeFirst(e.target.value);
                if (f !== e.target.value) setOtherText(f);
              }}
              autoFocus
            />
          )}
          {supplierList.length === 0 ? (
            <div className="treatment-add-empty">No active suppliers tagged for this treatment.</div>
          ) : (
            <div className="treatment-add-list">
              {supplierList.map(s => (
                <button
                  key={s.id}
                  type="button"
                  className="treatment-add-option"
                  onClick={() => handlePickSupplier(s)}
                  disabled={chosenTreatment.value === 'OTHER' && !otherText.trim()}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TreatmentChip({ treatment, treatmentTags, suppliers, onChange, onRemove }) {
  const [supplierOpen, setSupplierOpen] = useState(false);
  const supplierRef = useRef(null);

  const treatmentLabel = useMemo(() => {
    if (treatment.value === 'OTHER') return treatment.otherText || 'Other';
    const opt = treatmentTags.find(t => t.value === treatment.value);
    return opt ? (opt.label || opt.name) : (treatment.value || '(unknown)');
  }, [treatment, treatmentTags]);

  const supplierResolved = useMemo(() => findSupplier(suppliers, treatment.supplierId), [suppliers, treatment.supplierId]);
  const supplierLabel = supplierResolved
    ? supplierResolved.name
    : (treatment.supplierName ? `${treatment.supplierName} (removed)` : '(no supplier)');

  const treatmentMissing = treatment.value !== 'OTHER' && treatment.value && !treatmentTags.some(t => t.value === treatment.value);

  const filteredSuppliers = useMemo(() => suppliersForTreatment(suppliers, treatment.value), [suppliers, treatment.value]);

  useEffect(() => {
    if (!supplierOpen) return;
    function handleClickOutside(e) {
      if (supplierRef.current && !supplierRef.current.contains(e.target)) setSupplierOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [supplierOpen]);

  const handlePickSupplier = (supplier) => {
    onChange({
      ...treatment,
      supplierId: supplier.id,
      supplierName: supplier.name
    });
    setSupplierOpen(false);
  };

  return (
    <div className={`treatment-chip${treatmentMissing ? ' treatment-chip--invalid' : ''}`}>
      <span className="treatment-chip-label">{treatmentLabel}</span>
      <span className="treatment-chip-arrow">→</span>
      <div className="treatment-chip-supplier" ref={supplierRef}>
        <button
          type="button"
          className={`treatment-chip-supplier-btn${!supplierResolved ? ' treatment-chip-supplier-btn--missing' : ''}`}
          onClick={() => setSupplierOpen(o => !o)}
          title={supplierLabel}
        >
          <span className="treatment-chip-supplier-text">{supplierLabel}</span>
          <ChevronDown size={12} />
        </button>
        {supplierOpen && (
          <div className="treatment-chip-supplier-dropdown">
            {filteredSuppliers.length === 0 ? (
              <div className="treatment-add-empty">No active suppliers</div>
            ) : (
              filteredSuppliers.map(s => (
                <button
                  key={s.id}
                  type="button"
                  className={`treatment-add-option${s.id === treatment.supplierId ? ' selected' : ''}`}
                  onClick={() => handlePickSupplier(s)}
                >
                  {s.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <button type="button" className="treatment-chip-remove" onClick={onRemove} title="Remove">
        <X size={12} />
      </button>
    </div>
  );
}

export default function TreatmentChips({ treatments = [], onChange, suppliers = [] }) {
  const { tags: treatmentTags } = useTags('treatment');
  const [adding, setAdding] = useState(false);
  const wrapperRef = useRef(null);

  // Filter treatment tags: only show those with at least one active linked supplier
  const tagsWithSupplier = useMemo(() => {
    return treatmentTags.filter(t =>
      suppliers.some(s => (s.serviceTags || []).some(st => st.value === t.value))
    );
  }, [treatmentTags, suppliers]);

  const existingValues = treatments.map(t => t.value);

  const handleAdd = (treatment) => {
    onChange([...treatments, treatment]);
  };

  const handleUpdate = (index, treatment) => {
    const next = [...treatments];
    next[index] = treatment;
    onChange(next);
  };

  const handleRemove = (index) => {
    onChange(treatments.filter((_, i) => i !== index));
  };

  return (
    <div className="treatment-chips-wrapper" ref={wrapperRef}>
      <div className="treatment-chips-list">
        {treatments.map((t, i) => (
          <TreatmentChip
            key={i}
            treatment={t}
            treatmentTags={treatmentTags}
            suppliers={suppliers}
            onChange={(updated) => handleUpdate(i, updated)}
            onRemove={() => handleRemove(i)}
          />
        ))}
        <div className="treatment-chip-add-wrapper">
          <button
            type="button"
            className="treatment-chip-add"
            onClick={() => setAdding(o => !o)}
            aria-label="Add treatment"
            title="Add treatment"
          >
            <Plus size={14} />
          </button>
          {adding && (
            <AddTreatmentPopover
              existingValues={existingValues}
              treatmentTags={tagsWithSupplier}
              suppliers={suppliers}
              onAdd={handleAdd}
              onClose={() => setAdding(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
