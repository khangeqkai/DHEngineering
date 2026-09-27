// The settings values whose valid-range check the server and the client both
// enforce. One copy here; both sides read it.

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

// The home access code a home sign-in gives on top of a PIN. Blank switches home
// access off. Stored hashed like a PIN, and the hash only reads the first 72 bytes,
// so a longer code would silently have a tail that doesn't count.
const HOME_ACCESS_CODE_MIN_LENGTH = 8;
const HOME_ACCESS_CODE_MAX_BYTES = 72;
// The home address shown on the Home Access card (display only).
const HOME_ADDRESS_MAX_LENGTH = 200;

// Bytes the text takes as UTF-8 — the unit the hash's 72-byte limit is counted in.
// A lone surrogate counts as 3, the replacement character it is encoded as.
function utf8Length(text) {
  let bytes = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

// What is wrong with a home access code, or null when it can be saved.
function homeAccessCodeProblem(code) {
  if (typeof code !== 'string' || (code && code.length < HOME_ACCESS_CODE_MIN_LENGTH)) {
    return `The home access code must be at least ${HOME_ACCESS_CODE_MIN_LENGTH} characters`;
  }
  if (utf8Length(code) > HOME_ACCESS_CODE_MAX_BYTES) {
    return `The home access code must be ${HOME_ACCESS_CODE_MAX_BYTES} characters or fewer`;
  }
  return null;
}

// What is wrong with a home address (judged trimmed, as it is stored), or null.
function homeAddressProblem(address) {
  if (String(address || '').trim().length > HOME_ADDRESS_MAX_LENGTH) {
    return `The home address must be ${HOME_ADDRESS_MAX_LENGTH} characters or fewer`;
  }
  return null;
}

module.exports = {
  INACTIVITY_MINUTES, isInactivityMinutes, isStartingJobNumber, STARTING_JOB_NUMBER_MESSAGE,
  homeAccessCodeProblem, homeAddressProblem
};
