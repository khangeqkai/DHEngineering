// The three-step level mark shown inside a priority pill: three small squares,
// filled one, two or three for Low, Medium, High. Priority is drawn this way — not
// in the blue/amber/red of the status pills — so the two never read as one scale.
// None shows three empty squares. Same Day Service has its own lime pill and no bar.
const LEVELS = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };

export default function PriorityLevel({ priority }) {
  const filled = LEVELS[priority];
  if (filled === undefined) return null;
  return (
    <span className="level-bar" aria-hidden="true">
      {[1, 2, 3].map((step) => (
        <i key={step} className={step <= filled ? 'is-on' : undefined} />
      ))}
    </span>
  );
}
