/**
 * Home-access settings, split out of settings.js (which is near the file-size
 * limit): the home access code and the fixed home address shown on the Home
 * Access card. Both admin-only.
 */
const bcrypt = require('bcryptjs');
const { homeAccessCodeProblem, homeAddressProblem } = require('../shared/settingsRules');

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
// Returns { error, field } (field = the body key the refusal belongs to, so the
// screen can mark that box) or { updates } (snake_case, ready for db.updateSettings).
async function collectHomeAccessUpdates(body) {
  const updates = {};
  const { homeAccessCode, homeAddress } = body;

  // The shared secret a home user must give on top of their PIN. Stored
  // hashed like a PIN; blank switches home access off. Length rules are shared
  // with the Home Access card (shared/settingsRules.js).
  if (homeAccessCode !== undefined) {
    const problem = homeAccessCodeProblem(homeAccessCode);
    if (problem) return { error: problem, field: 'homeAccessCode' };
    updates.home_access_code = homeAccessCode ? await bcrypt.hash(homeAccessCode, 10) : '';
  }

  // The address staff type from home — purely for display on the card; the
  // tunnel itself is set up in Cloudflare, not here.
  if (homeAddress !== undefined) {
    const problem = homeAddressProblem(homeAddress);
    if (problem) return { error: problem, field: 'homeAddress' };
    updates.home_address = String(homeAddress || '').trim();
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
