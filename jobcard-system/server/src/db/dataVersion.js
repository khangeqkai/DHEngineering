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
// 8 adds the job_note_reads table (who has read which job's comments) and stamps the
// comments_read_from launch baseline.
// 9 adds the job_note_mentions table (who was @mentioned in which comment, and whether they have answered).
// 10 reshapes old job trail entries once. The rules live in db/trailEntries.js (pure, tested without a database);
// legacyMigrations.js only selects the rows and writes the results back. In order, per entry:
//   1. rename the old "item" part keys to "part" keys;
//   2. split an entry holding several part changes into one entry per part;
//   3. fill the part on part add/remove/edit entries from their recorded summary;
//   4. copy the recorded part name onto time block entries;
//   5. copy the recorded worker change onto manual add/delete time block entries as the worker name;
//   6. name the worker on auto-stop entries from the entry's own account;
//   7. name the person on assign/unassign entries where the stored lists give one exact answer.
const DATA_VERSION = 10;

module.exports = { DATA_VERSION };
