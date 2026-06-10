# Truth Chain

> Intent: Prove a model is true at every altitude — against itself, against the code, and against production.

## The idea in one line

One check is an opinion; a chain of independent checks at different
altitudes is proof.

## Structure

```
model ──(validate)── is the model consistent with itself?
model ──(drift)───── does the model match the source code?
model ──(traffic)─── does the model match what production really does?
```

Each check has a different blind spot, so together they cover what
no single check can:

| Check | Catches | Blind to |
| --- | --- | --- |
| Self-consistency | broken references, rule violations | reality |
| Code comparison | renamed/moved/deleted code | runtime behaviour |
| Production comparison | calls nobody declared | code that never runs |

## When to use

- You keep a model/diagram/spec of a system that changes under you.
- "The docs are stale" is a sentence people say in your team.
- A self-evolving system needs ground truth to learn against —
  without it, the system optimizes toward its own mistakes.

## Rules that keep it safe

1. Checks must be **independent** — different inputs, different code.
2. Each check is **mechanical and CI-gateable** (exit code, JSON).
3. Undeclared reality **fails** the check; declared-but-unseen is a
   warning (it may simply not have run yet).

## Trade-offs

- Three checks to maintain instead of one.
- Production comparison needs tracing infrastructure (e.g. OTel).

## Blueprint

Doc-only pattern — in your diagram, give the three verifier components
edges pointing at the model node, each labelled with its altitude.

## Seen in archik

`archik validate` (model vs itself), `archik drift --edges` (model vs
the import graph), `archik otel check` (model vs production traffic).
