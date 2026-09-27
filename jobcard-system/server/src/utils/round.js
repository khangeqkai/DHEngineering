// One rounding helper — every hand-written `Math.round(x * 10^k) / 10^k` and every
// local round2/round3 replace themselves with this.
function roundTo(n, places) {
  const factor = 10 ** places;
  return Math.round((Number(n) || 0) * factor) / factor;
}

module.exports = { roundTo };
