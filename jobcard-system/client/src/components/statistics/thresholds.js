// The cut-offs behind the coloured badges on the statistics page. Every badge and
// every sentence explaining a badge reads from here, so the printed rule can't
// drift from the rule that picks the colour.

// Finished-on-time rate, in percent: this or better is "On track", this or better
// (but below on-track) is "Slipping", anything lower is "Behind".
export const ON_TRACK_FROM = 90;
export const SLIPPING_FROM = 75;

// Scrap rate, in percent: this or under is "Low waste", this or under (but above
// low) is "Moderate", anything higher is "Elevated".
export const LOW_WASTE_UP_TO = 3;
export const MODERATE_WASTE_UP_TO = 7;

// 'success' | 'warning' | 'danger' for an on-time percentage.
export const onTimeTone = (rate) => (rate >= ON_TRACK_FROM ? 'success' : rate >= SLIPPING_FROM ? 'warning' : 'danger');
export const onTimeWord = (rate) => (rate >= ON_TRACK_FROM ? 'On track' : rate >= SLIPPING_FROM ? 'Slipping' : 'Behind');
export const wasteTone = (rate) => (rate <= LOW_WASTE_UP_TO ? 'success' : rate <= MODERATE_WASTE_UP_TO ? 'warning' : 'danger');
export const wasteWord = (rate) => (rate <= LOW_WASTE_UP_TO ? 'Low waste' : rate <= MODERATE_WASTE_UP_TO ? 'Moderate' : 'Elevated');

export const ON_TIME_RULE = `On track is ${ON_TRACK_FROM}% or better, Slipping ${SLIPPING_FROM} to ${ON_TRACK_FROM - 1}%, Behind is under ${SLIPPING_FROM}%.`;
export const WASTE_RULE = `Low waste is ${LOW_WASTE_UP_TO}% or under, Moderate over ${LOW_WASTE_UP_TO} up to ${MODERATE_WASTE_UP_TO}%, Elevated is over ${MODERATE_WASTE_UP_TO}%.`;

// "1 day late" / "2 days late".
export const daysLate = (n) => `${n} ${n === 1 ? 'day' : 'days'} late`;
