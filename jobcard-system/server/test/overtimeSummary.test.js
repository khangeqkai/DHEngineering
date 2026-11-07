const test = require('node:test');
const assert = require('node:assert/strict');
const { describeTierHours, summariseTierHours, DAYS, blocksFromGrid } = require('../src/shared/overtimeSchedule');

const dayWith = (paint) => {
  const grid = new Array(24).fill('normal');
  for (const [from, to, tier] of paint) for (let h = from; h < to; h++) grid[h] = tier;
  return blocksFromGrid(grid);
};
const allDays = (blocks) => Object.fromEntries(DAYS.map((d) => [d, blocks]));

test('weekday evenings and a whole Saturday read from the painted hours', () => {
  const weekday = dayWith([[15, 17, 'ot1']]);
  const sat = dayWith([[0, 24, 'ot2']]);
  const schedule = { mon: weekday, tue: weekday, wed: weekday, thu: weekday, fri: weekday, sat, sun: dayWith([]) };
  assert.equal(describeTierHours(schedule, 'ot1'), 'Mon–Fri 3–5 pm');
  assert.equal(describeTierHours(schedule, 'ot2'), 'Sat');
});

test('a tier with no hours says none, and a range crossing noon names both ends', () => {
  const schedule = allDays(dayWith([[11, 14, 'ot1']]));
  assert.equal(describeTierHours(schedule, 'ot2'), 'none');
  assert.equal(describeTierHours(schedule, 'ot1'), 'Every day 11 am–2 pm');
});

test('hours at both ends of the day are listed together', () => {
  const schedule = allDays(dayWith([[0, 6, 'ot2'], [18, 24, 'ot2']]));
  assert.equal(describeTierHours(schedule, 'ot2'), 'Every day 12–6 am and 6 pm–12 am');
});

test('a tier with more than two different day-patterns says it varies, pointing at the schedule', () => {
  const a = dayWith([[15, 17, 'ot1']]);
  const b = dayWith([[16, 18, 'ot1']]);
  const c = dayWith([[17, 19, 'ot1']]);
  const schedule = { mon: a, tue: b, wed: c, thu: a, fri: b, sat: dayWith([]), sun: dayWith([]) };
  assert.equal(summariseTierHours(schedule, 'ot1', 'below'), 'varies by day, see the schedule below');
  assert.equal(summariseTierHours(schedule, 'ot2', 'below'), 'none');
});

test('two day-patterns or fewer keep the full description', () => {
  const weekday = dayWith([[15, 17, 'ot1']]);
  const sat = dayWith([[8, 12, 'ot1']]);
  const schedule = { mon: weekday, tue: weekday, wed: weekday, thu: weekday, fri: weekday, sat, sun: dayWith([]) };
  assert.equal(summariseTierHours(schedule, 'ot1', 'below'), describeTierHours(schedule, 'ot1'));
});
