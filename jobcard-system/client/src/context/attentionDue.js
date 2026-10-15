// What the "Needs your attention" window shows, decided in one place. The order is: your
// clock first, then any stop form still owed, then the questions. The questions wait for
// every other window to close (and for the owed-form check) unless they are already up.
export function decideAttention({
  flagged, stopJobOpen, mentionJobOpen, checkingOwed, rereadingMentions,
  otherWindowOpen, mentions, mentionsHeld
}) {
  // The clock question never shows over the stop form.
  const clock = !stopJobOpen ? (flagged[0] || null) : null;
  const mentionsEligible = mentions.length > 0 && !stopJobOpen && !mentionJobOpen && !rereadingMentions;
  const mentionsShowing = mentionsEligible && (mentionsHeld || (!checkingOwed && !otherWindowOpen));
  const mentionRows = mentionsShowing ? mentions : [];
  // Why the rows can't be pressed yet (null: they can).
  const mentionsWaitReason = !mentionsShowing ? null : clock ? 'clock' : checkingOwed ? 'checking' : null;
  return { clock, mentionRows, mentionsWaitReason, showing: !!clock || mentionsShowing };
}
