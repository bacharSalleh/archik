# The evolution loop

**The main point:** archik can watch how it is used, find its own weak
spots, and propose its own upgrades — but a human approves every change.

## Why this exists

Every day, archik already produces learning signals:

| You do this | The signal it carries |
| --- | --- |
| `archik suggest accept` | The AI's proposal was right |
| `archik suggest reject` | The AI's proposal was wrong |
| `archik validate` fails | The model (or a rule) has a weak spot |
| `archik drift` fails | The diagram and the code disagree |
| A command errors again | The tool or its docs have a gap |

Before the loop, these signals disappeared. Now they are recorded and
turned into improvements.

## The six stages

```
observe → reflect → propose → validate → apply → measure
```

### 1. Observe

Turn it on once per project:

```bash
archik evolution enable
```

From then on, every finished CLI command appends one line to
`.archik/evolution/events.jsonl`. Example line:

```json
{"v":1,"ts":"2026-06-10T12:00:00.000Z","type":"command","command":"validate","flags":["json"],"outcome":"error","exitCode":1,"durationMs":120}
```

Privacy rules (hard-coded, not configurable):

1. **Local only.** Nothing ever leaves your machine.
2. **Names, not values.** The log stores command names, flag *names*,
   outcomes, and durations. Never file contents, never flag values.
3. **Opt-in.** No `enable`, no log.
4. **Fail-silent.** If logging breaks, your command still works.

### 2. Reflect

```bash
archik evolution reflect
```

Four deterministic rules read the log and look for patterns
(threshold: 3 occurrences):

| Rule | Fires when |
| --- | --- |
| rejection-streak | suggestions get rejected more than accepted |
| recurring-validation-errors | `validate` keeps failing |
| recurring-drift | `drift` keeps failing |
| failing-command | one command keeps erroring |

Why deterministic rules and not an LLM? Because rules are testable,
free, and run offline. An LLM *can* reflect more deeply — the MCP
prompt `evolution-loop` tells any agent how — but the core loop never
needs one.

### 3. Propose

Each new insight becomes one YAML file in
`.archik/evolution/proposals/`. Example:

```yaml
id: p-2026-06-10-a1b2
status: pending
kind: skill-note
summary: Suggestions were rejected 4 times (1 accepted).
evidence:
  events: 4
  window: all
  samples:
    - 2026-06-09T10:00:00.000Z suggest_rejected
payload:
  note: Propose smaller, more focused diffs.
```

Evidence is always included — you can audit *why* the system thinks
this.

Agents can file richer proposals too: `archik evolution propose <file|->`.

### 4 + 5. Validate, then apply — through a gate

```bash
archik evolution proposals          # read what's pending
archik evolution approve <id>       # the gate
archik evolution reject <id>        # also fine — and recorded
```

What "apply" means depends on the proposal kind:

| Kind | Where it lands |
| --- | --- |
| `skill-note` | appended to `.archik/evolution/learned.md` (the [learned overlay](./learned-overlay.md)) |
| `update-node`, `add-exception` | staged as a **suggestion sidecar** — you see a green/red diff on the canvas and finish with `archik suggest accept` |

So a diagram-touching self-change passes **two** human steps: approve
the proposal, then accept the sidecar. The system never modifies
itself silently. A proposal that would make the document invalid is
refused at approve time.

### 6. Measure

```bash
archik evolution report
```

Compares the last 7 days against the 7 before: error rate, suggestion
acceptance rate, validate/drift failures, proposals applied. If an
applied proposal helped, you see it here. If not — that is also worth
knowing.

## One full walk-through

```bash
archik evolution enable
# ... days of normal work; three suggestions get rejected ...
archik evolution reflect
#   p-2026-06-14-9f2c  Suggestions were rejected 3 times (0 accepted).
archik evolution proposals show p-2026-06-14-9f2c
archik evolution approve p-2026-06-14-9f2c
# → note lands in learned.md; next session, Claude reads it and
#   proposes smaller diffs
archik evolution report      # a week later: acceptance rate up?
```

## For other agents (MCP)

Tools: `archik_evolution_status / reflect / proposals / propose / report`.
Resources: `archik://evolution`, `archik://learned`.
Prompt: `evolution-loop` (turns the agent into a deeper reflect stage).

## Build this in your own system

The same loop, as components you can scaffold into your diagram:

```bash
archik patterns show evolution-loop
archik patterns apply evolution-loop
```
