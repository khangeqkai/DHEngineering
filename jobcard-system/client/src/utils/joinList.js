// Join items the way a person would say them: "", "a", "a and b", "a, b and c" (no comma
// before the last word). `word` is the joining word: 'and' or 'or'.
export function joinList(items, word = 'and') {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} ${word} ${items[items.length - 1]}`;
}
