# The learned overlay

**The main point:** archik's AI integration gets smarter across
sessions without anyone changing code or prompts — approved lessons
accumulate in one markdown file the AI reads at session start.

## The problem it solves

You correct Claude: "stop proposing giant diffs." It complies — until
the session ends. Next session, same mistake. The correction lived in
the chat log, and chat logs die.

## The mechanism

One file: `.archik/evolution/learned.md`. Example content:

```markdown
# Learned

- Recent architecture suggestions are mostly rejected. Propose
  smaller, more focused diffs... _(2026-06-10, p-2026-06-10-a1b2)_
- The diagram keeps drifting from the code. When code moves, update
  the node's `sourcePath` in the same change... _(2026-06-12, p-2026-06-12-c3d4)_
```

Who writes it: **only** `archik evolution approve` (a human gate).
Who reads it:

| Reader | How |
| --- | --- |
| The Claude Code skill | instructed to read it at session start and treat it as binding |
| Any MCP agent | resource `archik://learned` |
| You | it is plain markdown in your repo — diff it, review it, prune it |

## Why this design

1. **Append-only + provenance.** Every note carries a date and a
   proposal id. Any odd AI behaviour can be traced to the evidence
   that caused it.
2. **The base prompt stays fixed.** The skill is versioned and shipped;
   the overlay is per-project. Upgrading archik never erases lessons,
   and lessons never fork the skill.
3. **Deleting a lesson is a normal commit.** Bad lesson? `git revert`-
   grade simple. Compare that to retraining a model.

## Keeping it healthy

- **Keep it under a page.** The overlay costs context tokens every
  session. When a lesson has been stable for months, fold it into
  your project's CLAUDE.md (or propose it upstream) and remove it.
- **Reject contradictions at the gate.** Two notes that disagree are
  worse than none — `evolution approve` is where you catch that.
- **It is guidance, not configuration.** Hard rules belong in
  governance constraints (validated mechanically); the overlay is for
  judgment calls.

## The pattern, generalized

This is the **Learned Overlay** pattern — usable in any AI system:
fixed base prompt + gated, append-only lesson file + read-at-start.
Full pattern doc: `archik patterns show learned-overlay`.
