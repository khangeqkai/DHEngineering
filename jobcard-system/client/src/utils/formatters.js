export function toTitleCase(str) {
  if (!str) return str;
  return str.trim().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

export function capitalizeFirst(str) {
  if (!str) return str;
  const trimmed = str.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function validatePassword(password) {
  if (!/^\d{4}$/.test(password)) return 'Password must be exactly 4 digits';
  return null;
}
