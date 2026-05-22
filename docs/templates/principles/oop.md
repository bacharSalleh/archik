<!-- archik:principles:oop -->
# Coding principles — Object-Oriented

The rules below govern *how code is written* once the archik loop reaches
BUILD. They sit underneath the engineering loop, not beside it: the loop
decides *what* to build and *in what order*; these decide *how the code is
shaped*.

## Separation of concerns

- One module, one reason to change. A file that mixes HTTP parsing,
  business rules, and persistence is three modules wearing one name.
- Map concerns onto the ECB stereotypes already in the archik model:
  **boundary** code handles I/O and translation, **control** code holds
  use-case logic, **entity** code owns state and invariants. Don't let a
  boundary make business decisions or an entity reach for the network.
- A function does one thing at one level of abstraction. If you need "and"
  to describe it, split it.

## Composition over inheritance

- Default to composition. Inheritance is for genuine *is-a* substitutability,
  not code reuse — reuse via collaborators, not base classes.
- Prefer small objects that delegate to injected collaborators over deep
  class hierarchies. Depth past two levels is a smell.
- Program to an interface (or the narrowest type that works), not a
  concrete class, at module boundaries.

## SOLID

- **S**ingle responsibility — see separation of concerns above.
- **O**pen/closed — extend behavior by adding a collaborator or
  implementation, not by editing a switch that grows with every case.
- **L**iskov — a subtype must be usable anywhere its supertype is, with no
  surprises. If an override throws "not supported," the hierarchy is wrong.
- **I**nterface segregation — many small role interfaces beat one fat one.
  Callers depend only on the methods they use.
- **D**ependency inversion — high-level policy depends on abstractions;
  details (DB, HTTP, clock) are injected. This is what makes control logic
  testable without the world attached.

## Design patterns — used judiciously

- Patterns are a vocabulary, not a goal. Reach for one when the forces it
  resolves are actually present (e.g. Strategy when behavior varies by case,
  Adapter at an external boundary, Repository to hide persistence).
- Never introduce a pattern speculatively. A factory with one product or a
  strategy with one strategy is accidental complexity — delete it.
- Name the pattern in a comment only when the WHY isn't obvious from the
  code.

## Clean code

- Names carry intent: `unsettledInvoices`, not `data2`. A good name removes
  the need for a comment.
- Small functions, few parameters. Past three or four parameters, introduce
  a value object.
- No dead code, no commented-out blocks, no speculative generality (YAGNI).
- Encapsulate state: expose behavior, not raw fields. Invariants live with
  the data they constrain so they can't be violated from outside.
- Fail fast and explicitly. Validate at the boundary; let control and
  entity code assume valid input.
- Comments explain *why*, never restate *what* (this mirrors the loop's
  hard rules).

## How this interacts with the loop

- These principles shape the BUILD phase. They never override a HITL gate or
  the requirements/structure/behavior/code ordering.
- If applying a principle would change the component graph (e.g. extracting
  a new control object), that's a structural change — go back through the
  archik sidecar, don't just refactor silently.
