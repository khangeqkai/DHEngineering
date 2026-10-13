// What shape the stored data is in. Raise this by one in every release that
// changes stored data — a new or dropped column or table, or a startup
// conversion in legacyMigrations.js that rewrites values.
//
// Every backup carries the number it was made at. A restore refuses a backup
// with a higher number than its own: that backup came from a newer version of
// the app, and restoring it here would quietly drop whatever this version
// doesn't know about. Older backups (a lower number, or none at all) restore as
// before, and the startup conversions bring them up to date.
//
// A number once issued is never lowered, even when the change behind it is taken
// out again (3 was a one-time marking pass, since removed): backups stamped with it exist.
// 4: clocks open before self-stopping clocks existed are left running (marked
// auto_stop_exempt) by a marker-guarded startup conversion.
// 5: that conversion's marker moved to a key no earlier build wrote (clocks_open_before_auto_stop_exempt_at); the old key is cleared.
const DATA_VERSION = 5;

module.exports = { DATA_VERSION };
