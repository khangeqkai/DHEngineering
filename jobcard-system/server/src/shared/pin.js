// The PIN rule ("exactly 4 numeric digits") and its wording, in one place. Both
// the server's own checks (create user, update user password, change own
// password — all in middleware/validation.js) and the client's on-screen check
// (client/src/utils/formatters.js, used before a save is even attempted) read
// this instead of each carrying their own regex and wording.

const PIN_REGEX = /^\d{4}$/;
const PIN_MESSAGE = 'The PIN must be exactly 4 digits.';

function isValidPin(value) {
  return typeof value === 'string' && PIN_REGEX.test(value);
}

// A PIN too easy to guess to hand out as a made-up one: all the same digit (0000, 1111)
// or a straight run up or down (1234, 4321). Typing one by hand is still allowed.
function isWeakPin(value) {
  if (!isValidPin(value)) return false;
  const digits = value.split('').map(Number);
  if (digits.every((d) => d === digits[0])) return true;
  const steps = digits.slice(1).map((d, i) => d - digits[i]);
  return steps.every((x) => x === 1) || steps.every((x) => x === -1);
}

module.exports = { PIN_REGEX, PIN_MESSAGE, isValidPin, isWeakPin };
