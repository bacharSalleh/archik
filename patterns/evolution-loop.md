# Evolution Loop

> Intent: Make a system improve itself in small, safe, visible steps.

## The idea in one line

The system watches its own use, finds weak spots, suggests fixes,
and applies them — but only after a human says yes.

## The six stages

```
observe → reflect → propose → validate → apply → measure
   ↑                                                │
   └────────────────────────────────────────────────┘
```

| Stage | Question it answers | Example |
| --- | --- | --- |
| Observe | What is really happening? | Log every command run and its outcome |
| Reflect | What patterns repeat? | "Validation failed 5 times this week" |
| Propose | What should change? | A written proposal file a human can read |
| Validate | Is the change safe? | Schema check + "would the system still work?" |
| Apply | Make the change — gated | Human approves; change lands as a normal diff |
| Measure | Did it actually help? | Compare error rates before and after |

## When to use

- Your system has users who correct it (accept/reject, edit, undo).
- The same mistakes happen again and again.
- You want improvement without a human redesigning things each time.

## Rules that keep it safe

1. **Observation is opt-in and local.** No silent data collection.
2. **Every proposal is a readable file.** Evidence included.
3. **Nothing applies without approval.** The gate is explicit.
4. **Rejection is also a signal.** The loop records "no" and learns from it.
5. **Measure or it didn't happen.** A change with no metric is a guess.

## Trade-offs

- Costs storage and a little time on every action (keep logging cheap).
- Deterministic heuristics find less than an LLM would — but they are
  testable and free. Best of both: deterministic core, LLM on top.

## Blueprint

`archik patterns apply evolution-loop` stages these components into
your diagram (as `status: proposed` nodes you fill in later):

- `evo-event-log` — append-only store of usage events
- `evo-reflect-engine` — pure rules: events in, insights out
- `evo-proposal-store` — proposals waiting for review
- `evo-approval-gate` — the human yes/no step
- `evo-learned-overlay` — approved knowledge the system reads back
- `evo-metrics` — before/after trend reports

## Seen in archik

`archik evolution` implements this loop for archik itself:
events in `.archik/evolution/events.jsonl`, proposals in
`.archik/evolution/proposals/`, the gate is `archik evolution approve`,
and `archik evolution report` is the measure stage.
