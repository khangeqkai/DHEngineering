import './EmptyState.css';

const icons = {
  contacts: (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="12" y="8" width="40" height="48" rx="4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="32" cy="28" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M20 46c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="18" x2="12" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="28" x2="12" y2="28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="38" x2="12" y2="38" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  suppliers: (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="20" width="30" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M34 28h10l8 8v8a3 3 0 01-3 3H34V28z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="16" cy="48" r="5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="46" cy="48" r="5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="21" y1="48" x2="41" y2="48" stroke="currentColor" strokeWidth="1.5" />
      <rect x="14" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
    </svg>
  ),
  users: (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="26" cy="22" r="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 50c0-8.837 7.163-16 16-16s16 8.163 16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="44" cy="26" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M54 50c0-6.075-4.925-11-11-11-2.3 0-4.43.706-6.19 1.912" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  equipment: (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="12" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M32 8v6M32 50v6M8 32h6M50 32h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15 15l4.24 4.24M44.76 44.76L49 49M49 15l-4.24 4.24M19.24 44.76L15 49" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  jobcards: (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="12" y="6" width="40" height="52" rx="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M24 6h16v6a2 2 0 01-2 2H26a2 2 0 01-2-2V6z" stroke="currentColor" strokeWidth="1.5" />
      <line x1="20" y1="24" x2="44" y2="24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="20" y1="32" x2="38" y2="32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="20" y1="40" x2="34" y2="40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="20" y1="48" x2="30" y2="48" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  activity: (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="22" stroke="currentColor" strokeWidth="1.5" />
      <path d="M32 18v14l10 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="32" r="2" fill="currentColor" />
    </svg>
  ),
};

export default function EmptyState({
  icon = 'jobcards',
  title = 'No data yet',
  description = 'Get started by adding your first item.',
  actionLabel,
  onAction,
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" aria-hidden="true">
        {icons[icon] || icons.jobcards}
      </div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-description">{description}</p>
      {actionLabel && onAction && (
        <button className="btn btn-primary empty-state-action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
