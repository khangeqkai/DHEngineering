// The PIN rule ("exactly 4 numeric digits") and its wording, in one place. Both
// the server's own checks (create user, update user password, change own
// password — all in middleware/validation.js) and the client's on-screen check
// (client/src/utils/formatters.js, used before a save is even attempted) read
// this instead of each carrying their own regex and wording.

const PIN_REGEX = /^\d{4}$/;
const PIN_MESSAGE = 'PIN must be exactly 4 digits';

function isValidPin(value) {
  return typeof value === 'string' && PIN_REGEX.test(value);
}

module.exports = { PIN_REGEX, PIN_MESSAGE, isValidPin };
