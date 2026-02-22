import { useState, useRef, useEffect, useMemo, useCallback } from 'react';

export default function SearchableSupplierSelect({
  suppliers,
  value,
  onChange,
  treatmentServiceName,
  placeholder = 'Search supplier...'
}) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const blurTimeout = useRef(null);

  // Sync input display with selected value
  useEffect(() => {
    if (value) {
      const selected = suppliers.find(s => String(s.id) === String(value));
      setInputValue(selected ? selected.name : '');
    } else {
      setInputValue('');
    }
  }, [value, suppliers]);

  // Close on outside click
  useEffect(() => {
    const handleMouseDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // Sort suppliers: matching service first, then alphabetically
  const sortedSuppliers = useMemo(() => {
    if (!treatmentServiceName) return suppliers;
    return [...suppliers].sort((a, b) => {
      const aHas = (a.serviceTags || []).some(t => t.name === treatmentServiceName);
      const bHas = (b.serviceTags || []).some(t => t.name === treatmentServiceName);
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [suppliers, treatmentServiceName]);

  // Filter based on typed input
  const filtered = useMemo(() => {
    const query = inputValue.trim().toLowerCase();
    // If input matches the selected supplier name exactly, show all (user just focused)
    const selected = suppliers.find(s => String(s.id) === String(value));
    if (selected && selected.name === inputValue) {
      return sortedSuppliers.slice(0, 10);
    }
    if (!query) return sortedSuppliers.slice(0, 10);
    return sortedSuppliers.filter(s => s.name.toLowerCase().includes(query)).slice(0, 10);
  }, [inputValue, sortedSuppliers, suppliers, value]);

  const handleFocus = useCallback(() => {
    clearTimeout(blurTimeout.current);
    setIsOpen(true);
  }, []);

  const handleBlur = useCallback(() => {
    blurTimeout.current = setTimeout(() => setIsOpen(false), 200);
  }, []);

  const handleInputChange = useCallback((e) => {
    setInputValue(e.target.value);
    setIsOpen(true);
    // Clear selection when user types something different
    if (value) {
      const selected = suppliers.find(s => String(s.id) === String(value));
      if (selected && selected.name !== e.target.value) {
        onChange('', '');
      }
    }
  }, [value, suppliers, onChange]);

  const handleSelect = useCallback((supplier) => {
    onChange(String(supplier.id), supplier.name);
    setInputValue(supplier.name);
    setIsOpen(false);
  }, [onChange]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      e.target.blur();
    }
  }, []);

  return (
    <div className="autocomplete-container" ref={containerRef}>
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
      />
      {isOpen && filtered.length > 0 && (
        <div className="customer-dropdown">
          {filtered.map(s => {
            const hasMatch = treatmentServiceName &&
              (s.serviceTags || []).some(t => t.name === treatmentServiceName);
            const serviceNames = (s.serviceTags || []).map(t => t.name).join(', ');
            return (
              <div
                key={s.id}
                className="customer-option"
                onMouseDown={() => handleSelect(s)}
              >
                <span>{hasMatch ? '★ ' : ''}{s.name}</span>
                {serviceNames && (
                  <span style={{ fontSize: 'var(--text-xs)', opacity: 0.7 }}>{serviceNames}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
