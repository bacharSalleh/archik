# Feedback Pipeline

> Intent: Turn every user correction into a recorded signal a system can learn from.

## The idea in one line

Users already tell your system what is wrong — by rejecting, undoing,
and re-editing. Record those moments; they are free training data.

## Structure

```
user action (accept / reject / edit / undo / retry)
      ↓ capture at the boundary, not inside features
event log (append-only, sanitized, local)
      ↓
reflection (heuristics or LLM)  →  insights with evidence
```

## When to use

- Your system makes suggestions users can act on.
- You want learning signals **without** asking users to fill surveys.
- You are building toward an Evolution Loop and need its observe stage.

## Rules that keep it safe

1. **Capture at one boundary** (dispatcher, middleware, API gateway) —
   features stay unaware they are observed.
2. **Sanitize at capture time.** Record *that* something happened and
   its outcome — names and counts, never contents or values.
3. **Failure to record must never break the user's action.**
4. **Opt-in.** The user turns the pipeline on, and can read every
   byte it stores.

## Trade-offs

- Boundary capture sees less detail than in-feature capture; start
  coarse, add detail only where an insight needs it.
- Logs grow; rotate or window them.

## Blueprint

Doc-only pattern — model it as `cli/gateway --writes--> event-log` plus
`reflect-engine --reads--> event-log` (see Evolution Loop blueprint).

## Seen in archik

The dispatcher hook in `src/cli/observe.ts`: every finished command
appends sanitized events to `.archik/evolution/events.jsonl`, and
`suggest accept` / `suggest reject` become first-class accept/reject
signals — the corrections the loop learns from.
