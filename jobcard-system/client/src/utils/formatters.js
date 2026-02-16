export function toTitleCase(str) {
  if (!str) return str;
  return str.trim().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function capitalizeFirst(str) {
  if (!str) return str;
  const trimmed = str.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
