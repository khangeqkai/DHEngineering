# Hunt 6 — a clock left running stops itself (round 22)

Hunt 6 — the forgotten-clock work. Started on top of commit 71af05b with that whole feature still uncommitted in the working tree (so `git diff HEAD` is the feature, not this hunt's fixes). Committed together with the feature at the end of the hunt.

Round 22 — the forgotten-clock feature:
- After "Yes, start my clock again" the open job screen now reloads its running clock and work list (and the page behind reloads after either answer).
- The question can be got past when its run or job was deleted while it was showing.
- A manager's edit form opened before the worker answered no longer writes the old automatic finish back over the worker's answer.
- The pop-up job screen keeps its stop form in development mode (no endless reopen).
- A "still working" answer records the changed note and sign-off requirement in the trail.
- A finish typed by the worker is no longer dropped silently when the office settles the run while the question is showing.
- Owner decision A (built and independently reviewed): every finished run of the worker's own still waiting for its stop form comes back at sign-in as the must-fill form; old abandoned forms are cleared once at the first boot of this version.
- Owner decision B (built and independently reviewed): "still working" closes the old run and starts the new clock as one step; a clock started that way is never discarded as an accidental tap.

| # | Area | Found | Confirmed | Fixed | Sent to owner |
|---|---|---|---|---|---|
| 22 | Timers, logged work, job status — the forgotten-clock feature | 19 | 8 | 6 | 2 |
