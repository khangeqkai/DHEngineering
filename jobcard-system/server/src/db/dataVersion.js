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
// out again (3, 4 and 5 were a one-time pass that marked clocks open before self-stopping
// clocks existed, and its marker; all since removed): backups stamped with them exist.
// 6 dropped the unused jobcards.photos column.
// 7 trims a stored job folders location that ended in spaces.
const DATA_VERSION = 7;

module.exports = { DATA_VERSION };
