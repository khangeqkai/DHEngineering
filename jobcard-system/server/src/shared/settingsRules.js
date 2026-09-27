// The two settings values whose valid-range check the server and the client both
// enforce today, each written out separately. One copy here; both sides read it.

// Automatic sign-out for inactivity. 1-60 minutes, defaulting to 5.
const INACTIVITY_MINUTES = { min: 1, max: 60, defaultValue: 5 };

// Whole minutes only, inside the range above. parseInt truncates a decimal or
// trailing text ("5.9", "5abc") the same way today's checks (server and client)
// already did — this only carries that behaviour into one place, not changes it.
function isInactivityMinutes(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= INACTIVITY_MINUTES.min && n <= INACTIVITY_MINUTES.max;
}

// The starting job number: digits only (leading zeros are kept, so it stays a
// string, never parsed as a number).
function isStartingJobNumber(value) {
  return /^\d+$/.test(value);
}

const STARTING_JOB_NUMBER_MESSAGE = 'Starting number must contain only digits (e.g. 00001)';

module.exports = { INACTIVITY_MINUTES, isInactivityMinutes, isStartingJobNumber, STARTING_JOB_NUMBER_MESSAGE };
