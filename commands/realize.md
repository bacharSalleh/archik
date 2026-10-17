---
description: Make the code match the architecture the architect changed
---

# /archik:realize — make the code match the model

The architect steers the architecture on the canvas: moves a box into
another module, draws or deletes an edge, sets a layer or a style. The
model changes first; the code has not caught up. Your job is to close
that gap — and only that gap.

`$ARGUMENTS` (optional) narrows the work to one node or area.

## CLI-only for architecture

Read the model only through `npx archik`. Change it only through
`npx archik suggest set` (the lifecycle flips below). Never edit
`.archik/*.yaml` by hand.

## Steps

1. **Get the work list.**
   ```bash
   npx archik gap --json
   ```
   Each task has a `type` and a `text`:
   - `move-code` — move the node's code from `from` to `to`, then fix
     every import that pointed at the old path.
   - `create-code` — create the code for a planned node at `path`.
   - `style-break` — an import breaks the architecture style. Fix it
     the way the message says (usually: add an interface / port in the
     inner layer and depend on that).
   - `remove-import` — the architect deleted that edge. Remove the
     import (move the logic, or call through an allowed node).
   - `add-dependency` — the model says A uses B; wire the import.
   - `finish` — the node's code now exists; flip it to `active`.

   If the list is empty, say so and stop.

2. **Read why.** For each node in the list, read the newest decision
   record that mentions it in `.archik/decisions/` (plain markdown —
   read it directly). Keep to the intent: a move into `billing` means
   the code now belongs to billing, not just a new folder name.

3. **Check the rules before you edit.**
   ```bash
   npx archik style
   npx archik q describe <id>     # the "style:" line: layer / module, may depend on
   ```

4. **Plan, then wait for "approve".** A numbered, file-level plan:
   which folders move, which imports change, which files are created.
   Keep it to the gap. No drive-by refactors.

5. **Do it in small commits.** Move with `git mv` so history follows
   the code. After each step run the project's tests and typecheck.

6. **Flip finished nodes to active.** When `gap` lists `finish`
   tasks, stage one sidecar that removes `status: proposed` from those
   nodes, with a short decision record (context: the code landed;
   decision: mark it active; alternative: keep it proposed until
   deploy; consequence: drift now checks it):
   ```bash
   npx archik suggest set --note "<nodes> are built" - <<'YAML'
   ... full document, those nodes without status: proposed ...
   metadata:
     suggestion:
       decision: { context: ..., decision: ..., alternatives: [...], consequences: ... }
   YAML
   ```

7. **Verify — the gap must be empty.**
   ```bash
   npx archik gap          # ✓ the code matches the model
   npx archik validate
   npx archik drift
   npx archik smells       # no NEW folder loops
   ```
   Plus the project's tests, lint and build.

## If the model is wrong

If moving the code shows the architect's change cannot work (a cycle,
a missing port, a hidden caller), STOP. Explain what you found with the
file evidence, and propose the fix with `/archik:suggest` — don't bend
the code around the model, and don't change the model silently.

## Done when

`npx archik gap` prints "the code matches the model", tests pass, and
the finished nodes are `active`. End with one line on what changed and
the next step.
