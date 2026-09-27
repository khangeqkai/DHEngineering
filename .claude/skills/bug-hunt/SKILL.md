---
name: bug-hunt
description: Run a multi-round, multi-agent bug hunt over the job card app — each round aims 5 hunters at one area, verifies findings, fixes root causes, reviews the fixes, and commits; design-level fixes go to the owner instead of being patched. Use when the user asks for a bug hunt, a sweep before a release/delivery, "keep finding and fixing bugs", or to re-run the loop. Args (optional): number of rounds, and areas or a focus to aim at.
---

# Bug hunt loop

A repeatable loop that finds and fixes real bugs, fixes the **cause** not the symptom, and only stops to ask the owner when a proper fix needs a design change. It replaces running `/code-review` by hand over and over, where every run starts from scratch and never reaches zero.

The owner reads plain language only (CLAUDE.md God Rule #2). Every message to them describes what a person sees, never code names.

## Why it works — keep these properties

1. **One memory file.** `tasks/bug-hunt-log.md` holds the rules, everything fixed, everything decided "leave alone", and everything waiting for the owner. Every agent reads it first, so nobody re-reports or undoes a decision. It is the memory; the coordinator's context is not.
2. **Bugs only.** Tidying, renaming, repeated code and paper speed-ups are out unless they are the *cause* of a real bug. A reviewer always finds *something*; "zero findings" is the wrong finish line.
3. **Exact steps or it isn't a finding.** "Looks risky" is rejected.
4. **A sceptic before any fix.** The checker tries to prove each finding wrong, finds the root cause and whether the same mistake exists elsewhere, and sorts it: fix / owner / reject.
5. **A fresh fixer per round**, then an independent fix checker that reads the diff and every other reader of what changed. There are no automated tests, so the fix checker is the safety net.
6. **The coordinator only coordinates.** It starts rounds, reads short results, updates the log, commits, and tells the owner. It does not fix bugs itself (context would run out over many rounds).

## Before round 1

1. Pull the latest work onto the development branch (fast-forward from main if the branch is behind).
2. Install packages in `jobcard-system/server` and `jobcard-system/client` if `node_modules` is missing (cloud sandbox only — on the owner's WSL machine never run `npm install`; `node_modules` is shared with Windows).
3. Run `.claude/skills/bug-hunt/check.sh` once. It must print `BUILD OK` and `SERVER BOOT OK`. Set `BUG_HUNT_SCRATCH` to a scratch folder if you have one.
4. Create `tasks/bug-hunt-log.md` if it doesn't exist (sections: Rules of the hunt, Waiting for the owner, Decided — leave alone, Fixed, Rounds table). If it exists from an earlier hunt, keep it — its "Fixed" and "Decided" lists stop repeats. Commit it.
5. Agree with the owner: number of rounds (default 10), and confirm small fixes may be committed straight to the branch while design changes wait for them.

## Areas (one per round, riskiest / most recently changed first)

Default order used for the first final-delivery hunt — reorder by what changed most recently (`git log --stat`):

1. Pricing sheet (costing) and the job screen
2. Job details: customer box, suggestion lists, parts, suppliers
3. Database start-up, upgrades, backup and restore, settings
4. Workshop Statistics
5. Management pages: customers, suppliers, users, quality levels, tags, equipment
6. Sign-in, sessions and who-can-see-what across the whole app
7. Timers, logged work, overtime, job status
8. Files, folders, printing, Excel exports
9. Job list, numbering, search, comments, activity record
10. Delivery and speed: installer, first start, offline, serving, ~3 years of data

For each area, write a `focus` naming the files to start in, the matching `docs/notes/*.md`, the key questions, and what earlier rounds changed nearby (so hunters check those fixes didn't break neighbours).

## Running a round

Run the round script with the Workflow tool (the owner must have opted into multi-agent work — asking for a bug hunt or invoking this skill counts). 8 agents per round: 5 hunters (user flow, permissions, bad data, awkward situations, house rules) → 1 checker → 1 fixer → 1 fix checker, plus one retry of fixer + checker if any fix fails review.

```
Workflow({
  scriptPath: "<repo>/.claude/skills/bug-hunt/round.js",
  args: {
    repo: "<absolute repo path>",
    log: "<absolute path>/tasks/bug-hunt-log.md",
    check: "<absolute path>/.claude/skills/bug-hunt/check.sh",
    round: 1,
    area: "…",
    focus: "…",
    scope: "optional — overrides 'bugs only' wording",
    carried: [ /* confirmed-but-unfixed items from the last round, see below */ ]
  }
})
```

The fixer batch is capped at 10, most severe first; the rest come back as `carried`.

## After each round

1. Summarise: `python3 .claude/skills/bug-hunt/summarize.py <workflow output file>`. It prints verdicts, fixes, review results and owner proposals, and saves `carried.json`.
2. **Fixes that still fail review after the retry:** read the fix checker's exact problem. If it is precise and small, send one focused fixer (Agent tool) with those exact instructions, then one short independent re-check. If the proper fix needs a design change, **revert that fix completely** (keep the others) and put it under "Waiting for the owner" with a plain proposal. Never commit a fix that failed review.
3. **Owner items** → add to "Waiting for the owner" in the log with the options in plain words; send one phone notification (PushNotification) per round that adds any. Don't stop the loop — keep going with other areas.
4. **Carried items** → pass as `args.carried` to the next round. If the same low-severity items get pushed back two rounds running, clear them with one focused fixer between rounds instead.
5. Run `check.sh` yourself. Update the log (a "Round N" section under Fixed, a row in the Rounds table). Commit (one or two commits per round, grouped by area; technical commit messages are fine) and push.
6. Tell the owner in plain language: the most important bugs as "expected X, but Y happened → now Z", the count so far, and the next area.

## Finishing

- After the last round, append a **"Test these by hand"** list to the log: one click-through per screen the hunt changed, written as "do this → you should see that". No automated tests exist, so this is the gap-filler.
- Send one final phone notification. Summarise: total fixed, questions waiting, where the hand-test list is. Offer a pull request; don't open one unless asked.
- When the owner answers a waiting question: move it to "Decided — leave alone" (or implement it, then have it independently reviewed like any fix).

## Lessons from the first run

- **Don't commit while an agent is still editing.** If a stop hook asks for a commit mid-edit, explain and wait; commit when the agent reports and checks pass. If the work is big and a review is still running, it's fine to commit it marked "(under review)" and push follow-up fixes on top — tell the owner not to build from it until the review is done.
- **A fix that creates a new wrong case is worse than the bug.** Round 4's "credit reused machine numbers to the right machine" made things wrong in a new way; reverting it and asking the owner was right (the owner said numbers are never reused).
- **Data-moving startup conversions** get extra scrutiny: never delete or overwrite a person's file, retry until a full pass succeeds, stay cheap on a slow network drive, and re-run after a backup restore.
- **Explain design questions for a newcomer.** When the owner says "I don't understand", tell it as a story with a concrete Monday-to-Friday example, then give one recommendation.
- A round takes ~30–40 minutes and ~1.5M sub-agent tokens; mention the cost when agreeing the number of rounds.
