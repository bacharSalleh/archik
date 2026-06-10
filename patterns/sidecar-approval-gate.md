# Sidecar Approval Gate

> Intent: Let a machine propose changes to a file a human owns — without ever touching the file itself.

## The idea in one line

The machine writes its draft to a *sidecar* file next to the real one;
the human sees a diff and decides; only "accept" touches the real file.

## Structure

```
main.yaml                  ← owned by the human, never written by the machine
main.suggested.yaml        ← the machine's full proposed end state
        │
   [show diff]  →  human  →  accept (sidecar replaces main)
                          →  reject (sidecar deleted)
```

## When to use

- An AI agent (or any tool) wants to edit configuration, models,
  or documents that a human is responsible for.
- You want review to be a *diff*, not a wall of text.
- You want "no" to be cheap: rejecting must cost one command.

## Rules that keep it safe

1. The sidecar holds the **complete end state**, not a patch — so the
   diff is always computable and the apply is always atomic.
2. The sidecar passes **the same validation** as the real file. An
   invalid draft never reaches the human.
3. The machine **refuses to write the main file**, even if asked.
4. One pending sidecar at a time. A second proposal must wait.

## Trade-offs

- One extra file and one extra step per change.
- Whole-file proposals can conflict if the main file moves underneath;
  re-validate at accept time.

## Blueprint

Doc-only pattern (it is a workflow, not components) — model it as an
edge in your diagram: `agent --writes--> sidecar`, `human --reads--> diff`,
`gate --writes--> main`.

## Seen in archik

`archik suggest set / show / accept / reject`, and the canvas diff
overlay. The evolution loop reuses the same gate: an approved
`update-node` proposal becomes a sidecar, never a direct write.
