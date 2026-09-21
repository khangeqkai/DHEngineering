import { useState, useMemo, useRef, useEffect, useId } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
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
export default function CreatableTagSelect({ id, category, value, onChange, onCreate, placeholder = '', disabled = false }) {
  const { tags, labelOf, refresh } = useTags(category);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [creating, setCreating] = useState(false);
  // Options commit on mousedown (before the input's blur); this guards the blur
  // handler so it doesn't clear the value we just picked. Typing again disarms it —
  // an Enter commit leaves focus in the box, so the guard must not outlive the blur
  // it was raised for.
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
      // A repeat of the same failure replaces the first rather than stacking under it.
      toast.error(err.message || 'Could not add that option', { id: `tag-create-failed-${category}` });
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

  // One list for every row the dropdown shows — the options, the "clear it" row and
  // the "create this one" row — so the arrow keys walk all of them in reading order.
  const options = useMemo(() => {
    const rows = filtered.map(o => ({ key: `option-${o.value}`, kind: 'option', option: o }));
    if (value) rows.push({ key: 'clear', kind: 'clear' });
    if (canCreate) rows.push({ key: 'create', kind: 'create' });
    return rows;
  }, [filtered, value, canCreate]);

  const listId = useId();
  const [activeIndex, setActiveIndex] = useState(-1);
  // A changed list starts with nothing highlighted, so Enter can never take an
  // option the user never saw under the cursor.
  useEffect(() => { setActiveIndex(-1); }, [options]);

  // Read-only rendering happens after the hooks above, never before them: a field
  // that becomes locked mid-edit (the timer starting on a part, say) must not change
  // how many hooks this component runs.
  if (disabled) {
    return (
      <div className={`readonly-value${isRetired ? ' retired-option' : ''}`}>
        {selectedLabel || '-'}
      </div>
    );
  }

  const showDropdown = focused && options.length > 0;

  const choose = (opt) => {
    if (opt.kind === 'option') commit(opt.option.value);
    else if (opt.kind === 'clear') commit('');
    else handleCreate();
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
        value={focused ? query : selectedLabel}
        onChange={(e) => {
          // Disarms the pick/create guard below: Enter commits without moving focus
          // out of the box, so the guard would otherwise still be set when the user's
          // next blur arrives and would skip the empty-box-clears-it rule.
          committingRef.current = false;
          setQuery(e.target.value);
          setFocused(true);
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        className={isRetired ? 'has-retired' : ''}
      />
      <ChevronDown size={14} className={`autocomplete-caret${focused ? ' is-open' : ''}`} />
      {showDropdown && (
        <div className="customer-dropdown" id={listId} role="listbox">
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
              {opt.kind === 'option' && <strong>{opt.option.label}</strong>}
              {opt.kind === 'clear' && <em>Clear</em>}
              {opt.kind === 'create' && (
                <span className="customer-option-create">
                  <Plus size={14} /> Create &ldquo;{typed}&rdquo;
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
