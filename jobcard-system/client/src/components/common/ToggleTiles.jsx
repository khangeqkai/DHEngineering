import './ToggleTiles.css';

// Uniform, touch-friendly selectable tiles in an aligned grid — the picker style
// first built for the stop-timer machine list, generalised for reuse.
// Each option: { value, label, sublabel?, disabled? }. `selectedValues` is an
// array of currently-selected values; `onToggle(value)` is called on tap.
// `readOnly` keeps the identical look but makes tiles non-interactive (used to
// show the same picker to viewers who aren't allowed to change the selection).
export default function ToggleTiles({
  options = [],
  selectedValues = [],
  onToggle,
  className = '',
  ariaLabel,
  minTileWidth = 112,
  readOnly = false
}) {
  return (
    <div
      className={`toggle-tiles${readOnly ? ' toggle-tiles--readonly' : ''} ${className}`.trim()}
      role="group"
      aria-label={ariaLabel}
      style={{ '--tt-min': `${minTileWidth}px` }}
    >
      {options.map(opt => {
        const selected = selectedValues.includes(opt.value);
        return (
          <button
            type="button"
            key={opt.value}
            className={`toggle-tile${selected ? ' toggle-tile--active' : ''}`}
            onClick={readOnly ? undefined : () => onToggle(opt.value)}
            aria-pressed={selected}
            disabled={opt.disabled}
            tabIndex={readOnly ? -1 : undefined}
          >
            <span className="toggle-tile-label">{opt.label}</span>
            {opt.sublabel && <span className="toggle-tile-sub">{opt.sublabel}</span>}
          </button>
        );
      })}
    </div>
  );
}
