# Learned Overlay

> Intent: Let an AI system get smarter across sessions without changing its code or base prompt.

## The idea in one line

Keep the base prompt fixed; append approved lessons to a separate
file the AI reads at the start of every session.

## Structure

```
base prompt / skill   (fixed, versioned, shipped)
        +
learned.md            (grows over time, one approved note per line)
        ↓
   the agent reads BOTH and behaves better than last week
```

## When to use

- The same correction keeps being made to the AI's behaviour.
- You cannot (or do not want to) redeploy a prompt for every lesson.
- You need an audit trail: *why* does the agent behave this way?

## Rules that keep it safe

1. **Append-only, human-gated.** A note enters the overlay only
   through an approval step (see Evolution Loop).
2. **Every note carries its origin** — date and proposal id — so any
   behaviour can be traced back to evidence.
3. **The overlay is plain text in the repo.** Review it, diff it,
   delete a bad lesson with a normal commit.
4. Keep it short. If the overlay grows past a page, promote stable
   lessons into the base prompt and clear them from the overlay.

## Trade-offs

- The overlay consumes context tokens each session.
- Conflicting notes confuse the agent — the approval gate must reject
  notes that contradict existing ones.

## Blueprint

Doc-only pattern — model it as a node `learned-overlay` (kind:
`prompt`) with an edge `agent --reads--> learned-overlay`.

## Seen in archik

`.archik/evolution/learned.md`, written only by
`archik evolution approve`, read by the archik Claude skill at session
start and exposed to other agents as the MCP resource `archik://learned`.
