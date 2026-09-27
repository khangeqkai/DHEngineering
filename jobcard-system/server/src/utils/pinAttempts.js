// One throttle for every place a PIN is checked (signing in, and the current PIN
// on Change PIN). A 4-digit PIN has only 10,000 values, so any route that tells a
// caller "right" or "wrong" about one needs the same limit — it used to live
// inside the sign-in route alone, which left Change PIN open to unlimited guessing
// from a session left signed in.
//
// First 5 FAILED attempts normal, then an ESCALATING cooldown that grows the more
// they fail. No hard account lockout (a workshop must never let one person lock a
// coworker out), but the wait climbs to discourage steady guessing.
//
// Each record is keyed by who is guessing (`key` — a computer address for sign-in,
// the account itself for Change PIN) and remembers which account each failure was
// aimed at (`target`). The total drives the cooldown; a correct PIN forgives only
// the failures aimed at the account that just proved it — so someone who mistypes
// their own PIN and then gets it right is fully cleared, but a correct sign-in to
// your own account no longer wipes the guesses you made at someone else's.
const FREE_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes - forgets the failures after inactivity
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

// Cooldown grows with the number of failures already recorded.
// count 5-6 -> 30s, 7-8 -> 1m, 9-10 -> 2m, 11+ -> 5m (cap).
const cooldownMsForCount = (count) => {
  if (count <= 6) return 30 * 1000;
  if (count <= 8) return 60 * 1000;
  if (count <= 10) return 120 * 1000;
  return 300 * 1000;
};

// True once a record has gone a full window with no new failure — the only point a
// record may be dropped. A record still inside its window keeps its count even when
// its current cooldown has passed, or the escalating wait would reset. Shared by the
// check and the periodic sweep, so the two can never disagree about "expired".
const isExpired = (record, now) => (now - record.lastFailure) > WINDOW_MS;

function createPinAttemptLimiter() {
  const records = new Map(); // key -> { count, lastFailure, byTarget: Map(target -> count) }

  // Seconds still to wait, or null when another attempt is allowed.
  const check = (key) => {
    const now = Date.now();
    let record = records.get(key);
    if (record && isExpired(record, now)) {
      records.delete(key);
      record = null;
    }
    if (!record || record.count < FREE_ATTEMPTS) return null;

    const cooldownMs = cooldownMsForCount(record.count);
    const sinceLast = now - record.lastFailure;
    return sinceLast < cooldownMs ? Math.ceil((cooldownMs - sinceLast) / 1000) : null;
  };

  // Count an attempt at `target`. Called BEFORE the PIN comparison: that comparison
  // yields, so counting afterwards left a gap wide enough for a whole burst of
  // guesses to pass the check together — one cooldown wait bought unlimited tries.
  const recordFailure = (key, target) => {
    const now = Date.now();
    let record = records.get(key);
    if (!record) {
      record = { count: 0, lastFailure: now, byTarget: new Map() };
      records.set(key, record);
    }
    record.count++;
    record.lastFailure = now;
    record.byTarget.set(target, (record.byTarget.get(target) || 0) + 1);
  };

  // A correct PIN for `target`: take away only the failures aimed at it.
  const forgive = (key, target) => {
    const record = records.get(key);
    if (!record) return;
    const aimed = record.byTarget.get(target) || 0;
    record.byTarget.delete(target);
    record.count -= aimed;
    if (record.count <= 0) records.delete(key);
  };

  // Records are only ever read by key, so one that fails once and never comes back
  // would sit here forever on a server that stays up for weeks. Sweep with the exact
  // same expiry test the check uses, so this can never drop a record still counting.
  // Unref'd so the timer never keeps the process alive on its own.
  const sweep = () => {
    const now = Date.now();
    for (const [key, record] of records) {
      if (isExpired(record, now)) records.delete(key);
    }
  };
  setInterval(sweep, SWEEP_INTERVAL_MS).unref();

  return { check, recordFailure, forgive };
}

module.exports = { createPinAttemptLimiter };
