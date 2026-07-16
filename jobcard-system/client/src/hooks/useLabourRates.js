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

function emptySchedule() {
  const s = {};
  for (const d of DAYS) s[d.key] = [{ start: '00:00', tier: 'normal' }];
  return s;
}

// Coerce whatever came back from settings into a full, valid 7-day schedule.
function normalize(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { obj = {}; }
  }
  const out = {};
  for (const d of DAYS) {
    let blocks = Array.isArray(obj?.[d.key]) ? obj[d.key] : null;
    if (!blocks || blocks.length === 0) blocks = [{ start: '00:00', tier: 'normal' }];
    // Keep start-ordered and guarantee a 00:00 anchor.
    blocks = blocks
      .filter(b => b && /^\d{2}:\d{2}$/.test(b.start))
      .map(b => ({ start: b.start, tier: ['normal', 'ot1', 'ot2'].includes(b.tier) ? b.tier : 'normal' }))
      .sort((a, b) => a.start.localeCompare(b.start));
    if (blocks.length === 0 || blocks[0].start !== '00:00') {
      blocks = [{ start: '00:00', tier: blocks[0]?.tier || 'normal' }, ...blocks.filter(b => b.start !== '00:00')];
    }
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

  const setBlockTier = useCallback((day, index, tier) => {
    setSchedule(prev => ({
      ...prev,
      [day]: prev[day].map((b, i) => (i === index ? { ...b, tier } : b))
    }));
  }, []);

  // Add a block starting at `start` (HH:MM) with `tier`. Replaces a block at the same
  // start; keeps the list start-ordered. The 00:00 anchor can't be added again.
  const addBlock = useCallback((day, start, tier) => {
    if (!/^\d{2}:\d{2}$/.test(start)) return;
    setSchedule(prev => {
      const rest = prev[day].filter(b => b.start !== start);
      const next = [...rest, { start, tier }].sort((a, b) => a.start.localeCompare(b.start));
      return { ...prev, [day]: next };
    });
  }, []);

  const removeBlock = useCallback((day, index) => {
    setSchedule(prev => {
      if (index === 0) return prev; // never remove the 00:00 anchor
      return { ...prev, [day]: prev[day].filter((_, i) => i !== index) };
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
    setSavingSchedule(true);
    try {
      await api.updateSettings({ labourSchedule: schedule });
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
    schedule, setBlockTier, addBlock, removeBlock, copyDayToAll,
    handleSaveSchedule, savingSchedule,
    ot1Mult, setOt1Mult, ot2Mult, setOt2Mult, holidayMult, setHolidayMult,
    handleSaveMultipliers, savingMultipliers,
    holidays, addHoliday, removeHoliday, handleSaveHolidays, savingHolidays,
    timezone, setTimezone, handleSaveTimezone, savingTimezone
  };
}
