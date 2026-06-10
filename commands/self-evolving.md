---
description: Design a self-evolving architecture for an idea, using the pattern library
argument-hint: <the system idea, e.g. "a code-review bot that learns">
---

# /archik:self-evolving — from vague idea to self-evolving architecture

The user wants a system that **improves itself over time**, and they
gave you the idea in `$ARGUMENTS`. Your job: guide them from that idea
to a concrete architecture with an evolution loop — designs, use
cases, and a staged diagram they can accept or reject.

If `$ARGUMENTS` is empty, ask for the idea in one sentence first.

## CLI-only — do not touch archik files directly

All diagram reads go through `npx archik q`, all diagram writes
through `npx archik suggest set` or `npx archik patterns apply`.
Never `Read`/`Write`/`Edit` files under `.archik/`.

## Steps

1. **Load the pattern library** — this is your design vocabulary:
   ```
   npx archik patterns list
   npx archik patterns show evolution-loop
   ```
   Read the other patterns (`sidecar-approval-gate`, `learned-overlay`,
   `truth-chain`, `feedback-pipeline`) as they become relevant.

2. **Interview briefly** (3 questions max, one at a time):
   - Who corrects the system today? (those corrections = the feedback signal)
   - What change should the system be able to make to itself?
   - Who must approve a self-change before it lands?
   No feedback signal = no evolution loop; help them find one first.

3. **Ground in the current diagram** (`npx archik q stats`, `q list`).
   If the project is empty, model the *base system* first — actors,
   then one use case to ship, per the normal archik opening move.

4. **Map the idea onto the loop.** For each stage, name the concrete
   component in THEIR system:
   | Stage | Their component |
   | --- | --- |
   | observe | what gets logged, where |
   | reflect | which rules find patterns |
   | propose | where proposals live, who reads them |
   | validate | what check keeps a bad self-change out |
   | apply | the approval gate (use sidecar-approval-gate) |
   | measure | the one metric that proves improvement |

5. **Stage the architecture.** Two routes, both gated:
   - Generic start: `npx archik patterns apply evolution-loop`
     (stages the blueprint as `status: proposed` nodes), then refine
     ids/names with a follow-up `suggest set`.
   - Tailored: author the full end-state and stage via
     `npx archik suggest set --note '…' - <<'YAML' … YAML`.

6. **Wire the requirements.** Author a use case for the loop itself
   (`/archik:usecase` conventions): slices like "corrections are
   recorded", "insights become proposals", "approved change applies",
   each naming test paths.

7. **Hand over.** Show the canvas URL, summarize which patterns you
   used and why, and point at `npx archik evolution enable` if they
   want archik's own loop watching this project too. **Wait for the
   user to accept/reject — never accept the sidecar yourself.**
