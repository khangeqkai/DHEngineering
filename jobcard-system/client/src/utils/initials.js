export function getInitials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_PALETTE = [
  { bg: '#3b82f6', fg: '#ffffff' },
  { bg: '#10b981', fg: '#ffffff' },
  { bg: '#f59e0b', fg: '#1f2937' },
  { bg: '#ef4444', fg: '#ffffff' },
  { bg: '#8b5cf6', fg: '#ffffff' },
  { bg: '#ec4899', fg: '#ffffff' },
  { bg: '#14b8a6', fg: '#ffffff' },
  { bg: '#f97316', fg: '#ffffff' },
  { bg: '#6366f1', fg: '#ffffff' },
  { bg: '#84cc16', fg: '#1f2937' },
];

export function getAvatarColor(key) {
  const str = String(key || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx];
}
