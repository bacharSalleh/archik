<!-- archik:principles:functional -->
# Coding principles — Functional

The rules below govern *how code is written* once the archik loop reaches
BUILD. They sit underneath the engineering loop, not beside it: the loop
decides *what* to build and *in what order*; these decide *how the code is
shaped*.

## Purity

- Default to pure functions: output depends only on input, no observable
  side effect. Same arguments, same result, every time.
- A pure core is the testable core — it needs no mocks, no setup, no clock.
  Most BUILD logic should land here.
- When a function must do I/O, that's a signal it belongs at the edge, not
  in the core (see "side effects at the edges").

## Immutability

- Treat data as immutable. Produce new values instead of mutating existing
  ones; never reassign shared state in place.
- No shared mutable state across modules. Shared mutability is where
  concurrency bugs and spooky-action-at-a-distance live.
- Model state transitions as functions `oldState -> newState`, returned and
  threaded explicitly, not hidden in object fields.

## Composition

- Build behavior by composing small, total functions. The unit of reuse is
  the function, not the class.
- Prefer pipelines (`map` / `filter` / `reduce`, function composition) over
  imperative loops with accumulators when the intent is a transformation.
- Keep functions small and single-purpose so they compose cleanly. If a
  function resists composition, it's probably doing two things.

## Side effects at the edges

- Push effects (I/O, network, DB, randomness, time) to the boundary of the
  system; keep the interior pure. This maps directly onto the archik ECB
  model: **boundary** code performs effects, **control** code is pure
  orchestration, **entity** code is pure data + transitions.
- Make effects explicit and injected — pass the clock, the fetcher, the
  writer in, rather than reaching for globals. This is what makes the pure
  core testable.
- Isolate effectful code in thin, obvious shells so the dangerous parts are
  small and easy to review.

## Totality and explicit errors

- Prefer total functions: defined for every input in their type. Narrow the
  input type until the function can't fail, rather than guarding at runtime.
- Make failure a value, not a thrown surprise — return a Result/Option/union
  the caller must handle. No silent `null` leaks, no swallowed exceptions.
- Handle every case explicitly; let exhaustiveness checking catch the ones
  you forgot.

## Declarative over imperative

- Say *what*, not *how*. Express transformations and rules declaratively;
  let the runtime handle the stepwise mechanics where possible.
- Avoid hidden control flow. Data flow should be visible in the shape of the
  code.
- Comments explain *why*, never restate *what* (this mirrors the loop's
  hard rules).

## How this interacts with the loop

- These principles shape the BUILD phase. They never override a HITL gate or
  the requirements/structure/behavior/code ordering.
- If applying a principle would change the component graph (e.g. splitting a
  pure core out from an effectful shell as separate nodes), that's a
  structural change — go back through the archik sidecar, don't just
  refactor silently.
