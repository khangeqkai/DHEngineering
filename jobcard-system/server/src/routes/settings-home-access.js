/**
 * Home-access settings, split out of settings.js (which is near the file-size
 * limit): the home access code and the fixed home address shown on the Home
 * Access card. Both admin-only.
 */
const bcrypt = require('bcryptjs');

// Body keys only an admin may send (settings.js 403s a manager on any of them).
const HOME_ACCESS_BODY_KEYS = ['homeAccessCode', 'homeAddress'];
// Stored keys that must never reach a client as-is.
const HOME_ACCESS_SECRET_KEYS = ['home_access_code'];

// Read-only view for GET /settings: says whether the code is set, never what it is.
function homeAccessView(settings) {
  return {
    homeAccessCodeSet: Boolean(settings.home_access_code),
    homeAddress: settings.home_address || ''
  };
}

// Validate and collect the home-access fields of a PUT /settings body.
// Returns { error } or { updates } (snake_case, ready for db.updateSettings).
async function collectHomeAccessUpdates(body) {
  const updates = {};
  const { homeAccessCode, homeAddress } = body;

  // The shared secret a home user must give on top of their PIN. Stored
  // hashed like a PIN; blank switches home access off.
  if (homeAccessCode !== undefined) {
    if (typeof homeAccessCode !== 'string' || (homeAccessCode && homeAccessCode.length < 8)) {
      return { error: 'The home access code must be at least 8 characters' };
    }
    // bcrypt only reads the first 72 bytes, so a longer code would silently
    // have a tail that doesn't count.
    if (Buffer.byteLength(homeAccessCode, 'utf8') > 72) {
      return { error: 'The home access code must be 72 characters or fewer' };
    }
    updates.home_access_code = homeAccessCode ? await bcrypt.hash(homeAccessCode, 10) : '';
  }

  // The address staff type from home — purely for display on the card; the
  // tunnel itself is set up in Cloudflare, not here.
  if (homeAddress !== undefined) {
    const address = String(homeAddress || '').trim();
    if (address.length > 200) return { error: 'The home address must be 200 characters or fewer' };
    updates.home_address = address;
  }

  return { updates };
}

// The audit-trail change for the code: "not set" → "set" (switched on),
// "set" → "not set" (switched off), "set" → "changed" (rotated). Never the
// code itself. Null when the code wasn't touched, or was cleared while
// already clear.
function homeAccessChange(before, updates) {
  if (updates.home_access_code === undefined) return null;
  const was = before.home_access_code ? 'set' : 'not set';
  const now = updates.home_access_code ? 'set' : 'not set';
  if (now === 'not set') return was === 'set' ? { homeAccessCode: { from: was, to: now } } : null;
  return { homeAccessCode: { from: was, to: was === 'set' ? 'changed' : 'set' } };
}

module.exports = { homeAccessChange, HOME_ACCESS_BODY_KEYS, HOME_ACCESS_SECRET_KEYS, homeAccessView, collectHomeAccessUpdates };
