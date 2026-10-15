import { useEffect, useState, useCallback, useContext, useRef } from 'react';
import { UNSAFE_NavigationContext } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { useFieldErrors, scrollFieldIntoView } from './useFieldErrors';
import {
  DAYS as DAY_KEYS, TIERS as TIER_VALUES,
  cleanDayBlocks, gridFromBlocks, blocksFromGrid
} from '../../../server/src/shared/overtimeSchedule';
import { isCalendarDate } from '../../../server/src/shared/calendarDate';

// The day keys and tier values themselves are the one shared shape (server/src/shared/
// overtimeSchedule.js, read on both sides via the Vite plugin in vite.config.js); only
// the display labels live here, since the server has no reason to know them.
const DAY_LABELS = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday'
};
const TIER_LABELS = { normal: 'Normal', ot1: 'Overtime 1', ot2: 'Overtime 2' };

export const DAYS = DAY_KEYS.map(key => ({ key, label: DAY_LABELS[key] || key }));
export const TIERS = TIER_VALUES.map(value => ({ value, label: TIER_LABELS[value] || value }));

function emptySchedule() {
  const s = {};
  for (const d of DAYS) s[d.key] = [{ start: '00:00', tier: 'normal' }];
  return s;
}

// Coerce whatever came back from settings into a full, valid 7-day schedule. Each day
// is a 24-hour cycle: blocks are kept start-ordered, and the time before the earliest
// block wraps to the last block — so a block can start at any time, not just midnight.
// Deliberately does NOT snap to whole hours the way scheduleDayToWholeHours does — this
// page shows sub-hour legacy starts as-is until they're painted over — so it shares
// only the cleaning step (cleanDayBlocks), not the shared file's whole-hour snap.
function normalize(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch { obj = {}; }
  }
  const out = {};
  for (const d of DAYS) {
    const cleaned = cleanDayBlocks(obj?.[d.key]);
    out[d.key] = cleaned.length ? cleaned : [{ start: '00:00', tier: 'normal' }];
  }
  return out;
}

// Asks before the person leaves a page that holds edits nobody has saved. Two ways out are
// covered: moving to another screen of the app (every link and every programmatic move goes
// through the router's navigator, so its push/replace are wrapped while there is something
// unsaved — this app uses the plain browser router, which has no built-in blocker), and
// closing or refreshing the window (the browser's own leave-page question). The browser's
// Back button is not covered by the first; it is by the second only when it leaves the app.
// Also tells the inactivity countdown there is work at stake, like the job screen does.
export function useLeaveGuard(dirty, showConfirm, { title, message, stayLabel, leaveLabel }) {
  const { navigator } = useContext(UNSAFE_NavigationContext);
  const { registerUnsavedWork } = useAuth();
  const askRef = useRef(null);
  askRef.current = () => showConfirm({
    title, message, confirmLabel: leaveLabel, cancelLabel: stayLabel, confirmVariant: 'danger'
  });

  useEffect(() => {
    if (!dirty) return undefined;
    const warnBeforeLeaving = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    const unregister = registerUnsavedWork('labour rates');

    const originalPush = navigator.push;
    const originalReplace = navigator.replace;
    let asking = false;
    const guarded = (original) => (...args) => {
      // A second link pressed while the question is up is ignored, not queued.
      if (asking) return;
      asking = true;
      Promise.resolve(askRef.current()).then((leave) => {
        asking = false;
        if (leave) original.apply(navigator, args);
      });
    };
    navigator.push = guarded(originalPush);
    navigator.replace = guarded(originalReplace);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeLeaving);
      unregister();
      navigator.push = originalPush;
      navigator.replace = originalReplace;
    };
  }, [dirty, navigator, registerUnsavedWork]);
}

export function useLabourRates({ showConfirm } = {}) {
  const [loading, setLoading] = useState(true);
  // Set when the last load failed. The page then shows a Try again message instead of
  // the cards: the starting blanks below never came from the server, and every Save
  // here replaces the stored figure (the whole schedule, the whole holiday list) with
  // what's on screen.
  const [loadFailed, setLoadFailed] = useState(false);
  const [schedule, setSchedule] = useState(emptySchedule());
  // Blank until the real settings load — the server is the only source of the company
  // rates. LabourRatesSettings.jsx shows "Loading…" in place of the whole grid while
  // `loading` is true, and a Try again message while `loadFailed` is, so these blanks
  // are never shown, edited or saved.
  const [defaultRate, setDefaultRateState] = useState('');
  const [ot1Mult, setOt1MultState] = useState('');
  const [ot2Mult, setOt2MultState] = useState('');
  const [holidayMult, setHolidayMultState] = useState('');
  const [holidays, setHolidays] = useState([]);

  const [timezone, setTimezoneState] = useState('');
  // What is stored right now, so the schedule and holiday cards can tell an edit
  // waiting on their Save button from a page that matches the saved figures, and the
  // time zone question can name the zone being left.
  const [savedSchedule, setSavedSchedule] = useState('');
  const [savedHolidays, setSavedHolidays] = useState('');
  const [savedTimezone, setSavedTimezone] = useState('');

  const { setFieldErrors, errorFor } = useFieldErrors((name) => ({
    defaultRate, ot1Mult, ot2Mult, holidayMult, timezone
  }[name]));

  const setDefaultRate = useCallback((v) => setDefaultRateState(v), []);
  const setOt1Mult = useCallback((v) => setOt1MultState(v), []);
  const setOt2Mult = useCallback((v) => setOt2MultState(v), []);
  const setHolidayMult = useCallback((v) => setHolidayMultState(v), []);
  const setTimezone = useCallback((v) => setTimezoneState(v), []);

  const [savingDefaultRate, setSavingDefaultRate] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savingMultipliers, setSavingMultipliers] = useState(false);
  const [savingHolidays, setSavingHolidays] = useState(false);
  const [savingTimezone, setSavingTimezone] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getSettings();
      if (data.labourDefaultRate != null) setDefaultRate(String(data.labourDefaultRate));
      const loadedSchedule = normalize(data.labourSchedule);
      setSchedule(loadedSchedule);
      setSavedSchedule(JSON.stringify(loadedSchedule));
      if (data.labourOt1Multiplier != null) setOt1Mult(String(data.labourOt1Multiplier));
      if (data.labourOt2Multiplier != null) setOt2Mult(String(data.labourOt2Multiplier));
      if (data.labourHolidayMultiplier != null) setHolidayMult(String(data.labourHolidayMultiplier));
      let hol = data.labourPublicHolidays;
      if (typeof hol === 'string') { try { hol = JSON.parse(hol); } catch { hol = []; } }
      const loadedHolidays = Array.isArray(hol) ? hol : [];
      setHolidays(loadedHolidays);
      setSavedHolidays(JSON.stringify(loadedHolidays));
      if (data.timezone) { setTimezone(data.timezone); setSavedTimezone(data.timezone); }
      setLoadFailed(false);
    } catch (err) {
      setLoadFailed(true);
      toast.error('Couldn\'t load the labour rate settings. Try again in a moment.', { id: 'labour-rates-load' });
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
      setSchedule(tidied);
      setSavedSchedule(JSON.stringify(tidied));
      toast.success('Weekly schedule updated');
    } catch (err) {
      toast.error(err.message || 'Couldn\'t save the schedule. Check the connection and try again.');
    } finally {
      setSavingSchedule(false);
    }
  }, [schedule, load]);

  const handleSaveDefaultRate = useCallback(async () => {
    // An empty box is refused rather than treated as 0 (Number('') === 0) — the
    // company-wide default seeding every new job's rate should never be zeroed by
    // accident. A deliberately typed 0 still saves.
    if (String(defaultRate).trim() === '') {
      setFieldErrors({ defaultRate: 'Enter a default hourly rate (type 0 if labour should default to free)' });
      scrollFieldIntoView('defaultRate');
      return;
    }
    const n = Number(defaultRate);
    if (!Number.isFinite(n) || n < 0) {
      setFieldErrors({ defaultRate: 'Default hourly rate must be a number of 0 or more' });
      scrollFieldIntoView('defaultRate');
      return;
    }
    setSavingDefaultRate(true);
    try {
      await api.updateSettings({ labourDefaultRate: defaultRate });
      toast.success('Default hourly rate updated');
    } catch (err) {
      toast.error(err.message || 'Couldn\'t save the default rate. Check the connection and try again.');
    } finally {
      setSavingDefaultRate(false);
    }
  }, [defaultRate, setFieldErrors]);

  const handleSaveMultipliers = useCallback(async () => {
    for (const [v, label, field] of [
      [ot1Mult, 'Overtime 1', 'ot1Mult'],
      [ot2Mult, 'Overtime 2', 'ot2Mult'],
      [holidayMult, 'Public holiday', 'holidayMult']
    ]) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 1) {
        setFieldErrors({ [field]: `${label} multiplier must be a number of 1 or more` });
        scrollFieldIntoView(field);
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
      toast.success('Overtime multipliers updated');
    } catch (err) {
      toast.error(err.message || 'Couldn\'t save the multipliers. Check the connection and try again.');
    } finally {
      setSavingMultipliers(false);
    }
  }, [ot1Mult, ot2Mult, holidayMult, setFieldErrors]);

  const addHoliday = useCallback((date) => {
    if (!isCalendarDate(date)) return;
    setHolidays(prev => (prev.includes(date) ? prev : [...prev, date].sort()));
  }, []);

  const removeHoliday = useCallback((date) => {
    setHolidays(prev => prev.filter(d => d !== date));
  }, []);

  const handleSaveHolidays = useCallback(async () => {
    setSavingHolidays(true);
    try {
      await api.updateSettings({ labourPublicHolidays: holidays });
      setSavedHolidays(JSON.stringify(holidays));
      toast.success('Public holidays updated');
    } catch (err) {
      toast.error(err.message || 'Couldn\'t save the public holidays. Check the connection and try again.');
    } finally {
      setSavingHolidays(false);
    }
  }, [holidays]);

  const handleSaveTimezone = useCallback(async () => {
    if (!timezone) {
      setFieldErrors({ timezone: 'Pick a time zone' });
      scrollFieldIntoView('timezone');
      return;
    }
    // A changed zone is asked about first, naming both zones. A save of the zone already
    // stored goes straight through.
    if (savedTimezone && timezone !== savedTimezone && showConfirm) {
      const ok = await showConfirm({
        title: 'Change the time zone?',
        message: `From ${savedTimezone} to ${timezone}. Jobs created from now on use the new zone to sort work into normal hours and overtime. Jobs that already exist keep the zone they started with, including invoiced ones. Running clocks are cut at the end of normal hours in the new zone straight away.`,
        confirmLabel: `Use ${timezone}`,
        cancelLabel: 'Go back',
        confirmVariant: 'warning'
      });
      if (!ok) return;
    }
    setSavingTimezone(true);
    try {
      await api.updateSettings({ timezone });
      setSavedTimezone(timezone);
      toast.success('Time zone updated');
    } catch (err) {
      toast.error(err.message || 'Couldn\'t save the time zone. Check the connection and try again.');
    } finally {
      setSavingTimezone(false);
    }
  }, [timezone, savedTimezone, showConfirm, setFieldErrors]);

  const scheduleDirty = savedSchedule !== '' && JSON.stringify(schedule) !== savedSchedule;
  const holidaysDirty = savedHolidays !== '' && JSON.stringify(holidays) !== savedHolidays;

  return {
    loading, loadFailed, load,
    defaultRate, setDefaultRate, handleSaveDefaultRate, savingDefaultRate,
    schedule, paintHour, copyDayToAll,
    handleSaveSchedule, savingSchedule,
    ot1Mult, setOt1Mult, ot2Mult, setOt2Mult, holidayMult, setHolidayMult,
    handleSaveMultipliers, savingMultipliers,
    holidays, addHoliday, removeHoliday, handleSaveHolidays, savingHolidays,
    timezone, setTimezone, handleSaveTimezone, savingTimezone,
    scheduleDirty, holidaysDirty,
    errorFor
  };
}
