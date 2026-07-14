import { useState, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { useTags, invalidateTagCache } from '../../hooks/useTags';
import { toTitleCase } from '../../utils/formatters';

// A type-to-search picker for a tag category (e.g. material, treatment) that can
// also create a brand-new option on the spot — mirroring how the customer/company
// box works. Type a name: matching options appear; if what you typed isn't a real
// option yet, a "Create …" row lets you add it and it's selected immediately.
// Creation is dedup-safe: the server returns the existing option when the typed
// name already maps to one, so you never get a duplicate.
export default function CreatableTagSelect({ category, value, onChange, onCreate, placeholder = '', disabled = false }) {
  const { tags, labelOf, refresh } = useTags(category);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [creating, setCreating] = useState(false);
  // Options commit on mousedown (before the input's blur); this guards the blur
  // handler so it doesn't clear the value we just picked.
  const committingRef = useRef(false);

  const selectedLabel = value ? labelOf(value) : '';
  // A saved value that's no longer an active option was archived — show it tagged
  // "(retired)" like the plain dropdowns do.
  const isRetired = value && !tags.some(o => o.value === value);

  const typed = query.trim();
  const filtered = useMemo(() => {
    const q = typed.toLowerCase();
    if (!q) return tags;
    return tags.filter(o => o.label.toLowerCase().includes(q));
  }, [tags, typed]);

  const exactMatch = tags.some(o => o.label.toLowerCase() === typed.toLowerCase());
  const canCreate = typed.length > 0 && !exactMatch;

  const commit = (val) => {
    committingRef.current = true;
    onChange(val);
    setQuery('');
    setFocused(false);
  };

  const handleCreate = async () => {
    if (!typed || creating) return;
    committingRef.current = true;
    setCreating(true);
    try {
      const tag = await api.createTag({ category, name: toTitleCase(typed) });
      invalidateTagCache(category);
      refresh();
      onChange(tag.value);
      // Let the caller know this option was freshly created (vs picked from the
      // list) — used to require a supplier when a brand-new treatment is added.
      if (onCreate) onCreate(tag);
      setQuery('');
      setFocused(false);
    } catch (err) {
      toast.error(err.message || 'Could not add that option');
    } finally {
      setCreating(false);
    }
  };

  const handleFocus = () => {
    setFocused(true);
    setQuery(selectedLabel);
  };

  const handleBlur = () => {
    // A pick/create already handled things and set the guard — leave it be.
    if (committingRef.current) {
      committingRef.current = false;
      setFocused(false);
      return;
    }
    setFocused(false);
    // Emptying the box clears the selection; stray un-picked text is discarded.
    if (typed === '' && value) onChange('');
    setQuery('');
  };

  if (disabled) {
    return (
      <div className={`readonly-value${isRetired ? ' retired-option' : ''}`}>
        {selectedLabel || '-'}
      </div>
    );
  }

  const showDropdown = focused && (filtered.length > 0 || canCreate || !!value);

  return (
    <div className="autocomplete-container">
      <input
        type="text"
        value={focused ? query : selectedLabel}
        onChange={(e) => { setQuery(e.target.value); setFocused(true); }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); e.target.blur(); } }}
        placeholder={placeholder}
        className={isRetired ? 'has-retired' : ''}
      />
      {showDropdown && (
        <div className="customer-dropdown">
          {filtered.map(o => (
            <div key={o.value} className="customer-option" onMouseDown={() => commit(o.value)}>
              <strong>{o.label}</strong>
            </div>
          ))}
          {value && (
            <div className="customer-option" onMouseDown={() => commit('')}>
              <em>Clear</em>
            </div>
          )}
          {canCreate && (
            <div className="customer-option" onMouseDown={handleCreate}>
              ＋ Create &ldquo;{typed}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  );
}
