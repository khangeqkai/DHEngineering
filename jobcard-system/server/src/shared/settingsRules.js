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
// string). At most 15 digits: the counter does its arithmetic on it as a number,
// and past 15 digits a number is rounded, so the first job would get a different
// number from the one typed and adding 1 would stop moving it on.
const STARTING_JOB_NUMBER_MAX_DIGITS = 15;

function isStartingJobNumber(value) {
  return /^\d+$/.test(value) && value.length <= STARTING_JOB_NUMBER_MAX_DIGITS;
}

const STARTING_JOB_NUMBER_MESSAGE =
  `Starting number must contain only digits, at most ${STARTING_JOB_NUMBER_MAX_DIGITS} (e.g. 00001)`;

module.exports = { INACTIVITY_MINUTES, isInactivityMinutes, isStartingJobNumber, STARTING_JOB_NUMBER_MESSAGE };
