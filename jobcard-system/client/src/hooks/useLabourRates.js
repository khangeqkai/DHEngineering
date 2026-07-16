import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';

export const DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' }
];

export const TIERS = [
  { value: 'normal', label: 'Normal' },
  { value: 'ot1', label: 'Overtime 1' },
  { value: 'ot2', label: 'Overtime 2' }
];

const toMin = (hm) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};
const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

// A day's blocks → the tier for each of the 24 hours. The day is a cycle: the hours
// before the earliest block start take the LAST block's tier (it wraps past midnight).
export function gridFromBlocks(blocks) {
  const sorted = [...blocks].sort((a, b) => a.start.localeCompare(b.start));
  const grid = new Array(24);
  const wrapTier = sorted[sorted.length - 1].tier;
  for (let h = 0; h < 24; h++) {
    const m = h * 60;
    let tier = wrapTier;
    for (const b of sorted) {
      if (toMin(b.start) <= m) tier = b.tier; else break;
    }
    grid[h] = tier;
  }
  return grid;
}

// 24 hourly tiers → the compact block list the server stores. A block begins at each
// hour whose tier differs from the hour before it (wrapping hour 0 back to hour 23).
// An all-one-tier day collapses to a single block. Starts are unique and ascending.
export function blocksFromGrid(grid) {
  const blocks = [];
  for (let h = 0; h < 24; h++) {
    const prevTier = grid[(h + 23) % 24];
    if (grid[h] !== prevTier) blocks.push({ start: hourLabel(h), tier: grid[h] });
  }
  if (blocks.length === 0) blocks.push({ start: '00:00', tier: grid[0] });
  return blocks;
}

function emptySchedule() {
  const s = {};
  for (const d of DAYS) s[d.key] = [{ start: '00:00', tier: 'normal' }];
  return s;
}

// Coerce whatever came back from settings into a full, valid 7-day schedule. Each day
// is a 24-hour cycle: blocks are kept start-ordered, and the time before the earliest
// block wraps to the last block — so a block can start at any time, not just midnight.
function normalize(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { obj = {}; }
  }
  const out = {};
  for (const d of DAYS) {
    let blocks = Array.isArray(obj?.[d.key]) ? obj[d.key] : null;
    if (!blocks || blocks.length === 0) blocks = [{ start: '00:00', tier: 'normal' }];
    blocks = blocks
      .filter(b => b && /^\d{2}:\d{2}$/.test(b.start))
      .map(b => ({ start: b.start, tier: ['normal', 'ot1', 'ot2'].includes(b.tier) ? b.tier : 'normal' }))
      .sort((a, b) => a.start.localeCompare(b.start));
    if (blocks.length === 0) blocks = [{ start: '00:00', tier: 'normal' }];
    out[d.key] = blocks;
  }
  return out;
}

export function useLabourRates() {
  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState(emptySchedule());
  const [ot1Mult, setOt1Mult] = useState('1.5');
  const [ot2Mult, setOt2Mult] = useState('2');
  const [holidayMult, setHolidayMult] = useState('2.5');
  const [holidays, setHolidays] = useState([]);

  const [timezone, setTimezone] = useState('');

  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savingMultipliers, setSavingMultipliers] = useState(false);
  const [savingHolidays, setSavingHolidays] = useState(false);
  const [savingTimezone, setSavingTimezone] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getSettings();
      setSchedule(normalize(data.labourSchedule));
      if (data.labourOt1Multiplier != null) setOt1Mult(String(data.labourOt1Multiplier));
      if (data.labourOt2Multiplier != null) setOt2Mult(String(data.labourOt2Multiplier));
      if (data.labourHolidayMultiplier != null) setHolidayMult(String(data.labourHolidayMultiplier));
      let hol = data.labourPublicHolidays;
      if (typeof hol === 'string') { try { hol = JSON.parse(hol); } catch { hol = []; } }
      setHolidays(Array.isArray(hol) ? hol : []);
      if (data.timezone) setTimezone(data.timezone);
    } catch (err) {
      toast.error('Failed to load labour rate settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ---- Schedule editing (local; persisted on Save) ----

  // Paint one hour cell of one day to a tier. Works on the hourly grid, then folds
  // the day back into the stored block list. A no-op (same tier) skips the re-render.
  const paintHour = useCallback((day, hour, tier) => {
    setSchedule(prev => {
      const grid = gridFromBlocks(prev[day]);
      if (grid[hour] === tier) return prev;
      grid[hour] = tier;
      return { ...prev, [day]: blocksFromGrid(grid) };
    });
  }, []);

  const copyDayToAll = useCallback((day) => {
    setSchedule(prev => {
      const src = prev[day].map(b => ({ ...b }));
      const out = {};
      for (const d of DAYS) out[d.key] = src.map(b => ({ ...b }));
      return out;
    });
  }, []);

  const handleSaveSchedule = useCallback(async () => {
    // Tidy each day: sort by start and reject two blocks at the same time (the same
    // instant can't be two tiers) before sending — the server validates the same.
    const tidied = {};
    for (const d of DAYS) {
      const day = [...schedule[d.key]].sort((a, b) => a.start.localeCompare(b.start));
      const seen = new Set();
      for (const b of day) {
        if (seen.has(b.start)) {
          toast.error(`${d.label} has two blocks starting at ${b.start} — give each a different start time.`);
          return;
        }
        seen.add(b.start);
      }
      tidied[d.key] = day;
    }
    setSavingSchedule(true);
    try {
      await api.updateSettings({ labourSchedule: tidied });
      await load();
      toast.success('Weekly schedule saved');
    } catch (err) {
      toast.error(err.message || 'Failed to save schedule');
    } finally {
      setSavingSchedule(false);
    }
  }, [schedule, load]);

  const handleSaveMultipliers = useCallback(async () => {
    for (const [v, label] of [[ot1Mult, 'Overtime 1'], [ot2Mult, 'Overtime 2'], [holidayMult, 'Public holiday']]) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 1) {
        toast.error(`${label} multiplier must be a number of 1 or more`);
        return;
      }
    }
    setSavingMultipliers(true);
    try {
      await api.updateSettings({
        labourOt1Multiplier: ot1Mult,
        labourOt2Multiplier: ot2Mult,
        labourHolidayMultiplier: holidayMult
      });
      await load();
      toast.success('Overtime multipliers saved');
    } catch (err) {
      toast.error(err.message || 'Failed to save multipliers');
    } finally {
      setSavingMultipliers(false);
    }
  }, [ot1Mult, ot2Mult, holidayMult, load]);

  const addHoliday = useCallback((date) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    setHolidays(prev => (prev.includes(date) ? prev : [...prev, date].sort()));
  }, []);

  const removeHoliday = useCallback((date) => {
    setHolidays(prev => prev.filter(d => d !== date));
  }, []);

  const handleSaveHolidays = useCallback(async () => {
    setSavingHolidays(true);
    try {
      await api.updateSettings({ labourPublicHolidays: holidays });
      await load();
      toast.success('Public holidays saved');
    } catch (err) {
      toast.error(err.message || 'Failed to save public holidays');
    } finally {
      setSavingHolidays(false);
    }
  }, [holidays, load]);

  const handleSaveTimezone = useCallback(async () => {
    if (!timezone) {
      toast.error('Pick a time zone');
      return;
    }
    setSavingTimezone(true);
    try {
      await api.updateSettings({ timezone });
      await load();
      toast.success('Time zone saved');
    } catch (err) {
      toast.error(err.message || 'Failed to save time zone');
    } finally {
      setSavingTimezone(false);
    }
  }, [timezone, load]);

  return {
    loading,
    schedule, paintHour, copyDayToAll,
    handleSaveSchedule, savingSchedule,
    ot1Mult, setOt1Mult, ot2Mult, setOt2Mult, holidayMult, setHolidayMult,
    handleSaveMultipliers, savingMultipliers,
    holidays, addHoliday, removeHoliday, handleSaveHolidays, savingHolidays,
    timezone, setTimezone, handleSaveTimezone, savingTimezone
  };
}
