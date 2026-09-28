// One rounding helper — every hand-written `Math.round(x * 10^k) / 10^k` and every
// local round2/round3 replace themselves with this.
// The scaled figure is first cleaned of binary float noise (to 15 significant digits)
// so an exact half rounds up: 1.5 × 50.05 is held as 75.07499999…, and rounding that
// raw would bill a cent short.
function roundTo(n, places) {
  const factor = 10 ** places;
  const scaled = Number(((Number(n) || 0) * factor).toPrecision(15));
  return Math.round(scaled) / factor;
}

module.exports = { roundTo };
