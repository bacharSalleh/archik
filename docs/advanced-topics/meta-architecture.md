# Meta-architecture — the decisions behind self-evolution

**The main point:** every design choice in archik's self-evolution
follows one principle — *bold loop, boring parts*. The loop is
ambitious; each piece is a plain file, a pure function, or an
existing mechanism reused.

## Decision log

### 1. Events are derived at the dispatcher, not inside commands

*Pattern: capture at the boundary (Feedback Pipeline).*

The observe hook lives in the CLI dispatcher (`src/cli/observe.ts`).
It derives semantic events — `suggest_accepted`, `validate_result` —
purely from `(command, subcommand, exit code)`. No command knows it
is being observed.

Why: zero coupling. Twenty-seven existing commands stayed untouched,
and a future command is observed automatically.

Trade-off accepted: boundary capture is coarse (we know *that*
validate failed, not *which rule*). Coarse signals proved enough for
v1 heuristics; detail can be added per-insight later.

### 2. The loop's core is deterministic; LLMs are a layer on top

*Pattern: functional core, imperative shell.*

`reflect(events) → insights` and `buildReport(events) → trends` are
pure functions with unit tests. An LLM can do deeper reflection — the
MCP `evolution-loop` prompt invites it to — but its output enters the
same pipeline (`evolution propose`), passes the same validation, and
waits at the same gate.

Why: a self-improving system whose self-analysis is untestable would
be a hidden hack — exactly what the loop must not be. Determinism
also means the loop works offline, with no API key, forever.

### 3. Self-changes reuse the suggestion sidecar

*Pattern: Sidecar Approval Gate.*

An approved `update-node` proposal does not write the diagram. It
stages `main.archik.suggested.yaml`, exactly as Claude's proposals
do. The user sees the same green/red canvas diff and runs the same
`suggest accept`.

Why: one write path means one validation path (schema, cross-file,
constraints) and one mental model. The alternative — a second,
evolution-specific write path — would have doubled the audit surface.

### 4. State is plain files under `.archik/evolution/`

config.yaml (opt-in flag) · events.jsonl (append-only log) ·
proposals/*.yaml · learned.md.

Why: archik's whole philosophy is "the model is readable files in
your repo." The loop's memory follows the same rule, so you can
inspect, diff, and delete every byte of what the system knows about
itself. JSONL specifically: append is atomic enough, corrupt lines
skip cleanly (and are counted in `evolution status`).

### 5. Observation is opt-in, even though that costs data

Why: trust is the scarce resource for self-evolving tools. A tool
that silently logs usage — even locally — teaches users to distrust
the rest of the loop. `archik evolution enable` is one command; the
trade is worth it.

### 6. Rejection is recorded

`evolution reject` appends a `proposal_rejected` event. The next
reflect cycle sees it.

Why: "no" is the highest-value training signal a human gives. A loop
that only learns from "yes" optimizes toward nagging.

### 7. The naming: why `evolution`, not `evolve`

`/archik:evolve` (slash command) already means "propose a refactor of
the user's architecture." The loop is about archik improving *itself*.
Overloading the word would have blurred exactly the boundary that
matters most here: whose system is changing.

## The shape of the whole

```
                 ┌──────────── measure (report) ◄─────────────┐
                 │                                            │
 CLI runs ──► events.jsonl ──► reflect ──► proposals ──► approve gate
 (observe)      (plain file)   (pure fn)   (plain files)      │
                                               ▲              ├─► learned.md (overlay)
                 MCP agents / Claude ──────────┘              └─► suggestion sidecar ─► suggest accept
                 (deeper reflection via `evolution propose`)
```

Archik's own `.archik/` models this subsystem — run `archik dev` in
the archik repo to see the loop drawn with the tool it lives in.
