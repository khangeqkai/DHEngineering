// The only place the app's starting pricing figures are written — every seed row,
// schema column default and fallback reads from here instead of carrying its own copy.
const COSTING_DEFAULTS = Object.freeze({
  labourDefaultRate: 0,
  ot1Multiplier: 1.5,
  ot2Multiplier: 2,
  holidayMultiplier: 2.5,
  materialsProfitPercent: 100,
  subcontractorProfitPercent: 0
});

module.exports = { COSTING_DEFAULTS };
