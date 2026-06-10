# Self-evolution patterns

**The main point:** "self-evolving" is not magic — it is five small,
named patterns you can combine. Archik ships them as a library:
`archik patterns list`.

## The five patterns

| Pattern | Intent (one line) | Blueprint? |
| --- | --- | --- |
| **Evolution Loop** | Improve the system in small, safe, visible steps | yes — `patterns apply evolution-loop` |
| **Sidecar Approval Gate** | Machines propose via a sidecar file; humans accept | doc-only |
| **Learned Overlay** | Approved lessons layered over a fixed prompt | doc-only |
| **Truth Chain** | Verify a model vs itself, the code, and production | doc-only |
| **Feedback Pipeline** | Every user correction becomes a recorded signal | doc-only |

Read any of them in full: `archik patterns show <id>`.

## How they fit together

The Evolution Loop is the spine; the other four are its organs:

```
Feedback Pipeline  →  feeds the loop's OBSERVE stage
Truth Chain        →  gives REFLECT ground truth to learn against
Sidecar Approval Gate → is the loop's APPLY gate
Learned Overlay    →  is where approved lessons LAND
```

A worked example — a code-review bot that learns:

1. **Feedback Pipeline:** record every time a human dismisses or
   edits one of the bot's review comments (at the API boundary,
   sanitized, opt-in).
2. **Evolution Loop / reflect:** "comments about naming get dismissed
   80% of the time in repo X."
3. **Propose:** a pending file: *"stop flagging naming in repo X
   unless the symbol is public."*
4. **Sidecar Approval Gate:** the team lead reads the proposal and
   approves it.
5. **Learned Overlay:** the rule is appended to the bot's overlay;
   the base prompt never changes.
6. **Measure:** dismissal rate for naming comments, before vs after.

## Picking your first pattern

| Your situation | Start with |
| --- | --- |
| Users correct your system but nothing records it | Feedback Pipeline |
| Your AI keeps making the same mistake | Learned Overlay |
| An agent edits files humans own | Sidecar Approval Gate |
| Your model/docs/spec goes stale | Truth Chain |
| All of the above work and you want them connected | Evolution Loop |

## Why patterns and not a framework?

Frameworks impose structure; patterns transfer understanding. Every
system has different events, different gates, different metrics — but
the *shapes* repeat. The library gives you the shapes, the rules that
keep them safe, and one reference implementation: archik itself.

In Claude Code, `/archik:self-evolving <your idea>` walks you from an
idea to a staged architecture using exactly this library.
