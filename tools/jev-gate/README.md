# jev-gate

A fast screen over the current changes, run before a human reads them.

It finds no bugs. It answers a handful of cheap questions in about two seconds
for a twentieth of a cent, which means it can run on **every** change. The slow,
thorough review then only has to run when this says something is off.

| Check | Question it answers |
|---|---|
| **Scope** | Was each piece of this change actually asked for? |
| **Rules** | Does anything break a house rule from CLAUDE.md? |
| **Risk** | Which files deserve a careful read, and which can be skimmed? |

## Use

```bash
# Record what you asked for. Do this once, at the start of a task.
node tools/jev-gate/gate.js intent "add a print column to the job list"

# Screen the working tree against it.
node tools/jev-gate/gate.js

# Other targets
node tools/jev-gate/gate.js --staged            # only what is staged
node tools/jev-gate/gate.js --base main         # a whole branch
node tools/jev-gate/gate.js --json              # machine-readable
node tools/jev-gate/gate.js --strict            # exit 1 on a hard finding
```

Run it before every commit instead, automatically:

```bash
./tools/jev-gate/install-hook.sh     # on
./tools/jev-gate/uninstall-hook.sh   # off
```

A single commit can always skip it with `git commit --no-verify`.

## How it decides

**Free before paid.** Anything an exact search settles — stored local time, a
font weight that does not exist, a raw browser pop-up, a past-tense audit action
— is a plain pattern match in `rules.js`. No model call, no cost, no false
positives. Only the rules that turn on *meaning* are sent to Jev.

**One call per hunk.** Every question that applies to a block of changed lines
travels in the same request, because they share the same state. Six changed
blocks is six calls, run six at a time.

**Thresholds are deliberately slack** (`gate.js`, `THRESHOLDS`). A gate that
cries wolf gets ignored, which is worse than no gate at all. Scope is flagged at
65% confidence, a rule break at 60%, and only a 75%+ rule break blocks a commit.
Exact pattern matches always block, because they cannot be wrong.

**The house rules police the app only.** Build tooling and third-party field
names answer to nobody.

## Adding a rule

In `rules.js`:

- If a search can settle it, add to `TEXT_CHECKS` — free and exact.
- Otherwise add to `JUDGEMENT_RULES`: which files it applies to, the yes/no
  question, what a yes means, what a no means, and the sentence shown when it
  fires. Keep to one narrow question; split anything with an "and" in it.

Six judgement rules per file is the practical ceiling before a request gets slow.

## Needs

Node 22+ and an OpenRouter key at `jobcard-system/server/.env`. No packages.

With no key it prints why and exits without blocking, so a fresh clone is never
stuck.
