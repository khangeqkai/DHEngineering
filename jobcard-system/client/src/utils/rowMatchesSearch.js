// Whether a table row matches what was typed in the table's search box.
// `keys` are matched as plain text, ignoring case. `digitKeys` hold phone numbers:
// when the search looks like a phone number (only digits, spaces and + - ( ) .)
// they are compared by digits alone, so "0412345678" finds "0412 345 678" and the
// other way round. Fewer than 3 digits is too short to mean a phone number — "12"
// would match nearly every row — so a short number is matched as plain text only.
const PHONE_LIKE = /^[\d\s()+\-.]+$/;
const MIN_PHONE_DIGITS = 3;

export function rowMatchesSearch(item, term, keys, digitKeys = []) {
  const wanted = String(term).trim().toLowerCase();
  if (!wanted) return true;
  const textHit = keys.some((key) => {
    const value = item[key];
    return value != null && String(value).toLowerCase().includes(wanted);
  });
  if (textHit) return true;
  if (digitKeys.length === 0 || !PHONE_LIKE.test(wanted)) return false;
  const wantedDigits = wanted.replace(/\D/g, '');
  if (wantedDigits.length < MIN_PHONE_DIGITS) return false;
  return digitKeys.some((key) => {
    const value = item[key];
    return value != null && String(value).replace(/\D/g, '').includes(wantedDigits);
  });
}
