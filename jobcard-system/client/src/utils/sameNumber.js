// Two boxes hold the same figure when they read as the same number, so 50 and 50.00 are
// not "unsaved". Anything that is not a number (blank, half-typed) compares as text.
export function sameNumber(a, b) {
  const x = String(a ?? '').trim();
  const y = String(b ?? '').trim();
  if (x === '' || y === '') return x === y;
  const nx = Number(x);
  const ny = Number(y);
  return Number.isFinite(nx) && Number.isFinite(ny) ? nx === ny : x === y;
}
