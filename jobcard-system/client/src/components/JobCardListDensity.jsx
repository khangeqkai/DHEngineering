import { useCallback, useState } from 'react';

const DENSITY_KEYS = ['compact', 'comfortable', 'spacious'];
const STORAGE_KEY = 'jobcard-list-density';

const DENSITY_OPTIONS = [
  {
    key: 'compact',
    label: 'Compact',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2" y="3" width="12" height="1.5" rx="0.75" fill="currentColor" />
        <rect x="2" y="7.25" width="12" height="1.5" rx="0.75" fill="currentColor" />
        <rect x="2" y="11.5" width="12" height="1.5" rx="0.75" fill="currentColor" />
      </svg>
    ),
  },
  {
    key: 'comfortable',
    label: 'Comfortable',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="12" height="2" rx="1" fill="currentColor" />
        <rect x="2" y="7" width="12" height="2" rx="1" fill="currentColor" />
        <rect x="2" y="12" width="12" height="2" rx="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    key: 'spacious',
    label: 'Spacious',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2" y="1" width="12" height="2.5" rx="1" fill="currentColor" />
        <rect x="2" y="6.75" width="12" height="2.5" rx="1" fill="currentColor" />
        <rect x="2" y="12.5" width="12" height="2.5" rx="1" fill="currentColor" />
      </svg>
    ),
  },
];

function getInitialDensity() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && DENSITY_KEYS.includes(stored)) return stored;
  } catch {}
  return 'comfortable';
}

export function useJobCardListDensity() {
  const [density, setDensity] = useState(getInitialDensity);
  const setDensityPersistent = useCallback((key) => {
    setDensity(key);
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch {}
  }, []);
  return [density, setDensityPersistent];
}

export default function JobCardListDensityToggle({ density, onChange }) {
  return (
    <div className="jc-density-toggle" role="group" aria-label="Row density">
      {DENSITY_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          className={`jc-density-btn${density === opt.key ? ' active' : ''}`}
          title={opt.label}
          aria-pressed={density === opt.key}
          onClick={() => onChange(opt.key)}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}
