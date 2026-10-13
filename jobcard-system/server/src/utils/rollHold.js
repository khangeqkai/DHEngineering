// Whether the forgotten-clock roll (utils/timerPause.js) may cut anything yet.
//
// The roll cuts nothing until the startup conversion that protects clocks open before
// self-stopping clocks (exemptClocksOpenBeforeAutoStop in db/legacyMigrations.js) has
// succeeded in this process, or found its marker already there. A failure holds the roll
// until a later successful run: the next start, or the conversion pass a backup restore runs.
// Kept in memory for the life of the process, so no settings read is needed per roll.
// Requires nothing, so both sides can load it without a require cycle.
let held = true;

function holdRoll() {
  held = true;
}

function releaseRoll() {
  held = false;
}

function isRollHeld() {
  return held;
}

module.exports = { holdRoll, releaseRoll, isRollHeld };
